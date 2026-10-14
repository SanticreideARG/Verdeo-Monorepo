import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { AuditService } from '@verdeo/audit';

import type { Database } from './index.js';
import { PostgresAuditSink } from './repositories/postgres-audit-sink.js';

/**
 * Lo que la limpieza borró (o borraría, en seco).
 *
 * Arranque de producción, 2026-10-13: todo lo cargado antes del período en curso fue de prueba
 * —períodos, menús, pedidos, rutas, cobros y clientes ficticios— y no tiene que aparecer en las
 * estadísticas, que salen de los pedidos. El período en curso queda como el primero de producción,
 * con sus pedidos renumerados desde 00001.
 */
export interface PurgeSummary {
  cycles: string[];
  customers: string[];
  kept: { alias: string; id: string; openAt: string };
  /** Clientes cargados antes del período que se conservan porque tienen pedidos en él. */
  keptOldCustomers: string[];
  menus: number;
  orders: number;
  renumbered: { from: string; to: string }[];
  routes: number;
}

class DryRun extends Error {
  public constructor(public readonly summary: PurgeSummary) {
    super('dry-run');
  }
}

type Rows<T> = { rows: T[] };

/**
 * Borra los datos de prueba: los períodos anteriores al que está en curso, con todo lo que
 * cuelga de ellos, y los clientes cargados antes de ese período que no tienen pedidos en él.
 * Después renumera los pedidos del período en curso desde 00001 en cada ciudad.
 *
 * El período en curso es el que contiene el momento actual; si no hay ninguno abierto, el último
 * que ya empezó. Los posteriores (uno armado por adelantado) no se tocan.
 *
 * Todo en una transacción: o se borra todo o nada. Con `dryRun` hace exactamente lo mismo y al
 * final lo deshace, así lo que muestra es lo que pasaría y no una estimación. La auditoría no se
 * borra: es el registro de lo que pasó, incluida esta limpieza, que deja su propio evento.
 */
