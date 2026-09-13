import type { ReactNode } from 'react';

/**
 * Una pantalla vacía que ofrece una salida.
 *
 * Los vacíos decían qué no hay y ahí terminaban: "No hay pedidos para este filtro", "Todavía no se
 * propuso ninguna ruta". El problema es que el vacío casi nunca es el estado real de la operación:
 * es un filtro puesto de más. Sin un botón que lo deshaga, la única salida es acordarse de qué se
 * tocó, y con cuatro filtros arriba eso es adivinar.
 *
 * Dos casos, y el componente es el mismo:
 * - **Vacío por filtro:** la acción lo limpia.
 * - **Vacío de verdad:** la acción lo llena ("Proponer la primera ruta").
 *
 * Sin acción también sirve —hay vacíos que no tienen nada que ofrecer, como una lista que espera
 * que elijas algo a la izquierda—, pero conviene preguntarse primero si de verdad no hay salida.
 */
export function EmptyState({
  action,
  body,
  title,
}: {
  action?: ReactNode;
  body?: ReactNode;
  title: string;
}) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      {body ? <p className="empty-state-body">{body}</p> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}
