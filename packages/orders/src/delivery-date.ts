/** La zona horaria en la que se opera: todas las ciudades de Verdeo están en hora argentina. */
export const OPERATION_TIME_ZONE = 'America/Argentina/Buenos_Aires';

/**
 * El día de entrega de un ciclo: la fecha de su cierre, en hora de la operación.
 *
 * No la fecha UTC del cierre. Un ciclo que cierra el domingo 13 a las 23:15 en Argentina cierra el
 * lunes 14 a las 02:15 en UTC, y cortar el ISO (`toISOString().slice(0, 10)`) daba el 14: todo
 * pedido de un ciclo que cierra después de las 21:00 salía con el día corrido.
 */
export function deliveryDateFor(closeAt: Date | string, timeZone = OPERATION_TIME_ZONE): string {
  // en-CA escribe AAAA-MM-DD, el formato de una fecha ISO sin hora.
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).format(typeof closeAt === 'string' ? new Date(closeAt) : closeAt);
}

/** Los días de la semana, como los cuenta `Date.getUTCDay()`: 0 es domingo. */
export const WEEKDAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const;

export interface DeliveryOption {
  /** AAAA-MM-DD. */
  date: string;
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
}

/** Suma días a una fecha AAAA-MM-DD sin pasar por la zona horaria de quien la calcula. */
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days));
  return value.toISOString().slice(0, 10);
}

/** El día de la semana de una fecha AAAA-MM-DD. */
export function weekdayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).getUTCDay();
}

/**
 * Los días de reparto de un período en una ciudad.
 *
 * Cada día de la semana configurado da su primera fecha desde el cierre del período, inclusive:
 * un período que cierra el domingo 13 con reparto los lunes y miércoles reparte el lunes 14 y el
 * miércoles 16. Sin días configurados, el reparto es el día del cierre, como siempre fue.
 */
export function deliveryOptions(
  closeAt: Date | string,
  weekdays: readonly number[],
  timeZone = OPERATION_TIME_ZONE,
): DeliveryOption[] {
  const closeDate = deliveryDateFor(closeAt, timeZone);
  const wanted = new Set(weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6));
  if (wanted.size === 0) return [{ date: closeDate, weekday: weekdayOf(closeDate) }];
  const options: DeliveryOption[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(closeDate, offset);
    const weekday = weekdayOf(date);
    if (wanted.has(weekday)) options.push({ date, weekday });
  }
  return options;
}

/**
 * La fecha de reparto que corresponde: la pedida si es uno de los días de reparto; si no, la del
 * día por defecto de la ciudad; si no hay, la primera.
 */
export function resolveDeliveryDate(
  options: readonly DeliveryOption[],
  requested: string | null | undefined,
  defaultWeekday: number | null | undefined,
): string {
  const pedida = options.find((option) => option.date === requested);
  if (pedida) return pedida.date;
  const porDefecto = options.find((option) => option.weekday === defaultWeekday);
  return (porDefecto ?? options[0])?.date ?? requested ?? '';
}
