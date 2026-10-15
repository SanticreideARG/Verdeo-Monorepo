/**
 * El orden de la lista de pedidos, para "Anterior" y "Siguiente" en el detalle.
 *
 * La lista lo guarda en la pestaña cada vez que cambia (con sus filtros y su orden); el detalle lo
 * lee para saber cuál viene antes y después del que se está mirando. Es por pestaña y se pierde al
 * cerrarla: no es un dato, es por dónde se venía navegando. Si no está (se llegó al pedido por un
 * enlace), los botones no aparecen.
 */
const KEY = 'verdeo.pedidos.lista';

export interface OrderNavItem {
  id: string;
  publicNumber: string;
}

export function rememberOrderList(items: readonly OrderNavItem[]) {
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify(items.map(({ id, publicNumber }) => ({ id, publicNumber }))),
    );
  } catch {
    // Sin almacenamiento (modo privado): simplemente no hay anterior ni siguiente.
  }
}

export function neighboursOf(orderId: string): {
  next: OrderNavItem | null;
  position: { index: number; total: number } | null;
  previous: OrderNavItem | null;
} {
  let items: OrderNavItem[];
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
    items = Array.isArray(parsed) ? (parsed as OrderNavItem[]) : [];
  } catch {
    items = [];
  }
  const index = items.findIndex((item) => item.id === orderId);
  if (index === -1) return { next: null, position: null, previous: null };
  return {
    next: items[index + 1] ?? null,
    position: { index: index + 1, total: items.length },
    previous: items[index - 1] ?? null,
  };
}
