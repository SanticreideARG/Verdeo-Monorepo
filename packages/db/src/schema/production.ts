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
/**
 * Los fondos de etiqueta guardados.
 *
 * Había uno solo: subir otro pisaba el anterior, así que probar un diseño nuevo para la próxima
 * semana significaba perder el que estaba andando. Son archivos de diseño —se hacen una vez, se
 * usan muchas— y lo normal es tener el de siempre, el de las fiestas y el que alguien está
 * probando, y cambiar entre ellos.
 *
 * Cuál está en uso lo sigue diciendo `label_settings.background_image_url`: esta tabla es la
 * biblioteca, no la elección. Así nada de lo que ya imprime necesita enterarse.
 */
export const labelBackgrounds = pgTable('label_backgrounds', {
  id: uuid('id').defaultRandom().primaryKey(),
  displayName: text('display_name').notNull(),
  imageUrl: text('image_url').notNull(),
  createdByUserId: uuid('created_by_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

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
    /** Nombre de pila e iniciales, en vez del nombre completo. */
    hideSurname: boolean('hide_surname').default(false).notNull(),
    /** El nombre sólo en las Intuitivo, que son las que no se identifican por variedad y tamaño. */
    nameOnlyForComposable: boolean('name_only_for_composable').default(false).notNull(),
    /**
     * Una etiqueta por plato en vez de una por vianda.
     *
     * La etiqueta de la vianda se pega en la tapa y dice de quién es; con esto se imprime además
     * una por cada plato de adentro, para que cada recipiente diga qué tiene sin abrirlo. Multiplica
     * la cantidad de etiquetas por la cantidad de platos, así que es una decisión de la operación y
     * no un comportamiento fijo.
     */
    onePerDish: boolean('one_per_dish').default(false).notNull(),
    /** El isotipo de Verdeo impreso en la etiqueta: el mismo que usa la aplicación. */
    showLogo: boolean('show_logo').default(true).notNull(),
    /** Cuánto mide el logo de alto y cuánto aire deja debajo, en milímetros. */
    logoHeightMm: integer('logo_height_mm').default(10).notNull(),
    logoPaddingBottomMm: integer('logo_padding_bottom_mm').default(2).notNull(),
    /** Marcas de recorte en las esquinas de cada etiqueta, fuera de ella. */
    showCutLines: boolean('show_cut_lines').default(true).notNull(),
    /** Una frase propia (campo "Frase"): la misma en todas las etiquetas. */
    customPhrase: text('custom_phrase'),
    /** Cómo se acomoda el contenido; se valida contra el catálogo del paquete de etiquetas. */
    layout: text('layout').default('clasica').notNull(),
    /*
     * Etiquetas de cocina: una por plato para pegar en cada recipiente, sin el nombre del cliente,
     * con el diseño fijo de la hoja de producción (plato, acompañamiento y "KETO ELAB # 24-09").
     */
    kitchenMode: boolean('kitchen_mode').default(false).notNull(),
    /** En la etiqueta de cocina: mostrar el tamaño (sin él, 250 y 400 llevan la misma). */
    showSize: boolean('show_size').default(false).notNull(),
    /** En la etiqueta de cocina, los Intuitivo llevan el nombre del cliente: cambian de uno a otro. */
    intuitivoCustomerName: boolean('intuitivo_customer_name').default(true).notNull(),
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
    /** Si el nombre del cliente se imprime; apagado, la etiqueta sale sin ese renglón. */
    showCustomerName: boolean('show_customer_name').default(true).notNull(),
    /** Tamaño del nombre, en porcentaje del que trae el formato. */
    nameScale: integer('name_scale').default(100).notNull(),
    /** 'arriba' (antes de los campos) o 'abajo' (después). */
    namePosition: text('name_position').default('arriba').notNull(),
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
    check(
      'label_settings_logo_height_check',
      sql`${table.logoHeightMm} >= 3 and ${table.logoHeightMm} <= 40`,
    ),
    check(
      'label_settings_logo_padding_check',
      sql`${table.logoPaddingBottomMm} >= 0 and ${table.logoPaddingBottomMm} <= 20`,
    ),
    check('label_settings_custom_phrase_check', sql`length(${table.customPhrase}) <= 120`),
    // Entre 60% y 200%: por debajo no se lee de lejos y por encima se desborda la etiqueta.
    check(
      'label_settings_font_scale_check',
      sql`${table.fontScale} >= 60 and ${table.fontScale} <= 200`,
    ),
  ],
);

/**
 * El stock para la venta de un período (STOCK_PLAN.md): lo que se cocina de más para tener
 * disponible, por variedad y tamaño. No es un pedido ni tiene cliente, así que no cuenta en las
 * ventas ni entra a repartos ni rutas; cuenta para producción y para lo que se puede vender del
 * stock. Es sólo de su período: lo que no se vende se da de baja al cerrarlo.
 */
export const productionStock = pgTable(
  'production_stock',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    salesCycleId: uuid('sales_cycle_id')
      .notNull()
      .references(() => salesCycles.id, { onDelete: 'cascade' }),
    familyName: text('family_name').notNull(),
    variantName: text('variant_name').notNull(),
    quantityUnits: integer('quantity_units').notNull(),
    notes: text('notes'),
    /*
     * De dónde sale (FIXES_2026_10_22_PLAN.md, A): `planned` es lo que se cocina de más para este
     * período; `carry_over` es el sobrante ya cocinado de un período anterior. El sobrante se vende
     * pero no se cocina: no suma a la planilla de cocina.
     */
    origin: text('origin').default('planned').notNull(),
    fromSalesCycleId: uuid('from_sales_cycle_id').references(() => salesCycles.id, {
      onDelete: 'set null',
    }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('production_stock_cycle_origin_variant_unique').on(
      table.salesCycleId,
      table.origin,
      table.familyName,
      table.variantName,
    ),
    check('production_stock_origin_check', sql`${table.origin} in ('planned', 'carry_over')`),
    check('production_stock_quantity_positive_check', sql`${table.quantityUnits} > 0`),
  ],
);
