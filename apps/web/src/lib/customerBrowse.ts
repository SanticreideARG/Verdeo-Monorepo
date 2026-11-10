/*
 * Clientes 2 (2026-11-07): orden, filtros y vista de la lista de clientes.
 *
 * La lista se pide ordenada y filtrada al servidor —con miles de clientes, ordenar lo cargado no
 * alcanza— y pagina por desplazamiento. El orden y la vista se recuerdan por persona en el
 * navegador; los filtros no, porque un filtro olvidado puesto hace creer que faltan clientes.
 */

export type CustomerSort = 'created' | 'last_order' | 'name' | 'orders' | 'spent';
export type CustomerView = 'cards' | 'columns';

export const CUSTOMER_SORTS: readonly { key: CustomerSort; label: string }[] = [
  { key: 'name', label: 'Nombre (A–Z)' },
  { key: 'last_order', label: 'Último pedido' },
  { key: 'orders', label: 'Más pedidos' },
  { key: 'spent', label: 'Más gastado' },
  { key: 'created', label: 'Alta más reciente' },
];

export interface CustomerFilters {
  /** Dormidos: pidieron alguna vez y no en las últimas N semanas. 0 = sin filtro. */
  inactiveWeeks: number;
  isNew: '' | 'false' | 'true';
  unlocated: boolean;
  withDebt: boolean;
  zoneId: string;
}

export const NO_FILTERS: CustomerFilters = {
  inactiveWeeks: 0,
  isNew: '',
  unlocated: false,
  withDebt: false,
  zoneId: '',
};

export function activeFilterCount(filters: CustomerFilters): number {
  return [
    filters.inactiveWeeks > 0,
    filters.isNew !== '',
    filters.unlocated,
    filters.withDebt,
    filters.zoneId !== '',
  ].filter(Boolean).length;
}

/** Los parámetros de `GET /api/v1/customers` para una página de la lista. */
export function customerListParams(input: {
  filters: CustomerFilters;
  limit: number;
  offset: number;
  search: string;
  sort: CustomerSort;
}): URLSearchParams {
  const params = new URLSearchParams({
    limit: String(input.limit),
    offset: String(input.offset),
    sort: input.sort,
  });
  const search = input.search.trim();
  if (search) params.set('search', search);
  const { filters } = input;
  if (filters.zoneId) params.set('zoneId', filters.zoneId);
  if (filters.isNew) params.set('isNew', filters.isNew);
  if (filters.withDebt) params.set('withDebt', 'true');
  if (filters.unlocated) params.set('unlocated', 'true');
  if (filters.inactiveWeeks > 0) params.set('inactiveWeeks', String(filters.inactiveWeeks));
  return params;
}

const SORT_KEY = 'verdeo-clientes-orden';
const VIEW_KEY = 'verdeo-clientes-vista';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento, la elección vale hasta recargar.
  }
}

export function readCustomerSort(): CustomerSort {
  const saved = read(SORT_KEY);
  return CUSTOMER_SORTS.find((sort) => sort.key === saved)?.key ?? 'name';
}

export function writeCustomerSort(sort: CustomerSort): void {
  write(SORT_KEY, sort);
}

export function readCustomerView(): CustomerView {
  return read(VIEW_KEY) === 'columns' ? 'columns' : 'cards';
}

export function writeCustomerView(view: CustomerView): void {
  write(VIEW_KEY, view);
}

/** "2026-09-15" → "15/09/26". */
export function shortDate(value: string | null | undefined): string {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year.slice(2)}` : value;
}

/** Cuánto hace del último pedido, en palabras cortas: "hoy", "hace 3 días", "hace 2 sem.". */
export function sinceLabel(value: string | null | undefined, today = new Date()): string {
  if (!value) return 'sin pedidos';
  const then = new Date(`${value.slice(0, 10)}T12:00:00`);
  const days = Math.round((today.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return days < 0 ? `para el ${shortDate(value)}` : 'hoy';
  if (days < 14) return days === 1 ? 'ayer' : `hace ${String(days)} días`;
  if (days < 70) return `hace ${String(Math.floor(days / 7))} sem.`;
  return `hace ${String(Math.round(days / 30))} meses`;
}

/**
 * Las métricas de la cabecera de la ficha, de los pedidos no cancelados.
 *
 * La frecuencia es el promedio entre fechas de entrega distintas: dos pedidos del mismo día son una
 * sola vez que pidió. Con menos de dos fechas no hay frecuencia que decir.
 */
export function customerMetrics(
  orders: readonly {
    currency: string;
    deliveryDate: string;
    status: string;
    totalMinor: number;
  }[],
) {
  const live = orders.filter((order) => order.status !== 'CANCELLED');
  const dates = [...new Set(live.map((order) => order.deliveryDate))].sort();
  let frequency: string | null = null;
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first && last && dates.length > 1) {
    const days =
      (new Date(`${last}T12:00:00`).getTime() - new Date(`${first}T12:00:00`).getTime()) /
      86_400_000 /
      (dates.length - 1);
    frequency =
      days < 7
        ? `cada ${String(Math.round(days))} días`
        : `cada ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(days / 7)} sem.`;
  }
  return {
    count: live.length,
    currency: live[0]?.currency ?? 'ARS',
    frequency,
    lastOrderDate: last ?? null,
    spentMinor: live.reduce((sum, order) => sum + order.totalMinor, 0),
  };
}
