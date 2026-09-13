import { sql } from 'drizzle-orm';
import {
  boolean,
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

// Singleton, same pattern as surplusConfigs: one global row for the kitchen label generator
// (labels per printed page + optional background image), editable from Ajustes by
// superusers/operators. Not per-site — a single operation-wide label format was the request, not a
// per-zone one like Intuitivo.
export const labelSettings = pgTable(
  'label_settings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    labelsPerPage: integer('labels_per_page').default(8).notNull(),
    // La hoja, en milímetros: A4 por defecto, con 12 mm de margen y 4 mm entre etiquetas, que es
    // exactamente lo que estaba escrito a mano en el generador de la impresión.
    sheetWidthMm: integer('sheet_width_mm').default(210).notNull(),
    sheetHeightMm: integer('sheet_height_mm').default(297).notNull(),
    sheetMarginMm: integer('sheet_margin_mm').default(12).notNull(),
    labelGapMm: integer('label_gap_mm').default(4).notNull(),
    backgroundImageUrl: text('background_image_url'),
    // Tipografía y tamaño de la etiqueta impresa. Se guardan como texto porque van derecho a un
    // `font-family` y a un multiplicador de CSS: acotar el juego con un enum en la base obligaría a
    // migrar cada vez que se agregue una fuente.
    fontFamily: text('font_family').default('system').notNull(),
    fontScale: integer('font_scale').default(100).notNull(),
    /*
     * Qué campos se imprimen, en el orden en que se muestran.
     *
     * Como texto separado por comas y no como columnas booleanas: la lista de campos posibles va a
     * crecer, y cada campo nuevo sería una migración. El servidor valida contra su propio catálogo
     * al leer, así que un campo viejo que ya no existe se ignora en vez de romper la impresión.
     */
    fields: text('fields').default('tamano,numero').notNull(),
    /** Izquierda o centro. La etiqueta es chica: son las dos que tienen sentido. */
    alignment: text('alignment').default('center').notNull(),
    /** El nombre en mayúsculas se lee de más lejos, que es como se leen sobre una mesa. */
    uppercaseName: boolean('uppercase_name').default(false).notNull(),
    /** El recuadro punteado guía la tijera; sobre etiqueta autoadhesiva sobra. */
    showBorders: boolean('show_borders').default(true).notNull(),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    check(
      'label_settings_labels_per_page_check',
      sql`${table.labelsPerPage} >= 4 and ${table.labelsPerPage} <= 12`,
    ),
    // Entre 60% y 200%: por debajo no se lee de lejos y por encima se desborda la etiqueta.
    check(
      'label_settings_font_scale_check',
      sql`${table.fontScale} >= 60 and ${table.fontScale} <= 200`,
    ),
  ],
);
