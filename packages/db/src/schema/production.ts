import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './auth.js';
import { salesCycles } from './operations.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

// What kitchen actually reported as "salido" for a (family, variant) pair in a cycle. One row per
// pair, upserted on each report — the count is a current fact, not an event log; `orderStatusHistory`
// -style tables exist elsewhere for anything that needs a full history instead.
export const productionActuals = pgTable(
  'production_actuals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    salesCycleId: uuid('sales_cycle_id')
      .notNull()
      .references(() => salesCycles.id, { onDelete: 'cascade' }),
    familyName: text('family_name').notNull(),
    variantName: text('variant_name').notNull(),
    quantityUnits: integer('quantity_units').notNull(),
    reportedByUserId: uuid('reported_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reportedAt: timestamp('reported_at', { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('production_actuals_cycle_family_variant_unique').on(
      table.salesCycleId,
      table.familyName,
      table.variantName,
    ),
    check('production_actuals_quantity_nonnegative_check', sql`${table.quantityUnits} >= 0`),
  ],
);

// A point-in-time consolidation: the planned kitchen summary, the actuals reported so far, and (for
// 'final') the delta against the prior 'partial'. Regenerating overwrites the row for that (cycle,
// kind) — the payload is a cache of a computed view, not a second source of truth for the underlying
// orders/actuals, which stay queryable directly regardless of whether a snapshot was ever taken.
export const productionSnapshots = pgTable(
  'production_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    salesCycleId: uuid('sales_cycle_id')
      .notNull()
      .references(() => salesCycles.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    generatedByUserId: uuid('generated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('production_snapshots_cycle_kind_unique').on(table.salesCycleId, table.kind),
    check('production_snapshots_kind_check', sql`${table.kind} in ('partial', 'final')`),
  ],
);

// Singleton: a single global row holds the V1 coefficient. The doc keeps the door open to a
// per-product/size coefficient later; that would replace this table's row shape, not extend it in
// place, so no site/product scoping is added preemptively.
export const surplusConfigs = pgTable(
  'surplus_configs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    coefficientPercent: numeric('coefficient_percent', { precision: 5, scale: 2 })
      .default('0')
      .notNull(),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    check(
      'surplus_configs_coefficient_range_check',
      sql`${table.coefficientPercent} >= 0 and ${table.coefficientPercent} <= 100`,
    ),
  ],
);

// "Dar de baja remanente": excedente that will not sell and is written off instead of carried
// anywhere (nothing carries to the next cycle per the spec). One row per write-off event, kept as a
// log rather than upserted, since a baja is an action that happened, not a fact to overwrite.
export const surplusWriteoffs = pgTable(
  'surplus_writeoffs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    salesCycleId: uuid('sales_cycle_id')
      .notNull()
      .references(() => salesCycles.id, { onDelete: 'cascade' }),
    familyName: text('family_name').notNull(),
    variantName: text('variant_name').notNull(),
    quantityUnits: integer('quantity_units').notNull(),
    reason: text('reason').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check('surplus_writeoffs_quantity_positive_check', sql`${table.quantityUnits} > 0`)],
);
