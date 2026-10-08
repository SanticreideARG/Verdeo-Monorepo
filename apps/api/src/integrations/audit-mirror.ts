export interface MirroredAuditEvent {
  action: string;
  actorType: string;
  actorUserId: string | null;
  correlationId: string;
  entityId: string;
  entityType: string;
  id: string;
  occurredAt: Date;
  requestId: string;
  source: string;
}

/**
 * Copia a la base paralela los eventos de auditoría que todavía no están.
 *
 * Se copia **después**, desde la tabla ya confirmada, y no en el momento de escribir cada evento:
 * así un pedido que se deshace no deja una copia de algo que nunca pasó, y una caída de Supabase
 * no puede romper un pedido. Lo que no se copió hoy se copia en la próxima corrida.
 *
 * Es seguro repetir: la copia usa el id del evento, así que copiar dos veces lo mismo no duplica.
 * Sólo viajan los datos de identificación del evento (qué, sobre qué, quién, cuándo): ni el antes
 * y después ni los metadatos, que son donde aparecen nombres, direcciones y teléfonos.
 */
export async function syncAuditMirror(deps: {
  batchSize: number;
  fetchEvents: (since: Date | null, limit: number) => Promise<MirroredAuditEvent[]>;
  lastMirroredAt: () => Promise<{ at: Date | null; detail: string; ok: boolean }>;
  push: (events: MirroredAuditEvent[]) => Promise<{ detail: string; ok: boolean }>;
}): Promise<{ copied: number; detail: string; ok: boolean }> {
  const last = await deps.lastMirroredAt();
  if (!last.ok) return { copied: 0, detail: last.detail, ok: false };

  /*
   * Un milisegundo después de la última copia.
   *
   * La base guarda microsegundos y la copia, que pasa por una fecha de JavaScript, milisegundos.
   * Sin el corrimiento, el último evento copiado se vería "posterior" a su propia copia y se
   * volvería a copiar en cada corrida, y nunca se podría decir "al día".
   */
  const since = last.at ? new Date(last.at.getTime() + 1) : null;
  const events = await deps.fetchEvents(since, deps.batchSize);
  if (events.length === 0) return { copied: 0, detail: 'al día', ok: true };

  const pushed = await deps.push(events);
  return pushed.ok
    ? { copied: events.length, detail: `${String(events.length)} copiados`, ok: true }
    : { copied: 0, detail: pushed.detail, ok: false };
}
