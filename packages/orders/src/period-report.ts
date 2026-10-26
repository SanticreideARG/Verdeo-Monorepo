/**
 * El informe de pedidos del período, en columnas largas (ORDERS_PERIOD_REPORT_PLAN.md).
 *
 * Copia la planilla que se armaba a mano: un renglón por vianda, secciones por día de entrega y,
 * dentro del día, en el orden del recorrido. Acá sólo se arman los datos; la planilla (colores,
 * barras, fórmulas) la dibuja la API.
 */
import { defaultAbbreviation } from './kitchen-labels.js';
import { compareProducts } from './product-order.js';

export interface PeriodReportItem {
  composable: boolean;
  /** Los platos elegidos de un Intuitivo; en una variedad fija, vacío. */
  dishSelections: readonly string[];
  /** De qué menú y de qué día (1 = lunes) es cada plato elegido; null si no se sabe. */
  dishSources?: readonly ({ familyName: string; slot: number } | null)[];
  familyName: string;
  /** Cuántas comidas trae la vianda: llena esa cantidad de las cinco columnas de días. */
  mealsPerUnit: number;
  quantityUnits: number;
  /** Del stock de un período anterior: de cuál ("Octubre 2"). Va al lado de la variedad. */
  stockLabel?: string | null;
  variantName: string;
}

export interface PeriodReportOrder {
  addressLine1: string;
  addressLine2: string | null;
  customerName: string;
  deliveryDate: string;
  dietaryInstructions: readonly string[];
  isNew: boolean;
  items: readonly PeriodReportItem[];
  notes: string | null;
  paid: boolean;
  paymentExpectation: string;
  phone: string | null;
  publicNumber: string;
  /** Por dónde entró el pedido ("email", "whatsapp"…): pinta de qué color va un cliente nuevo. */
  source: string;
  /** La parada en la ruta del día, si ya hay una; `minutes` es el tiempo estimado de ruta. */
  route: { minutes: number | null; routeLabel: string; sequence: number } | null;
  /** El reparto ("Mañana · de 10 a 13h"): va en la barra de carga del día. */
  run: string | null;
  timeSlot: string | null;
  totalMinor: number;
  zone: string | null;
}

/**
 * Un renglón: una vianda o, en un Intuitivo, los platos de un mismo menú (ver `composableRows`).
 */
export interface PeriodReportRow {
  composable: boolean;
  familyName: string;
  /** El primer renglón del pedido: el único que lleva la venta. */
  first: boolean;
  /** Las cinco columnas de días: la variedad de cada comida o, en un Intuitivo, sus platos. */
  meals: string[];
  order: PeriodReportOrder;
  size: string;
  /** Para la hoja de reparto: la variedad o, en un Intuitivo, el nombre del cliente. */
  variety: string;
}

export interface PeriodReportDay {
  /** Lo que cobra quien reparte: sólo el efectivo (las transferencias no las cobra). */
  cashMinor: number;
  date: string;
  /**
   * Los renglones de la hoja "Reparto": uno por bulto. Una variedad fija, uno por vianda; un
   * Intuitivo, uno cada cinco platos (5 → 1, de 6 a 10 → 2, de 11 a 15 → 3…), porque cada cinco es
   * un bulto.
   */
  deliveryRows: PeriodReportRow[];
  rows: PeriodReportRow[];
  runs: string[];
  saleMinor: number;
  /** Lo del día por producto, para el resumen de cada reparto. */
  summary: { label: string; units: number }[];
  units: number;
}

export interface PeriodReport {
  days: PeriodReportDay[];
  /** Cuántas viandas de cada producto, en la jerarquía; los Intuitivos, uno por cliente. */
  summary: { label: string; units: number }[];
  totalSaleMinor: number;
  totalUnits: number;
}

const DAYS = 5;

/** "400 g" → "400". */
function sizeOf(variantName: string): string {
  return /\d+/.exec(variantName)?.[0] ?? variantName;
}

