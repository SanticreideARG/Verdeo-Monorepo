import { sql, type SQL } from 'drizzle-orm';

import type { Database } from '../index.js';

/**
 * Estadísticas por período y ciudad (STATS_REDESIGN_PLAN.md): el análisis contable de abajo y los
 * gráficos del carrusel salen de acá.
 *
 * Mismo criterio que el informe del período (`cycleReport`): sin cancelados y sin el cliente STOCK
 * en lo vendido; los cancelados aparte, "no suman". Si esta tabla y el informe dieran números
 * distintos para el mismo período, ninguno de los dos sirve.
 */

type Row = Record<string, unknown>;

async function rows(database: Database, query: SQL): Promise<Row[]> {
  const result = (await database.execute(query)) as unknown;
  return (Array.isArray(result) ? result : (result as { rows: Row[] }).rows) as Row[];
}

export interface StatsFilters {
  from?: string | undefined;
  operatingSiteId?: string | undefined;
  to?: string | undefined;
}

export interface StatsPeriodMethod {
  isCash: boolean;
  method: string;
  paidMinor: number;
  totalMinor: number;
}

export interface StatsPeriodRow {
  /** Lo que no explican los ítems: total del pedido menos (bruto − descuentos + recargos). */
  adjustmentMinor: number;
  cancelledCount: number;
  cancelledMinor: number;
  /** Cancelados que ya estaban cocinados y pasaron al stock. */
  cancelledToStockMinor: number;
  closeAt: string;
  customerCount: number;
  cycleAlias: string;
  discountMinor: number;
  /** Lo vendido desde el stock de períodos anteriores (ítems atados a un lote). */
  fromStockMinor: number;
  grossMinor: number;
  methods: StatsPeriodMethod[];
  netMinor: number;
  /** Clientes cuyo primer pedido de verdad (sin cancelados) es de este período. */
  newCustomerCount: number;
  openAt: string;
  operatingSiteId: string;
  operatingSiteName: string;
  orderCount: number;
  paidMinor: number;
  pendingMinor: number;
  salesCycleId: string;
  surchargeMinor: number;
  units: number;
}

export interface StatsPeriods {
  currency: string;
  /** La mezcla de menús por período, para el gráfico del carrusel. */
  mix: { familyName: string; salesCycleId: string; units: number }[];
  rows: StatsPeriodRow[];
}

const STOCK_CUSTOMERS = sql`(select id from customers where upper(trim(display_name)) = 'STOCK')`;

/** Lo mismo que mira el informe para decidir si un medio de pago es efectivo. */
const IS_CASH = sql`coalesce(
  (select pm.is_cash from payment_methods pm
   where lower(pm.display_name) = lower(o.payment_expectation) or lower(pm.code) = lower(o.payment_expectation)
   limit 1),
  lower(o.payment_expectation) like '%efectivo%')`;

function scopeOf(filters: StatsFilters): SQL {
  return sql`o.customer_id not in ${STOCK_CUSTOMERS}
    ${filters.from ? sql`and o.delivery_date >= ${filters.from}::date` : sql``}
    ${filters.to ? sql`and o.delivery_date <= ${filters.to}::date` : sql``}
    ${filters.operatingSiteId ? sql`and o.operating_site_id = ${filters.operatingSiteId}::uuid` : sql``}`;
}

const key = (row: Row) => `${String(row.sales_cycle_id)}|${String(row.operating_site_id)}`;
const num = (value: unknown) => Number(value ?? 0);
const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

