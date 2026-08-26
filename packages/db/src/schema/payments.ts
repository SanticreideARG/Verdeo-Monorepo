import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './auth.js';
import { orders } from './operations.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

/**
 * PAYMENTS.md: "No usar un único campo mutable para representar toda la historia." `payments` is
 * the current computed state (PENDING/TO_SETTLE/PAID); `cashCollections`/`cashSettlements` are the
 * actual transaction records that state is derived from — a settlement never rewrites a
 * collection, it references it, so the history of who collected what and who later settled it
 * stays intact even after the order-level status moves on.
 */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: 'cascade' }),
    status: text('status').default('PENDING').notNull(),
    // What the customer said they'd pay with at checkout vs what was actually collected — the doc's
    // "método solicitado/esperado vs transacciones reales". A customer can change method at any
    // point, so this is a snapshot, not a constraint on what a collection may record.
    expectedMethod: text('expected_method').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').default('ARS').notNull(),
    ...timestamps,
  },
  (table) => [
    check('payments_status_check', sql`${table.status} in ('PENDING', 'TO_SETTLE', 'PAID')`),
    check('payments_amount_check', sql`${table.amountMinor} >= 0`),
  ],
);

export const cashCollections = pgTable(
  'cash_collections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    amountMinor: integer('amount_minor').notNull(),
    method: text('method').notNull(),
    collectedByUserId: uuid('collected_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    collectedAt: timestamp('collected_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check('cash_collections_amount_check', sql`${table.amountMinor} > 0`)],
);

/**
 * The admin-editable catalog behind "Método" pickers (order intake, cobro manual). `isCash`
 * decides settlement routing — recordCollection consults this by code before falling back to a
 * hardcoded heuristic, so an operator adding a new method here also decides whether it goes
 * TO_SETTLE (cash-in-hand, needs a later rendición) or straight to PAID.
 */
export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    displayName: text('display_name').notNull(),
    isCash: boolean('is_cash').default(false).notNull(),
    active: boolean('active').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('payment_methods_code_unique').on(table.code)],
);

export const cashSettlements = pgTable(
  'cash_settlements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => cashCollections.id, { onDelete: 'restrict' }),
    amountMinor: integer('amount_minor').notNull(),
    settledByUserId: uuid('settled_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    receivedByUserId: uuid('received_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    settledAt: timestamp('settled_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // One settlement per collection: a collection is either not yet settled or settled once — no
    // partial settlements in V1.
    uniqueIndex('cash_settlements_collection_unique').on(table.collectionId),
    check('cash_settlements_amount_check', sql`${table.amountMinor} > 0`),
  ],
);
