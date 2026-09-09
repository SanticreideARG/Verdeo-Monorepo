/**
 * Cómo se escribe una fecha en Verdeo. Una sola vez, para toda la aplicación.
 *
 * Antes cada pantalla formateaba por su cuenta y el resultado eran cuatro formas de decir el mismo
 * día: `2026-09-07` en la lista de rutas, `13/9/2026` en la tabla de pedidos, "13 de septiembre de
 * 2026" en la ficha, "07-sept al 13-sept" en el selector de período. No es sólo prolijidad: el
 * desfasaje de un día entre el período y la fecha de entrega estuvo escondido semanas justamente
 * porque dos pantallas escribían la fecha distinto y nadie las comparó.
 *
 * La regla: **con nombre de mes, siempre**. `13/9` y `9/13` son la misma cadena para dos personas
 * distintas, y una planilla que se reenvía sale del país más seguido de lo que parece.
 */

/**
 * La zona horaria en la que opera Verdeo.
 *
 * Está fija y no leída de una configuración porque la operación es argentina: una semana que
 * "cierra el domingo a las 23:15" cierra a esa hora acá, no en la zona del navegador de quien mira
 * la pantalla. El día que Verdeo opere en otro huso esto se vuelve un ajuste; hoy sería una
 * configuración con un solo valor posible.
 */
export const OPERATION_TIME_ZONE = 'America/Argentina/Buenos_Aires';

/**
 * Una fecha sin hora —`2026-09-13`— no es un instante y no se convierte a uno.
 *
 * Pasarla por `new Date()` la interpreta como medianoche UTC, que en Argentina es el día anterior a
 * las 21: la fecha de entrega se mostraba corrida un día. Se parte la cadena y listo.
 */
function isPlainDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const SHORT_MONTHS = MONTHS.map((month) => month.slice(0, 3));

function partsOf(value: string): { day: number; month: number; year: number } {
  if (isPlainDate(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return { day: day ?? 1, month: month ?? 1, year: year ?? 1970 };
  }
  const formatted = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: OPERATION_TIME_ZONE,
    year: 'numeric',
  }).format(new Date(value));
  const [year, month, day] = formatted.split('-').map(Number);
  return { day: day ?? 1, month: month ?? 1, year: year ?? 1970 };
}

/** "13 sep 2026" — para tablas y listas, donde el año importa poco pero el mes tiene que ser mes. */
export function formatDay(value: string): string {
  const { day, month, year } = partsOf(value);
  return `${String(day)} ${SHORT_MONTHS[month - 1] ?? ''} ${String(year)}`;
}

/** "13 de septiembre de 2026" — para fichas y textos, donde se lee de corrido. */
export function formatDayLong(value: string): string {
  const { day, month, year } = partsOf(value);
  return `${String(day)} de ${MONTHS[month - 1] ?? ''} de ${String(year)}`;
}

/** "13 sep 2026, 14:05" — cuando la hora es parte del dato: una sesión, una revisión, un cambio. */
export function formatMoment(iso: string): string {
  // 24 horas, explícito: el formato por defecto de `es-AR` devuelve "11:15 p. m.", que en una
  // pantalla de operación ocupa más y se lee peor que "23:15".
  const time = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    timeZone: OPERATION_TIME_ZONE,
  }).format(new Date(iso));
  return `${formatDay(iso)}, ${time}`;
}

/**
 * El día de entrega de una semana, a partir de su hora de cierre, en el formato `YYYY-MM-DD` que
 * espera el contrato.
 *
 * `en-CA` no es una elección estética: es el locale que `Intl` formatea así.
 */
export function deliveryDateFor(closeAtIso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: OPERATION_TIME_ZONE,
    year: 'numeric',
  }).format(new Date(closeAtIso));
}

/** El mismo día de entrega, escrito para una persona. */
export function deliveryDateLabel(closeAtIso: string): string {
  return formatDayLong(deliveryDateFor(closeAtIso));
}
