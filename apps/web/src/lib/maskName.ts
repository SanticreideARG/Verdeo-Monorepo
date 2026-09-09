/**
 * El nombre sin apellido, para mostrar o mandar una lista sin exponer a quién compra.
 *
 * Una pantalla de pedidos se proyecta, se fotografía y se reenvía; una planilla, más todavía. El
 * nombre de pila alcanza para saber de quién es cada vianda, el apellido completo no hace falta, y
 * una vez que salió ya no vuelve. Se dejan las iniciales en vez de borrarlas para que dos "Ana"
 * sigan siendo dos personas distinguibles.
 *
 * Un nombre de una sola palabra queda como está: no hay apellido que tapar.
 *
 * OJO: `packages/orders/src/order-export.ts` tiene la misma función para la exportación, así que lo
 * que se ve en pantalla y lo que sale en el archivo dicen igual. Si cambia una, cambia la otra. No
 * se comparte el módulo porque el navegador no importa paquetes del servidor: habla por HTTP.
 */
export function maskSurname(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return displayName.trim();
  const [first, ...rest] = parts;
  return [first, ...rest.map((part) => `${[...part][0] ?? ''}.`)].join(' ');
}

const STORAGE_KEY = 'verdeo-mask-surnames';

/**
 * Que tapar apellidos siga activado la próxima vez.
 *
 * Es una preferencia de lectura, no un permiso: quien decide mostrar la pantalla en una reunión no
 * quiere volver a tildarlo cada vez que entra.
 */
export function readMaskSurnames(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeMaskSurnames(masked: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, masked ? '1' : '0');
  } catch {
    // Sin almacenamiento (ventana privada) vale para esta sesión y ya.
  }
}
