import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const domainEvents = pgTable(
  'domain_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    version: integer('version').default(1).notNull(),
    payload: jsonb('payload').notNull(),
    correlationId: text('correlation_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    processingAttempts: integer('processing_attempts').default(0).notNull(),
    lastError: text('last_error'),
  },
  (table) => [
    index('domain_events_pending_idx').on(table.publishedAt, table.occurredAt),
    index('domain_events_aggregate_idx').on(table.aggregateType, table.aggregateId),
    index('domain_events_correlation_id_idx').on(table.correlationId),
  ],
);
