import type { WeeklyMenu } from './operations.js';

export interface Period {
  alias: string;
  closeAt: string;
  id: string;
  openAt: string;
  status: string;
}

/**
 * Los períodos sobre los que se puede trabajar, sacados de los menús.
 *
 * No hay un endpoint de ciclos y no hace falta: todo pedido referencia un menú, así que un ciclo sin
 * menú tampoco tiene pedidos. Los menús vienen uno por ciudad, y acá interesa el ciclo, así que se
 * deduplican por `cycle.id`.
 */
export function periodsFromMenus(menus: readonly WeeklyMenu[]): Period[] {
  const byId = new Map<string, Period>();
  for (const menu of menus) {
    if (!byId.has(menu.cycle.id)) {
      byId.set(menu.cycle.id, {
        alias: menu.cycle.alias,
        closeAt: menu.cycle.closeAt,
        id: menu.cycle.id,
        openAt: menu.cycle.openAt,
        status: menu.cycle.status,
      });
    }
  }
  // El más reciente primero: es el que se está trabajando, y el histórico se busca hacia abajo.
  return [...byId.values()].sort((left, right) => right.openAt.localeCompare(left.openAt));
}

/**
 * Sobre cuál período se abre una pantalla.
 *
 * El que está vendiéndose: abierto y todavía sin cerrar. Si ninguno cumple —porque cerraron todos y
 * el próximo no se cargó— cae al más reciente, que es lo último sobre lo que se trabajó. Nunca
 * devuelve "todos": tener el histórico entero delante es justamente lo que se quiere evitar.
 */
export function currentPeriod(periods: readonly Period[]): Period | null {
  const now = Date.now();
  const open = periods.find(
    (period) => period.status !== 'CLOSED' && new Date(period.closeAt).getTime() >= now,
  );
  return open ?? periods[0] ?? null;
}

/** "Semana 36 · 8 al 14 de sep" — el alias solo no siempre dice de cuándo es. */
export function periodLabel(period: Period): string {
  const format = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' });
  return `${period.alias} · ${format.format(new Date(period.openAt))} al ${format.format(new Date(period.closeAt))}`;
}
