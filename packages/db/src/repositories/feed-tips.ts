import { sql, type SQL } from 'drizzle-orm';

import type { Database } from '../index.js';

/**
 * Los consejos del día del tablero (DASHBOARD_FEED_PLAN.md, fase 3).
 *
 * Salen de los datos, no de una lista de frases: cada uno mira el período en curso y sólo aparece
 * si hay algo que hacer. Cada uno pide el permiso de lo que muestra —el de ventas, `stats.read`—, y
 * la clave incluye el número, así que "Hecho" lo esconde hasta que el número cambie.
 */
export interface FeedTip {
  href: string;
  key: string;
  text: string;
}

type Row = Record<string, unknown>;

async function rows(database: Database, query: SQL): Promise<Row[]> {
  const result = (await database.execute(query)) as unknown;
  return (Array.isArray(result) ? result : (result as { rows: Row[] }).rows) as Row[];
}

function names(list: readonly string[]): string {
  if (list.length <= 3) {
    return list.length <= 1
      ? (list[0] ?? '')
      : `${list.slice(0, -1).join(', ')} y ${list.at(-1) ?? ''}`;
  }
  return `${list.slice(0, 3).join(', ')} y ${String(list.length - 3)} más`;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

export async function feedTips(
  database: Database,
  input: { now?: Date; operatingSiteId?: string | null; permissions: readonly string[] },
): Promise<FeedTip[]> {
  const can = (permission: string) => input.permissions.includes(permission);
  const now = (input.now ?? new Date()).toISOString();

  const [current] = await rows(
    database,
    sql`select id, open_at from sales_cycles where open_at <= ${now}::timestamptz
        order by (close_at >= ${now}::timestamptz) desc, open_at desc limit 1`,
  );
  if (!current) return [];
  const cycleId = String(current.id);
  const openAt = new Date(String(current.open_at)).toISOString();
  const site = input.operatingSiteId ?? null;
  const inSite = (alias: string) =>
    site ? sql`and ${sql.raw(alias)}.operating_site_id = ${site}::uuid` : sql``;

  const tips: FeedTip[] = [];

  // Los de siempre que faltan: pidieron en cada uno de los tres períodos anteriores y en éste no.
  if (can('customers.read')) {
    const missing = await rows(
      database,
      sql`with prev as (
            select id from sales_cycles where open_at < ${openAt}::timestamptz
            order by open_at desc limit 3
          ),
          regulars as (
            select o.customer_id from orders o
            where o.sales_cycle_id in (select id from prev) and o.status <> 'CANCELLED' ${inSite('o')}
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
      tips.push({
        href: '/app/clientes',
        key: `tip:habituales:${String(list.length)}`,
        text: `${String(list.length)} ${plural(list.length, 'cliente que pidió', 'clientes que pidieron')} las últimas tres semanas todavía no ${plural(list.length, 'pidió', 'pidieron')} en este período: ${names(list)}. Un mensaje a tiempo suele alcanzar.`,
      });
    }
  }

  if (can('orders.read')) {
    // Pedidos sin ubicación: no entran bien en la hoja de ruta.
    const [unlocated] = await rows(
      database,
      sql`select count(*)::int as total from orders o
          left join customer_addresses a on a.id = o.delivery_address_id
          where o.sales_cycle_id = ${cycleId}::uuid and o.status <> 'CANCELLED'
            and (a.id is null or a.latitude is null) ${inSite('o')}`,
    );
    const total = Number(unlocated?.total ?? 0);
    if (total > 0) {
      tips.push({
        href: '/app/pedidos',
        key: `tip:sin-ubicacion:${String(total)}`,
        text: `${String(total)} ${plural(total, 'pedido', 'pedidos')} de este período todavía no ${plural(total, 'tiene', 'tienen')} ubicación en el mapa. Ubicarlos antes del reparto ahorra vueltas.`,
      });
    }
  }

  if (can('customers.read')) {
    // Domicilios sin barrio: la hoja de ruta agrupa por barrio.
    const [noNeighborhood] = await rows(
      database,
      sql`select count(distinct a.id)::int as total from orders o
          join customer_addresses a on a.id = o.delivery_address_id
          where o.sales_cycle_id = ${cycleId}::uuid and o.status <> 'CANCELLED'
            and a.neighborhood_id is null ${inSite('o')}`,
    );
    const total = Number(noNeighborhood?.total ?? 0);
    if (total > 0) {
      tips.push({
        href: '/app/pedidos',
        key: `tip:sin-barrio:${String(total)}`,
        text: `${String(total)} ${plural(total, 'domicilio', 'domicilios')} de este período no ${plural(total, 'tiene', 'tienen')} barrio: sin barrio no se agrupan en la hoja de ruta.`,
      });
    }
  }

  if (can('production.read')) {
    const [top] = await rows(
      database,
      sql`select i.product_name_snapshot as family, i.variant_snapshot as variant,
                 sum(i.quantity_units)::int as units
          from order_items i join orders o on o.id = i.order_id
          where o.sales_cycle_id = ${cycleId}::uuid and o.status <> 'CANCELLED' ${inSite('o')}
          group by 1, 2 order by units desc, family limit 1`,
    );
    if (top && Number(top.units) > 0) {
      tips.push({
        href: '/app/cocina',
        key: `tip:mas-pedido:${String(top.family)}:${String(top.variant)}`,
        text: `Lo más pedido del período: ${String(top.family)} ${String(top.variant)}, ${String(top.units)} unidades. Si se agota seguido, conviene cargarle stock.`,
      });
    }
  }

  // Ventas: este período contra el anterior a la misma altura. Sólo quien ve estadísticas.
  if (can('stats.read')) {
    const [pace] = await rows(
      database,
      sql`with prev as (
            select id, open_at from sales_cycles where open_at < ${openAt}::timestamptz
            order by open_at desc limit 1
          )
          select
            (select count(*)::int from orders o
              where o.sales_cycle_id = ${cycleId}::uuid and o.status <> 'CANCELLED' ${inSite('o')})
              as now_count,
            (select count(*)::int from orders o, prev p
              where o.sales_cycle_id = p.id and o.status <> 'CANCELLED'
                and o.created_at <= p.open_at + (${now}::timestamptz - ${openAt}::timestamptz)
                ${inSite('o')}) as then_count,
            (select count(*)::int from prev) as has_prev`,
    );
    const nowCount = Number(pace?.now_count ?? 0);
    const thenCount = Number(pace?.then_count ?? 0);
    if (Number(pace?.has_prev ?? 0) > 0 && (nowCount > 0 || thenCount > 0)) {
      const diff = nowCount - thenCount;
      const comparison =
        diff === 0
          ? 'igual que el anterior a esta altura'
          : `${String(Math.abs(diff))} ${diff > 0 ? 'más' : 'menos'} que el anterior a esta altura`;
      tips.push({
        href: '/app/estadisticas',
        key: `tip:ritmo:${String(nowCount)}:${String(thenCount)}`,
        text: `Van ${String(nowCount)} ${plural(nowCount, 'pedido', 'pedidos')} en este período, ${comparison}.`,
      });
    }
  }

  return tips;
}