export async function statsPeriods(
  database: Database,
  filters: StatsFilters,
): Promise<StatsPeriods> {
  const scope = scopeOf(filters);
  const [totals, items, methods, mix, firsts] = await Promise.all([
    rows(
      database,
      sql`select o.sales_cycle_id, o.operating_site_id, s.alias, s.open_at, s.close_at,
                 os.display_name as site_name,
                 count(*) filter (where o.status <> 'CANCELLED')::int as order_count,
                 coalesce(sum(o.total_minor) filter (where o.status <> 'CANCELLED'), 0)::bigint as net,
                 coalesce(sum(o.total_minor) filter (where o.status <> 'CANCELLED' and o.paid_at is not null), 0)::bigint as paid,
                 count(*) filter (where o.status = 'CANCELLED')::int as cancelled_count,
                 coalesce(sum(o.total_minor) filter (where o.status = 'CANCELLED'), 0)::bigint as cancelled,
                 coalesce(sum(o.total_minor) filter (where o.status = 'CANCELLED' and o.cancelled_to_stock), 0)::bigint as cancelled_to_stock,
                 count(distinct o.customer_id) filter (where o.status <> 'CANCELLED')::int as customers,
                 min(o.currency) as currency
          from orders o
          join sales_cycles s on s.id = o.sales_cycle_id
          join operating_sites os on os.id = o.operating_site_id
          where ${scope}
          group by o.sales_cycle_id, o.operating_site_id, s.alias, s.open_at, s.close_at, os.display_name
          order by s.open_at desc, os.display_name`,
    ),
    rows(
      database,
      sql`select o.sales_cycle_id, o.operating_site_id,
                 coalesce(sum(i.unit_price_minor::bigint * i.quantity_units), 0)::bigint as gross,
                 coalesce(sum(i.discount_minor), 0)::bigint as discount,
                 coalesce(sum(i.surcharge_minor), 0)::bigint as surcharge,
                 coalesce(sum(i.total_minor) filter (where i.stock_lot_id is not null), 0)::bigint as from_stock,
                 coalesce(sum(i.quantity_units), 0)::int as units
          from order_items i
          join orders o on o.id = i.order_id
          where ${scope} and o.status <> 'CANCELLED'
          group by o.sales_cycle_id, o.operating_site_id`,
    ),
    rows(
      database,
      sql`select o.sales_cycle_id, o.operating_site_id, o.payment_expectation as method,
                 bool_or(${IS_CASH}) as is_cash,
                 coalesce(sum(o.total_minor), 0)::bigint as total,
                 coalesce(sum(o.total_minor) filter (where o.paid_at is not null), 0)::bigint as paid
          from orders o
          where ${scope} and o.status <> 'CANCELLED'
          group by o.sales_cycle_id, o.operating_site_id, o.payment_expectation
          order by sum(o.total_minor) desc`,
    ),
    rows(
      database,
      sql`select o.sales_cycle_id, i.product_name_snapshot as family_name,
                 coalesce(sum(i.quantity_units), 0)::int as units
          from order_items i
          join orders o on o.id = i.order_id
          where ${scope} and o.status <> 'CANCELLED'
          group by o.sales_cycle_id, i.product_name_snapshot`,
    ),
    /*
     * "Nuevo" es el primer pedido de su historia, no el primero dentro del filtro: si no, achicar
     * las fechas convertiría en nuevos a clientes de hace meses.
     */
    rows(
      database,
      sql`with firsts as (
            select distinct on (o.customer_id) o.customer_id, o.sales_cycle_id, o.operating_site_id
            from orders o
            join sales_cycles s on s.id = o.sales_cycle_id
            where o.status <> 'CANCELLED' and o.customer_id not in ${STOCK_CUSTOMERS}
            order by o.customer_id, s.open_at, o.created_at
          )
          select f.sales_cycle_id, f.operating_site_id, count(*)::int as total
          from firsts f
          where exists (select 1 from orders o where o.customer_id = f.customer_id
                          and o.sales_cycle_id = f.sales_cycle_id and o.status <> 'CANCELLED'
                          and ${scope})
          group by f.sales_cycle_id, f.operating_site_id`,
    ),
  ]);

  const itemsByKey = new Map(items.map((row) => [key(row), row]));
  const firstsByKey = new Map(firsts.map((row) => [key(row), num(row.total)]));
  const methodsByKey = new Map<string, StatsPeriodMethod[]>();
  for (const row of methods) {
    const list = methodsByKey.get(key(row)) ?? [];
    list.push({
      isCash: Boolean(row.is_cash),
      method: String(row.method),
      paidMinor: num(row.paid),
      totalMinor: num(row.total),
    });
    methodsByKey.set(key(row), list);
  }

  const periodRows: StatsPeriodRow[] = totals.map((row) => {
    const item = itemsByKey.get(key(row));
    const grossMinor = num(item?.gross);
    const discountMinor = num(item?.discount);
    const surchargeMinor = num(item?.surcharge);
    const netMinor = num(row.net);
    const paidMinor = num(row.paid);
    return {
      adjustmentMinor: netMinor - (grossMinor - discountMinor + surchargeMinor),
      cancelledCount: num(row.cancelled_count),
      cancelledMinor: num(row.cancelled),
      cancelledToStockMinor: num(row.cancelled_to_stock),
      closeAt: iso(row.close_at),
      customerCount: num(row.customers),
      cycleAlias: String(row.alias),
      discountMinor,
      fromStockMinor: num(item?.from_stock),
      grossMinor,
      methods: methodsByKey.get(key(row)) ?? [],
      netMinor,
      newCustomerCount: firstsByKey.get(key(row)) ?? 0,
      openAt: iso(row.open_at),
      operatingSiteId: String(row.operating_site_id),
      operatingSiteName: String(row.site_name),
      orderCount: num(row.order_count),
      paidMinor,
      pendingMinor: netMinor - paidMinor,
      salesCycleId: String(row.sales_cycle_id),
      surchargeMinor,
      units: num(item?.units),
    };
  });

  // "MENÚ REAL" y "Menú Real" son el mismo menú: se juntan como en el resto de Estadísticas.
  const mixByKey = new Map<string, { familyName: string; salesCycleId: string; units: number }>();
  for (const row of mix) {
    const familyName = String(row.family_name).trim();
    const mixKey = `${String(row.sales_cycle_id)}|${familyName.toLocaleLowerCase('es')}`;
    const entry = mixByKey.get(mixKey) ?? {
      familyName,
      salesCycleId: String(row.sales_cycle_id),
      units: 0,
    };
    entry.units += num(row.units);
    mixByKey.set(mixKey, entry);
  }

  const currency = totals.find((row) => typeof row.currency === 'string')?.currency;
  return {
    currency: typeof currency === 'string' ? currency : 'ARS',
    mix: [...mixByKey.values()].sort((left, right) => right.units - left.units),
    rows: periodRows,
  };
}
