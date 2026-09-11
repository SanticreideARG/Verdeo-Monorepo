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