/**
 * Los renglones de un Intuitivo, como en la planilla: cada plato va en la columna de su día con el
 * nombre de su menú ("VEGETARIANO" el lunes, "KETO" el martes), un renglón por menú; si dos platos
 * del mismo menú caen el mismo día, el segundo abre otro renglón. Un plato sin menú conocido va con
 * su nombre, en el primer día libre.
 */
export function composableRows(item: PeriodReportItem): string[][] {
  const byFamily = new Map<string, { day: number | null; text: string }[]>();
  item.dishSelections.forEach((dish, index) => {
    const source = item.dishSources?.[index] ?? null;
    const key = source ? source.familyName : '';
    const day = source && source.slot >= 1 && source.slot <= DAYS ? source.slot - 1 : null;
    byFamily.set(key, [
      ...(byFamily.get(key) ?? []),
      { day, text: source ? defaultAbbreviation(source.familyName) : dish },
    ]);
  });
  const families = [...byFamily.keys()].sort((left, right) =>
    left === ''
      ? 1
      : right === ''
        ? -1
        : compareProducts({ familyName: left }, { familyName: right }),
  );
  const rows: string[][] = [];
  for (const family of families) {
    const own: string[][] = [];
    for (const dish of byFamily.get(family) ?? []) {
      let row = own.find((candidate) =>
        dish.day === null ? candidate.includes('') : candidate[dish.day] === '',
      );
      if (!row) {
        row = Array.from({ length: DAYS }, () => '');
        own.push(row);
      }
      const day = dish.day ?? row.indexOf('');
      row[day] = dish.text;
    }
    rows.push(...own);
  }
  return rows.length > 0 ? rows : [Array.from({ length: DAYS }, () => '')];
}

function compareOrders(left: PeriodReportOrder, right: PeriodReportOrder): number {
  // En ruta, por ruta y parada; los que todavía no tienen ruta, al final, por franja y zona.
  if (left.route && right.route) {
    return (
      left.route.routeLabel.localeCompare(right.route.routeLabel, 'es-AR') ||
      left.route.sequence - right.route.sequence
    );
  }
  if (left.route) return -1;
  if (right.route) return 1;
  return (
    (left.timeSlot ?? '￿').localeCompare(right.timeSlot ?? '￿', 'es-AR', {
      numeric: true,
    }) ||
    (left.zone ?? '').localeCompare(right.zone ?? '', 'es-AR') ||
    left.publicNumber.localeCompare(right.publicNumber, 'es-AR', { numeric: true })
  );
}

/** Los platos que reparte un ítem: los elegidos de un Intuitivo o los del tamaño por cada vianda. */
function dishCount(item: PeriodReportItem): number {
  return item.dishSelections.length > 0
    ? item.dishSelections.length
    : item.mealsPerUnit * item.quantityUnits;
}

type SummaryEntry = {
  composable: boolean;
  familyName: string;
  label: string;
  size: string;
  units: number;
};

function sortedSummary(entries: Iterable<SummaryEntry>): { label: string; units: number }[] {
  return [...entries]
    .sort(
      (left, right) =>
        compareProducts(
          { composable: left.composable, familyName: left.familyName, variantName: left.size },
          { composable: right.composable, familyName: right.familyName, variantName: right.size },
        ) || left.label.localeCompare(right.label, 'es-AR'),
    )
    .map(({ label, units }) => ({ label, units }));
}