export async function purgeTestData(
  db: Database,
  options: { dryRun: boolean; now?: Date },
): Promise<PurgeSummary> {
  const now = options.now ?? new Date();
  /*
   * Las fechas van como texto ISO con su cast: el driver de producción (postgres.js) no sabe
   * mandar un `Date` suelto dentro de un `sql` crudo, aunque el de los tests (PGlite) sí.
   */
  const nowIso = now.toISOString();
  try {
    return await db.transaction(async (tx) => {
      // postgres.js (producción) devuelve la lista de filas; PGlite (tests), un objeto con `rows`.
      const run = async <T>(query: ReturnType<typeof sql>): Promise<T[]> => {
        const result = (await tx.execute(query)) as unknown as Rows<T> | T[];
        return Array.isArray(result) ? result : result.rows;
      };

      const [kept] = await run<{ alias: string; id: string; open_at: Date | string }>(sql`
        select id, alias, open_at from sales_cycles
        where open_at <= ${nowIso}::timestamptz
        order by (close_at >= ${nowIso}::timestamptz) desc, open_at desc
        limit 1`);
      if (!kept)
        throw new Error('No hay ningún período que ya haya empezado: no hay nada que conservar.');
      const keptOpenAt = new Date(kept.open_at);
      const keptOpenIso = keptOpenAt.toISOString();

      await tx.execute(sql`
        create temp table purge_cycles (id uuid primary key, alias text not null) on commit drop`);
      // Postgres no acepta parámetros en CREATE TABLE … AS: la tabla se crea vacía y se llena con
      // un INSERT, que sí los acepta.
      await tx.execute(sql`
        insert into purge_cycles (id, alias)
        select id, alias from sales_cycles
        where open_at < ${keptOpenIso}::timestamptz and id <> ${kept.id}::uuid`);
      await tx.execute(sql`
        create temp table purge_orders on commit drop as
        select id from orders where sales_cycle_id in (select id from purge_cycles)`);

      const cycles = (
        await run<{ alias: string }>(sql`select alias from purge_cycles order by alias`)
      ).map((row) => row.alias);
      const [{ total: orders } = { total: 0 }] = await run<{ total: number }>(
        sql`select count(*)::int as total from purge_orders`,
      );

      // Lo que impide borrar un pedido (restrict): cobros, rendiciones, conciliaciones y paradas.
      await tx.execute(sql`
        delete from cash_settlements where collection_id in (
          select id from cash_collections where order_id in (select id from purge_orders))`);
      await tx.execute(
        sql`delete from cash_collections where order_id in (select id from purge_orders)`,
      );
      await tx.execute(
        sql`delete from transfer_reconciliations where order_id in (select id from purge_orders)`,
      );
      await tx.execute(
        sql`delete from delivery_stops where order_id in (select id from purge_orders)`,
      );
      // Las rutas que quedaron vacías y son de antes del período en curso.
      const routes = await run<{ id: string }>(sql`
        delete from delivery_routes r
        where r.delivery_date < ${keptOpenAt.toISOString().slice(0, 10)}
          and not exists (select 1 from delivery_stops s where s.route_id = r.id)
        returning r.id`);
      // Ítems, historial, revisiones, pagos e indicaciones se van en cascada con el pedido.
      await tx.execute(sql`delete from orders where id in (select id from purge_orders)`);
      const menus = await run<{ id: string }>(sql`
        delete from weekly_menus where sales_cycle_id in (select id from purge_cycles) returning id`);
      // Producción real, fotos y bajas de excedente se van en cascada con el período.
      await tx.execute(sql`delete from sales_cycles where id in (select id from purge_cycles)`);

      // Clientes ficticios: cargados antes del período en curso y sin pedidos que queden.
      await tx.execute(sql`
        create temp table purge_customers (id uuid primary key, display_name text not null)
        on commit drop`);
      await tx.execute(sql`
        insert into purge_customers (id, display_name)
        select c.id, c.display_name from customers c
        where c.created_at < ${keptOpenIso}::timestamptz
          and not exists (select 1 from orders o where o.customer_id = c.id)`);
      const customers = (
        await run<{ display_name: string }>(
          sql`select display_name from purge_customers order by display_name`,
        )
      ).map((row) => row.display_name);
      const keptOldCustomers = (
        await run<{ display_name: string }>(sql`
          select distinct c.display_name from customers c join orders o on o.customer_id = c.id
          where c.created_at < ${keptOpenIso}::timestamptz order by c.display_name`)
      ).map((row) => row.display_name);
      // Las conversaciones apuntan a la identidad con restrict: se van antes que el cliente.
      await tx.execute(sql`
        delete from messaging_conversations
        where customer_id in (select id from purge_customers)
           or customer_identity_id in (
             select id from customer_identities where customer_id in (select id from purge_customers))`);
      // Lo que apuntaba a un cliente fusionado en uno que se borra queda suelto, no se borra.
      await tx.execute(sql`delete from customers where id in (select id from purge_customers)`);

      // Renumerar los pedidos que quedan desde 00001 en cada ciudad, en el orden en que se cargaron.
      // En dos pasos: el número es único, y pasar directo de 00118 a 00001 puede chocar con otro.
      const renumbered = await run<{ from: string; to: string }>(sql`
        with numerados as (
          select o.id, o.public_number as old_number,
            s.order_prefix || '-' || lpad(
              (row_number() over (partition by o.operating_site_id order by o.created_at, o.id))::text,
              5, '0') as new_number
          from orders o join operating_sites s on s.id = o.operating_site_id
        )
        select id, old_number as "from", new_number as "to" from numerados
        order by new_number`);
      await tx.execute(sql`update orders set public_number = 'TMP-' || id::text`);
      for (const row of renumbered as unknown as { id: string; to: string }[]) {
        await tx.execute(sql`update orders set public_number = ${row.to} where id = ${row.id}`);
      }
      await tx.execute(sql`
        insert into operating_site_order_counters (operating_site_id, last_order_number)
        select s.id, (select count(*) from orders o where o.operating_site_id = s.id)::int
        from operating_sites s
        on conflict (operating_site_id) do update
          set last_order_number = excluded.last_order_number, updated_at = now()`);

      const summary: PurgeSummary = {
        cycles,
        customers,
        kept: { alias: kept.alias, id: kept.id, openAt: keptOpenAt.toISOString() },
        keptOldCustomers,
        menus: menus.length,
        orders,
        renumbered: renumbered.map(({ from, to }) => ({ from, to })),
        routes: routes.length,
      };

      const correlationId = randomUUID();
      await new AuditService(new PostgresAuditSink(tx)).record({
        action: 'maintenance.test_data_purged',
        actor: { type: 'system' },
        after: {
          customers: customers.length,
          cycles: cycles.length,
          menus: summary.menus,
          orders,
          renumbered: summary.renumbered.length,
          routes: summary.routes,
        },
        correlationId,
        entityId: kept.id,
        entityType: 'sales_cycle',
        metadata: { deletedCycles: cycles, keptCycle: kept.alias },
        requestId: correlationId,
        source: 'cli:db:purge-test-data',
      });

      if (options.dryRun) throw new DryRun(summary);
      return summary;
    });
  } catch (error) {
    if (error instanceof DryRun) return error.summary;
    throw error;
  }
}
