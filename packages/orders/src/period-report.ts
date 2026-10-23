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
  familyName: string;
  /** Cuántas comidas trae la vianda: llena esa cantidad de las cinco columnas de días. */
  mealsPerUnit: number;
  quantityUnits: number;
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
  /** La parada en la ruta del día, si ya hay una; `minutes` es el tiempo estimado de ruta. */
  route: { minutes: number | null; routeLabel: string; sequence: number } | null;
  /** El reparto ("Mañana · de 10 a 13h"): va en la barra de carga del día. */
  run: string | null;
  timeSlot: string | null;
  totalMinor: number;
  zone: string | null;
}

/** Un renglón: una vianda. */
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
  date: string;
  rows: PeriodReportRow[];
  runs: string[];
  saleMinor: number;
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
    for (const order of dayOrders) {
      const items = [...order.items].sort(compareProducts);
      for (const item of items) {
        const short = defaultAbbreviation(item.familyName);
        const size = sizeOf(item.variantName);
        const meals = Array.from({ length: DAYS }, (_, day) =>
          item.composable
            ? (item.dishSelections[day] ?? '')
            : day < Math.min(DAYS, item.mealsPerUnit)
              ? short
              : '',
        );
        const variety = item.composable ? order.customerName : short;
        const label = `${variety} ${size}`;
        const entry = summary.get(label) ?? {
          composable: item.composable,
          familyName: item.familyName,
          label,
          size,
          units: 0,
        };
        entry.units += item.quantityUnits;
        summary.set(label, entry);
        for (let unit = 0; unit < item.quantityUnits; unit += 1) {
          rows.push({
            composable: item.composable,
            familyName: item.familyName,
            first: rows.every((row) => row.order !== order),
            meals,
            order,
            size,
            variety,
          });
        }
      }
    }
    days.push({
      date,
      rows,
      runs: [...new Set(dayOrders.map((order) => order.run).filter((run) => run !== null))],
      saleMinor: dayOrders.reduce((sum, order) => sum + order.totalMinor, 0),
      units: rows.length,
    });
  }

  return {
    days,
    summary: [...summary.values()]
      .sort(
        (left, right) =>
          compareProducts(
            { composable: left.composable, familyName: left.familyName, variantName: left.size },
            { composable: right.composable, familyName: right.familyName, variantName: right.size },
          ) || left.label.localeCompare(right.label, 'es-AR'),
      )
      .map(({ label, units }) => ({ label, units })),
    totalSaleMinor: orders.reduce((sum, order) => sum + order.totalMinor, 0),
    totalUnits: days.reduce((sum, day) => sum + day.units, 0),
  };
}

/** "≈ 25 min", "≈ 1 h 10": el tiempo estimado de ruta como va en la planilla. */
export function routeMinutesLabel(minutes: number | null): string {
  if (minutes === null) return '';
  if (minutes < 60) return `≈ ${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `≈ ${String(hours)} h${rest ? ` ${String(rest).padStart(2, '0')}` : ''}`;
}