export function buildPeriodReport(orders: readonly PeriodReportOrder[]): PeriodReport {
  const byDate = new Map<string, PeriodReportOrder[]>();
  for (const order of orders) {
    byDate.set(order.deliveryDate, [...(byDate.get(order.deliveryDate) ?? []), order]);
  }

  const summary = new Map<
    string,
    { composable: boolean; familyName: string; label: string; size: string; units: number }
  >();
  const days: PeriodReportDay[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const dayOrders = [...(byDate.get(date) ?? [])].sort(compareOrders);
    const rows: PeriodReportRow[] = [];
    const deliveryRows: PeriodReportRow[] = [];
    const daySummary = new Map<string, SummaryEntry>();
    for (const order of dayOrders) {
      const items = [...order.items].sort(compareProducts);
      for (const item of items) {
        const short = defaultAbbreviation(item.familyName);
        const size = sizeOf(item.variantName);
        // Del stock de un período anterior, como se escribía a mano: "KETO · Octubre 2".
        const ofStock = item.stockLabel ? ` · ${item.stockLabel}` : '';
        const meals = Array.from({ length: DAYS }, (_, day) =>
          day < Math.min(DAYS, item.mealsPerUnit) ? short + ofStock : '',
        );
        const variety = item.composable ? order.customerName : short + ofStock;
        const label = item.composable ? `${variety} ${size}` : `${short} ${size}${ofStock}`;
        const entry = summary.get(label) ?? {
          composable: item.composable,
          familyName: item.familyName,
          label,
          size,
          units: 0,
        };
        entry.units += item.quantityUnits;
        summary.set(label, entry);
        const dayEntry = daySummary.get(label) ?? { ...entry, units: 0 };
        dayEntry.units += item.quantityUnits;
        daySummary.set(label, dayEntry);
        // La hoja de reparto: un renglón por bulto (un Intuitivo, uno cada cinco platos).
        const bundles = item.composable
          ? Math.max(1, Math.ceil(dishCount(item) / 5))
          : item.quantityUnits;
        for (let bundle = 0; bundle < bundles; bundle += 1) {
          deliveryRows.push({
            composable: item.composable,
            familyName: item.familyName,
            first: deliveryRows.every((row) => row.order !== order),
            meals,
            order,
            size,
            variety,
          });
        }
        /*
         * Un Intuitivo no es una vianda por renglón: sus platos van por menú (`composableRows`).
         * Los platos elegidos son los de todas sus unidades juntas.
         */
        const lines = item.composable
          ? composableRows(item)
          : Array.from({ length: item.quantityUnits }, () => meals);
        for (const line of lines) {
          rows.push({
            composable: item.composable,
            familyName: item.familyName,
            first: rows.every((row) => row.order !== order),
            meals: line,
            order,
            size,
            variety,
          });
        }
      }
    }
    days.push({
      cashMinor: dayOrders
        .filter((order) => !isTransfer(order.paymentExpectation))
        .reduce((sum, order) => sum + order.totalMinor, 0),
      date,
      deliveryRows,
      rows,
      summary: sortedSummary(daySummary.values()),
      runs: [...new Set(dayOrders.map((order) => order.run).filter((run) => run !== null))],
      saleMinor: dayOrders.reduce((sum, order) => sum + order.totalMinor, 0),
      units: dayOrders.reduce(
        (sum, order) => sum + order.items.reduce((total, item) => total + item.quantityUnits, 0),
        0,
      ),
    });
  }

  return {
    days,
    summary: sortedSummary(summary.values()),
    totalSaleMinor: orders.reduce((sum, order) => sum + order.totalMinor, 0),
    totalUnits: days.reduce((sum, day) => sum + day.units, 0),
  };
}

/** Si el pedido se paga por transferencia: sólo entonces la venta se pinta de verde o rojo. */
export function isTransfer(paymentExpectation: string): boolean {
  return /transfer/i.test(paymentExpectation);
}

/** "≈ 25 min", "≈ 1 h 10": el tiempo estimado de ruta como va en la planilla. */
export function routeMinutesLabel(minutes: number | null): string {
  if (minutes === null) return '';
  if (minutes < 60) return `≈ ${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `≈ ${String(hours)} h${rest ? ` ${String(rest).padStart(2, '0')}` : ''}`;
}
