/**
 * Quién hizo un cambio, dicho para una persona.
 *
 * La base guarda el `actor_user_id` de cada cambio desde siempre, pero la pantalla sólo mostraba
 * cuándo y de qué estado a cuál: para saber quién había confirmado un pedido había que ir a la
 * auditoría. El nombre sale de unir con la tabla de usuarios; lo que queda por resolver acá es qué
 * decir cuando **no hay** un usuario, que son tres casos distintos y se leen distinto:
 *
 * - **Un pedido que entró por la web** no tiene usuario: lo cargó el propio cliente.
 * - **Una entrega confirmada con el enlace del repartidor** tampoco —el enlace no es una cuenta—,
 *   pero trae su propio motivo ("Entrega confirmada desde el enlace de la ruta"), que ya lo explica:
 *   repetirlo como "sin usuario" sería ruido.
 * - **Un usuario que ya no existe** sí tiene `actor_user_id`, pero la unión no encuentra su nombre.
 *   Se dice, en lugar de mostrar el cambio como si nadie lo hubiera hecho.
 */
export function historyActor(entry: {
  actorDisplayName: string | null;
  actorUserId: string | null;
  fromStatus?: string | null;
  reason?: string | null;
}): string | null {
  if (entry.actorDisplayName) return entry.actorDisplayName;
  if (entry.actorUserId) return 'un usuario que ya no existe';
  // Sin estado anterior es el alta del pedido, y sin usuario es el cliente desde la web.
  if (entry.fromStatus === null) return 'el cliente, desde la web';
  // El motivo ya dice qué pasó (el enlace de reparto): decir además "sin usuario" es repetirse.
  return entry.reason ? null : 'sin usuario';
}
