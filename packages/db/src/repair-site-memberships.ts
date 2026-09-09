/**
 * Saca las membresías de ciudad que `seed.ts` repartió de más.
 *
 * Qué pasó: `seed.ts` asignaba Neuquén a TODOS los clientes de la base. Sobre una instalación nueva
 * es correcto —los únicos clientes son los de demostración, y son de Neuquén— pero corrido sobre una
 * base ya poblada le agrega una membresía a cada cliente existente. Pasó el 3 de septiembre de 2026
 * y dejó 220 clientes de Mendoza y Buenos Aires apareciendo también en la lista de Neuquén, porque
 * la lista de clientes filtra por membresía.
 *
 * Qué borra, y sólo eso: una membresía activa a una ciudad donde el cliente no tiene NINGÚN
 * domicilio activo, siempre que además tenga otra membresía que sí coincida con dónde vive. Las dos
 * condiciones juntas son las que hacen que esto sea seguro: nadie se queda sin ciudad, y un cliente
 * que legítimamente compra en dos ciudades —tiene domicilio en las dos— no se toca.
 *
 * Los pedidos no dependen de esto: la ciudad de un pedido se deriva de la zona de su dirección de
 * entrega (ADR-031), no de la membresía del cliente. Aun así el script lo verifica antes de borrar y
 * aborta si encuentra alguno, porque una comprobación barata sobre datos reales vale más que una
 * afirmación en un comentario.
 *
 * Es idempotente: correrlo dos veces no borra nada la segunda. Con `--dry-run` sólo informa.
 */
import { sql } from 'drizzle-orm';

import { createDatabase } from './index.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const dryRun = process.argv.includes('--dry-run');

const { client, db } = createDatabase(databaseUrl);

function rowsOf(result: unknown): Record<string, unknown>[] {
  return ((result as { rows?: Record<string, unknown>[] }).rows ?? result) as Record<
    string,
    unknown
  >[];
}

/**
 * La condición, escrita una sola vez.
 *
 * El informe previo y el borrado tienen que mirar exactamente las mismas filas: si divergen, lo que
 * se informa no es lo que se borra, y eso es peor que no informar nada.
 */
const sobrante = sql`
  cos.status = 'active'
    and not exists (
      select 1
      from customer_addresses a
      join geographic_zones z on z.id = a.geographic_zone_id
      where a.customer_id = cos.customer_id
        and a.active
        and z.operating_site_id = cos.operating_site_id
    )
    and exists (
      select 1
      from customer_operating_sites otra
      join customer_addresses a on a.customer_id = otra.customer_id and a.active
      join geographic_zones z
        on z.id = a.geographic_zone_id and z.operating_site_id = otra.operating_site_id
      where otra.customer_id = cos.customer_id
        and otra.status = 'active'
    )
`;

try {
  const detalle = await db.execute(sql`
    select s.display_name as ciudad, count(*)::int as membresias
    from customer_operating_sites cos
    join operating_sites s on s.id = cos.operating_site_id
    where ${sobrante}
    group by 1
    order by 2 desc
  `);
  const filas = rowsOf(detalle);

  if (filas.length === 0) {
    console.log('No hay membresías sobrantes. Nada que hacer.');
  } else {
    console.log('Membresías a quitar, por ciudad:');
    console.table(filas);

    // Antes de tocar nada: ningún pedido puede depender de la membresía que se va.
    const [enRiesgo] = rowsOf(
      await db.execute(sql`
        select count(*)::int as pedidos
        from orders o
        where not exists (
          select 1
          from customer_addresses a
          join geographic_zones z on z.id = a.geographic_zone_id
          where a.customer_id = o.customer_id and z.operating_site_id = o.operating_site_id
        )
      `),
    );
    const pedidosEnRiesgo = Number(enRiesgo?.pedidos ?? 0);
    if (pedidosEnRiesgo > 0) {
      throw new Error(
        `Hay ${String(pedidosEnRiesgo)} pedidos cuya ciudad no coincide con la zona de su dirección. ` +
          'Revisar eso antes de tocar las membresías: el borrado se aborta.',
      );
    }

    if (dryRun) {
      console.log('\n--dry-run: no se borró nada.');
    } else {
      const borradas = await db.execute(sql`
        delete from customer_operating_sites cos
        where ${sobrante}
        returning cos.customer_id
      `);
      console.log(`\nMembresías quitadas: ${String(rowsOf(borradas).length)}.`);
    }
  }

  const resumen = await db.execute(sql`
    select s.display_name as ciudad, count(distinct cos.customer_id)::int as clientes
    from operating_sites s
    left join customer_operating_sites cos
      on cos.operating_site_id = s.id and cos.status = 'active'
    where s.active
    group by 1
    order by 2 desc
  `);
  console.log('\nClientes por ciudad después de esto:');
  console.table(rowsOf(resumen));
} finally {
  await client.end();
}
