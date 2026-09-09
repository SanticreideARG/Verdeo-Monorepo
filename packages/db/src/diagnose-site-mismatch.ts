/**
 * Diagnóstico de sólo lectura: ¿coincide la ciudad asignada a un cliente con la de su domicilio?
 *
 * Existe por un síntoma concreto: la lista de clientes, con Neuquén elegido arriba, mostraba
 * clientes con domicilio en Mendoza y teléfono con característica de Mendoza. Hay dos explicaciones
 * posibles y son muy distintas —el cliente está asignado a dos ciudades, o la pantalla no está
 * filtrando— y no se puede elegir entre ellas mirando la pantalla.
 *
 * Importa porque la ciudad de un pedido se deriva de la zona de la dirección de entrega (ADR-031),
 * mientras que la lista de clientes filtra por la membresía. Cuando las dos no coinciden, un cliente
 * aparece en una ciudad y sus pedidos se cuentan en otra.
 *
 * No escribe nada. Correr con: DATABASE_URL=<url> tsx src/diagnose-site-mismatch.ts
 */
import { sql } from 'drizzle-orm';

import { createDatabase } from './index.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const { client, db } = createDatabase(databaseUrl);

function rowsOf(result: unknown): Record<string, unknown>[] {
  return ((result as { rows?: Record<string, unknown>[] }).rows ?? result) as Record<
    string,
    unknown
  >[];
}

try {
  const cruce = await db.execute(sql`
    select cos_site.display_name as ciudad_asignada,
           addr_site.display_name as ciudad_del_domicilio,
           count(distinct c.id)::int as clientes
    from customers c
    join customer_operating_sites cos
      on cos.customer_id = c.id and cos.status = 'active'
    join operating_sites cos_site on cos_site.id = cos.operating_site_id
    join customer_addresses a on a.customer_id = c.id and a.active = true
    join geographic_zones z on z.id = a.geographic_zone_id
    join operating_sites addr_site on addr_site.id = z.operating_site_id
    group by 1, 2
    order by 3 desc
  `);
  console.log('\n— Ciudad asignada vs. ciudad del domicilio —');
  console.table(rowsOf(cruce));

  const multiples = await db.execute(sql`
    select count(*)::int as clientes_en_mas_de_una_ciudad
    from (
      select customer_id
      from customer_operating_sites
      where status = 'active'
      group by customer_id
      having count(*) > 1
    ) t
  `);
  console.log('\n— Clientes con más de una ciudad activa —');
  console.table(rowsOf(multiples));

  const porCiudad = await db.execute(sql`
    select s.display_name as ciudad,
           count(distinct cos.customer_id)::int as clientes_asignados
    from operating_sites s
    left join customer_operating_sites cos
      on cos.operating_site_id = s.id and cos.status = 'active'
    where s.active
    group by 1
    order by 2 desc
  `);
  console.log('\n— Clientes asignados por ciudad —');
  console.table(rowsOf(porCiudad));

  const sinDomicilio = await db.execute(sql`
    select count(*)::int as clientes_sin_domicilio_activo
    from customers c
    where not exists (
      select 1 from customer_addresses a where a.customer_id = c.id and a.active = true
    )
  `);
  console.log('\n— Clientes sin domicilio activo —');
  console.table(rowsOf(sinDomicilio));

  /*
   * Y lo que importa para rutas: un pedido confirmado sólo entra en una hoja si su dirección de
   * entrega tiene coordenadas. Sin esto, "hay treinta pedidos y cero paradas" no se puede explicar.
   */
  const ruteables = await db.execute(sql`
    select s.display_name as ciudad,
           o.delivery_date as fecha_entrega,
           count(*)::int as confirmados,
           count(*) filter (
             where a.latitude is not null and a.longitude is not null
           )::int as geocodificados
    from orders o
    join operating_sites s on s.id = o.operating_site_id
    left join customer_addresses a on a.id = o.delivery_address_id
    where o.status = 'CONFIRMED'
    group by 1, 2
    order by 2 desc, 1
  `);
  console.log('\n— Pedidos confirmados por ciudad y fecha de entrega —');
  console.table(rowsOf(ruteables));
} finally {
  await client.end();
}
