/**
 * La zona horaria en la que opera Verdeo.
 *
 * Está fija y no leída de una configuración porque la operación es argentina y una semana que
 * "cierra el domingo a las 23:15" cierra a esa hora en Argentina, no en la zona del navegador de
 * quien mira la pantalla. El día que Verdeo opere en otro huso, esto se vuelve un ajuste; hoy sería
 * una configuración con un solo valor posible.
 */
const OPERATION_TIME_ZONE = 'America/Argentina/Buenos_Aires';

/**
 * El día de entrega de una semana, a partir de su hora de cierre.
 *
 * Recortar los diez primeros caracteres del ISO parece equivalente y no lo es: devuelve el día en
 * UTC. Una semana que cierra el domingo 13 a las 23:15 de Argentina se guarda como
 * `2026-09-14T02:15:00Z`, así que el recorte daba el 14 — y la pantalla, que sí formatea en hora
 * local, mostraba "07-sept al 13-sept" mientras los pedidos salían con entrega el 14. El mismo
 * período decía dos fechas distintas según dónde se lo mirara.
 *
 * `en-CA` no es una elección estética: es el locale que `Intl` formatea como `YYYY-MM-DD`, que es
 * exactamente lo que el contrato espera para una fecha sin hora.
 */
export function deliveryDateFor(closeAtIso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: OPERATION_TIME_ZONE,
    year: 'numeric',
  }).format(new Date(closeAtIso));
}

/** La misma fecha, escrita para una persona: "domingo 13 de septiembre de 2026". */
export function deliveryDateLabel(closeAtIso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'full',
    timeZone: OPERATION_TIME_ZONE,
  }).format(new Date(closeAtIso));
}
