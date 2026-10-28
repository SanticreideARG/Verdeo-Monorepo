import { sql, type SQL } from 'drizzle-orm';

import type { Database } from '../index.js';

/**
 * "Lo que pasó" en Estadísticas (STATS_REDESIGN_PLAN.md): eventos que salen de los datos, calculados
 * al momento. Cada uno sólo aparece si dice algo —un récord, un cambio fuerte, algo por revisar—, y
 * ninguno se guarda todavía: el historial y el "visto" quedan para una segunda etapa.
 *
 * Miran el período en curso (el mismo que eligen los consejos del tablero) contra los anteriores.
 */

export type StatsEventKind = 'ausentes' | 'cobro' | 'cocina' | 'hito' | 'mezcla' | 'record';
export type StatsEventTone = 'danger' | 'info' | 'success' | 'warning';

export interface StatsEvent {
  href: string | null;
  key: string;
  kind: StatsEventKind;
  text: string;
  tone: StatsEventTone;
}

type Row = Record<string, unknown>;

async function rows(database: Database, query: SQL): Promise<Row[]> {
  const result = (await database.execute(query)) as unknown;
  return (Array.isArray(result) ? result : (result as { rows: Row[] }).rows) as Row[];
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

function names(list: readonly string[]): string {
  if (list.length <= 3) {
    return list.length <= 1
      ? (list[0] ?? '')
      : `${list.slice(0, -1).join(', ')} y ${list.at(-1) ?? ''}`;
  }
  return `${list.slice(0, 3).join(', ')} y ${String(list.length - 3)} más`;
}

const STOCK_CUSTOMERS = sql`(select id from customers where upper(trim(display_name)) = 'STOCK')`;
const IS_CASH = sql`coalesce(
  (select pm.is_cash from payment_methods pm
   where lower(pm.display_name) = lower(o.payment_expectation) or lower(pm.code) = lower(o.payment_expectation)
   limit 1),
  lower(o.payment_expectation) like '%efectivo%')`;

/** Cada cuántos clientes se festeja un hito. */
export const CUSTOMER_MILESTONE = 25;
/** Desde cuánto se mira una caída de un menú: con dos o tres unidades, cualquier cambio es "fuerte". */
const MIX_MIN_UNITS = 6;
/** Cuántos días antes del cierre empieza a importar lo que falta cobrar. */
const COLLECTION_WINDOW_DAYS = 2;

export async function statsEvents(
  database: Database,
  input: { now?: Date; operatingSiteId?: string | null },
): Promise<StatsEvent[]> {
  const now = (input.now ?? new Date()).toISOString();
  const site = input.operatingSiteId ?? null;
  const inSite = site ? sql`and o.operating_site_id = ${site}::uuid` : sql``;
  const real = sql`o.status <> 'CANCELLED' and o.customer_id not in ${STOCK_CUSTOMERS} ${inSite}`;

  const [current] = await rows(
    database,
    sql`select id, alias, open_at, close_at from sales_cycles where open_at <= ${now}::timestamptz
        order by (close_at >= ${now}::timestamptz) desc, open_at desc limit 1`,
  );
  if (!current) return [];
  const cycleId = String(current.id);
  const alias = String(current.alias);
  const openAt = new Date(String(current.open_at)).toISOString();
  const events: StatsEvent[] = [];

  // Récords: el período en curso contra todos los anteriores, con al menos tres para comparar.
  const perCycle = await rows(
    database,
    sql`select o.sales_cycle_id, count(*)::int as orders, avg(o.total_minor)::float as ticket
        from orders o join sales_cycles s on s.id = o.sales_cycle_id
        where ${real} and s.open_at <= ${openAt}::timestamptz
        group by o.sales_cycle_id`,
  );
  const mine = perCycle.find((row) => String(row.sales_cycle_id) === cycleId);
  const others = perCycle.filter((row) => String(row.sales_cycle_id) !== cycleId);
  if (mine && others.length >= 3) {
    const orders = Number(mine.orders);
    if (orders > Math.max(...others.map((row) => Number(row.orders)))) {
      events.push({
        href: null,
        key: `record:pedidos:${cycleId}:${String(orders)}`,
        kind: 'record',
        text: `${alias} ya es el período con más pedidos: ${String(orders)}.`,
        tone: 'success',
      });
    }
    const ticket = Number(mine.ticket);
    if (orders >= 5 && ticket > Math.max(...others.map((row) => Number(row.ticket)))) {
      events.push({
        href: null,
        key: `record:ticket:${cycleId}`,
        kind: 'record',
        text: `${alias} tiene el ticket promedio más alto hasta ahora.`,
        tone: 'success',
      });
    }
  }

  // La mezcla: un menú que pasa la mitad de las unidades, o que cae más de un tercio.
  const [previous] = await rows(
    database,
    sql`select id, alias from sales_cycles where open_at < ${openAt}::timestamptz
        order by open_at desc limit 1`,
  );
  if (previous) {
    const mix = await rows(
      database,
      sql`select o.sales_cycle_id, lower(trim(i.product_name_snapshot)) as family_key,
                 min(trim(i.product_name_snapshot)) as family_name,
                 sum(i.quantity_units)::int as units
          from order_items i join orders o on o.id = i.order_id
          where ${real} and o.sales_cycle_id in (${cycleId}::uuid, ${String(previous.id)}::uuid)
          group by 1, 2`,
    );
    const of = (id: string) => mix.filter((row) => String(row.sales_cycle_id) === id);
    const nowMix = of(cycleId);
    const beforeMix = of(String(previous.id));
    const total = (list: Row[]) => list.reduce((sum, row) => sum + Number(row.units), 0);
    const nowTotal = total(nowMix);
    const beforeTotal = total(beforeMix);
    if (nowTotal > 0 && beforeTotal > 0) {
      for (const row of nowMix) {
        const before = beforeMix.find((item) => item.family_key === row.family_key);
        const share = Number(row.units) / nowTotal;
        const shareBefore = before ? Number(before.units) / beforeTotal : 0;
        if (share > 0.5 && shareBefore <= 0.5) {
          events.push({
            href: null,
            key: `mezcla:mitad:${cycleId}:${String(row.family_key)}`,
            kind: 'mezcla',
            text: `${String(row.family_name)} pasó la mitad de las unidades: ${String(Math.round(share * 100))}% en ${alias}.`,
            tone: 'info',
          });
        }
      }
      // Una caída sólo se nota cuando el período ya juntó tanto como el anterior: a mitad de
      // semana, todos los menús "caen".
      if (nowTotal >= beforeTotal) {
        for (const before of beforeMix) {
          const unitsBefore = Number(before.units);
          if (unitsBefore < MIX_MIN_UNITS) continue;
          const unitsNow = Number(
            nowMix.find((item) => item.family_key === before.family_key)?.units ?? 0,
          );
          if (unitsNow <= (unitsBefore * 2) / 3) {
            events.push({
              href: null,
              key: `mezcla:cae:${cycleId}:${String(before.family_key)}`,
              kind: 'mezcla',
              text: `${String(before.family_name)} bajó de ${String(unitsBefore)} a ${String(unitsNow)} unidades contra ${String(previous.alias)}.`,
              tone: 'warning',
            });
          }
        }
      }
    }
  }

  // Lo que falta cobrar que no es efectivo, cuando el cierre está cerca o ya pasó.
  const closeAt = new Date(String(current.close_at)).getTime();
  if (closeAt - Date.parse(now) <= COLLECTION_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
    const [unpaid] = await rows(
      database,
      sql`select count(*)::int as total, coalesce(sum(o.total_minor), 0)::bigint as amount
          from orders o
          where ${real} and o.sales_cycle_id = ${cycleId}::uuid and o.paid_at is null
            and not ${IS_CASH}`,
    );
    const total = Number(unpaid?.total ?? 0);
    if (total > 0) {
      events.push({
        href: '/app/por-cobrar',
        key: `cobro:${cycleId}:${String(total)}`,
        kind: 'cobro',
        text: `${String(total)} ${plural(total, 'pedido', 'pedidos')} de ${alias} sin efectivo ${plural(total, 'sigue', 'siguen')} sin cobrar ${closeAt < Date.parse(now) ? 'después del cierre' : 'a días del cierre'}.`,
        tone: 'warning',
      });
    }
  }

  // Los de siempre que faltan: pidieron en cada uno de los tres períodos anteriores y en éste no.
  const missing = await rows(
    database,
    sql`with prev as (
          select id from sales_cycles where open_at < ${openAt}::timestamptz
          order by open_at desc limit 3
        ),
        regulars as (
          select o.customer_id from orders o
          where o.sales_cycle_id in (select id from prev) and ${real}
          group by o.customer_id
          having count(distinct o.sales_cycle_id) = 3
        )
        select c.display_name from customers c
        join regulars r on r.customer_id = c.id
        where c.status = 'active'
          and not exists (
            select 1 from orders o2
            where o2.customer_id = c.id and o2.sales_cycle_id = ${cycleId}::uuid
              and o2.status <> 'CANCELLED'
          )
        order by c.display_name`,
  );
  if (missing.length > 0) {
    const list = missing.map((row) => String(row.display_name));
    events.push({
      href: '/app/clientes',
      key: `ausentes:${cycleId}:${String(list.length)}`,
      kind: 'ausentes',
      text: `${String(list.length)} ${plural(list.length, 'cliente de siempre no pidió', 'clientes de siempre no pidieron')} en ${alias}: ${names(list)}.`,
      tone: 'danger',
    });
  }

  // Hitos: cruzar un múltiplo de clientes en este período, y el primer pedido de una ciudad.
  const [customers] = await rows(
    database,
    sql`with firsts as (
          select o.customer_id, min(s.open_at) as first_open
          from orders o join sales_cycles s on s.id = o.sales_cycle_id
          where ${real} group by o.customer_id
        )
        select count(*)::int as total,
               count(*) filter (where first_open < ${openAt}::timestamptz)::int as before
        from firsts`,
  );
  const totalCustomers = Number(customers?.total ?? 0);
  const before = Number(customers?.before ?? 0);
  const milestone = Math.floor(totalCustomers / CUSTOMER_MILESTONE) * CUSTOMER_MILESTONE;
  if (milestone > 0 && before < milestone) {
    events.push({
      href: null,
      key: `hito:clientes:${String(milestone)}`,
      kind: 'hito',
      text: `Llegaron a ${String(milestone)} clientes con pedidos: ya son ${String(totalCustomers)}.`,
      tone: 'success',
    });
  }
  const newSites = await rows(
    database,
    sql`select os.id, os.display_name from operating_sites os
        where exists (select 1 from orders o where o.operating_site_id = os.id
                        and o.sales_cycle_id = ${cycleId}::uuid and ${real})
          and not exists (select 1 from orders o join sales_cycles s on s.id = o.sales_cycle_id
                            where o.operating_site_id = os.id and s.open_at < ${openAt}::timestamptz
                              and ${real})
          ${site ? sql`and os.id = ${site}::uuid` : sql``}`,
  );
  for (const row of newSites) {
    events.push({
      href: null,
      key: `hito:ciudad:${String(row.id)}`,
      kind: 'hito',
      text: `Primer período con pedidos en ${String(row.display_name)}.`,
      tone: 'success',
    });
  }

  // Lo del caso 2026-10-28: cancelados que ya habían salido en la planilla y no pasaron al stock.
  const cooked = await rows(
    database,
    sql`select c.display_name, o.id from orders o join customers c on c.id = o.customer_id
        where o.status = 'CANCELLED' and not o.cancelled_to_stock ${inSite}
          and o.sales_cycle_id in (select id from sales_cycles where open_at <= ${openAt}::timestamptz
                                   order by open_at desc limit 2)
          and exists (select 1 from kitchen_sheets ks where ks.sales_cycle_id = o.sales_cycle_id
                        and ks.orders @> jsonb_build_array(jsonb_build_object('orderId', o.id::text)))
        order by c.display_name`,
  );
  if (cooked.length > 0) {
    const list = cooked.map((row) => String(row.display_name));
    events.push({
      href: cooked.length === 1 ? `/app/pedidos/${String(cooked[0]?.id)}` : '/app/cocina',
      key: `cocina:${cooked.map((row) => String(row.id)).join(',')}`,
      kind: 'cocina',
      text: `${plural(list.length, 'Un cancelado ya había', `${String(list.length)} cancelados ya habían`)} salido en la planilla de cocina y no ${plural(list.length, 'pasó', 'pasaron')} al stock: ${names(list)}.`,
      tone: 'danger',
    });
  }

  // Lo urgente primero: lo que hay que revisar, después lo que conviene mirar y al final lo bueno.
  const order: Record<StatsEventTone, number> = { danger: 0, info: 2, success: 3, warning: 1 };
  return events.sort((left, right) => order[left.tone] - order[right.tone]);
}
