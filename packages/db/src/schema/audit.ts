import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorType: text('actor_type').notNull(),
    actorUserId: uuid('actor_user_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    metadata: jsonb('metadata'),
    requestId: text('request_id').notNull(),
    correlationId: text('correlation_id').notNull(),
    source: text('source').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_events_entity_idx').on(table.entityType, table.entityId),
    index('audit_events_actor_idx').on(table.actorUserId),
    index('audit_events_occurred_at_idx').on(table.occurredAt),
    index('audit_events_correlation_id_idx').on(table.correlationId),
  ],
);

/**
 * Errores del servidor, guardados para poder verlos desde el panel.
 *
 * Los logs de Vercel guardan poco tiempo y hay que ir a buscarlos a otro sitio; acá queda lo
 * justo para el panel de estado: qué falló, dónde y con qué número de solicitud. Sin cuerpos ni
 * datos de clientes: sólo el mensaje técnico.
 */
export const serverErrors = pgTable(
  'server_errors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    errorName: text('error_name').notNull(),
    message: text('message').notNull(),
    method: text('method').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
    path: text('path').notNull(),
    requestId: text('request_id').notNull(),
    status: integer('status').notNull(),
  },
  (table) => [index('server_errors_occurred_at_idx').on(table.occurredAt)],
);
