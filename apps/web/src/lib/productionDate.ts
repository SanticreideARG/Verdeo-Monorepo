import { addDaysIso, deliveryDateFor } from './dates.js';

/** Los días, como los cuenta `Date#getUTCDay`: 0 domingo … 6 sábado. */
export const WEEKDAY_NAMES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

/** El desfase en semanas que se puede elegir, de una antes a cuatro después. */
export const WEEK_OFFSETS = [-1, 0, 1, 2, 3, 4] as const;

function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

/**
 * La fecha de elaboración que propone el generador de etiquetas (2026-11-25).
 *
 * El primer `weekday` (por defecto, jueves) entre la apertura y el cierre del período, en días de
 * la operación; si el período es más corto y no lo tiene, el primero después de la apertura. Después
 * se corre `weekOffset` semanas. Devuelve `YYYY-MM-DD`.
 */
export function periodProductionDate(
  period: { closeAt: string; openAt: string },
  weekday = 4,
  weekOffset = 0,
): string {
  const openDay = deliveryDateFor(period.openAt);
  const ahead = (weekday - weekdayOf(openDay) + 7) % 7;
  return addDaysIso(openDay, ahead + 7 * weekOffset);
}
