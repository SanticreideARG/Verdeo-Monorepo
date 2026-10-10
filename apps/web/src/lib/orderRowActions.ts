export type OrderRowActionKey = 'cancel' | 'confirm' | 'delete' | 'ready' | 'revert' | 'view';

export interface OrderRowAction {
  key: OrderRowActionKey;
  label: string;
  tone?: 'danger';
}

/**
 * Qué acciones tiene una fila de pedido, y cuál va a la vista.
 *
 * Las tres o cuatro acciones posibles iban todas como botones, y en una columna angosta se apilaban:
 * cada fila medía 138 px y entraban cinco pedidos por pantalla. A la vista queda sólo **el paso que
 * sigue** —confirmar un borrador, marcar listo uno confirmado—, que es lo que se hace con la lista;
 * el resto va al menú "⋯". Revertir, cancelar y eliminar son excepciones: que cuesten un clic más
 * también evita tocarlas sin querer.
 *
 * "Ver detalle" está siempre en el menú porque el doble clic sobre la fila no se ve: es la forma de
 * descubrir que el detalle existe.
 */
export function orderRowActions(
  order: { status: string },
  permissions: readonly string[],
): { menu: OrderRowAction[]; primary: OrderRowAction | null } {
  const can = (permission: string) => permissions.includes(permission);
  let primary: OrderRowAction | null = null;
  if (order.status === 'DRAFT' && can('orders.confirm')) {
    primary = { key: 'confirm', label: 'Confirmar' };
  } else if (order.status === 'CONFIRMED' && can('orders.edit')) {
    primary = { key: 'ready', label: 'Marcar listo' };
  }

  const menu: OrderRowAction[] = [{ key: 'view', label: 'Ver detalle' }];
  if (['READY', 'DELIVERED'].includes(order.status) && can('orders.revert_status')) {
    menu.push({ key: 'revert', label: 'Revertir estado' });
  }
  if (['DRAFT', 'CONFIRMED'].includes(order.status) && can('orders.cancel')) {
    menu.push({ key: 'cancel', label: 'Cancelar pedido' });
  }
  if (can('orders.delete')) menu.push({ key: 'delete', label: 'Eliminar', tone: 'danger' });
  return { menu, primary };
}
