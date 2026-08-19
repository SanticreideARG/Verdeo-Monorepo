import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    displayName: text('display_name').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    status: text('status').default('active').notNull(),
    ...timestamps,
  },
  (table) => [
    index('customers_display_name_idx').on(table.displayName),
    index('customers_status_idx').on(table.status),
  ],
);

export const customerIdentities = pgTable(
  'customer_identities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    valueNormalized: text('value_normalized').notNull(),
    valueDisplay: text('value_display').notNull(),
    verified: boolean('verified').default(false).notNull(),
    primary: boolean('primary').default(false).notNull(),
    active: boolean('active').default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('customer_identities_active_value_unique')
      .on(table.type, table.valueNormalized)
      .where(sql`${table.active} = true`),
    index('customer_identities_customer_idx').on(table.customerId),
  ],
);

export const salesCycles = pgTable(
  'sales_cycles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    alias: text('alias').notNull().unique(),
    openAt: timestamp('open_at', { withTimezone: true }).notNull(),
    partialKitchenCutoffAt: timestamp('partial_kitchen_cutoff_at', {
      withTimezone: true,
    }).notNull(),
    closeAt: timestamp('close_at', { withTimezone: true }).notNull(),
    status: text('status').default('DRAFT').notNull(),
    ...timestamps,
  },
  (table) => [
    index('sales_cycles_status_idx').on(table.status),
    check(
      'sales_cycles_cutoff_order_check',
      sql`${table.openAt} < ${table.partialKitchenCutoffAt} and ${table.partialKitchenCutoffAt} < ${table.closeAt}`,
    ),
  ],
);

export const productFamilies = pgTable('product_families', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  displayName: text('display_name').notNull(),
  active: boolean('active').default(true).notNull(),
  ...timestamps,
});

export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productFamilyId: uuid('product_family_id')
      .notNull()
      .references(() => productFamilies.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    displayName: text('display_name').notNull(),
    mealsPerUnit: integer('meals_per_unit').default(5).notNull(),
    active: boolean('active').default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('product_variants_family_code_unique').on(table.productFamilyId, table.code),
    check('product_variants_meals_positive_check', sql`${table.mealsPerUnit} > 0`),
  ],
);

export const weeklyMenus = pgTable(
  'weekly_menus',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    salesCycleId: uuid('sales_cycle_id')
      .notNull()
      .references(() => salesCycles.id, { onDelete: 'restrict' }),
    status: text('status').default('DRAFT').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    revision: integer('revision').default(1).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('weekly_menus_cycle_revision_unique').on(table.salesCycleId, table.revision),
    index('weekly_menus_status_idx').on(table.status),
  ],
);

export const weeklyMenuOfferings = pgTable(
  'weekly_menu_offerings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    weeklyMenuId: uuid('weekly_menu_id')
      .notNull()
      .references(() => weeklyMenus.id, { onDelete: 'cascade' }),
    productVariantId: uuid('product_variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    unitPriceMinor: integer('unit_price_minor').notNull(),
    currency: text('currency').default('ARS').notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('weekly_menu_offerings_menu_variant_unique').on(
      table.weeklyMenuId,
      table.productVariantId,
    ),
    check('weekly_menu_offerings_price_check', sql`${table.unitPriceMinor} >= 0`),
  ],
);

export const weeklyMenuItems = pgTable(
  'weekly_menu_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    offeringId: uuid('offering_id')
      .notNull()
      .references(() => weeklyMenuOfferings.id, { onDelete: 'cascade' }),
    slot: integer('slot').notNull(),
    dishName: text('dish_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('weekly_menu_items_offering_slot_unique').on(table.offeringId, table.slot),
    check('weekly_menu_items_slot_check', sql`${table.slot} between 1 and 5`),
  ],
);

export const orderPublicNumberSequence = pgSequence('order_public_number_seq', { startWith: 1 });

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    publicNumber: text('public_number')
      .default(sql`'N' || lpad(nextval('order_public_number_seq')::text, 5, '0')`)
      .notNull()
      .unique(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    salesCycleId: uuid('sales_cycle_id')
      .notNull()
      .references(() => salesCycles.id, { onDelete: 'restrict' }),
    weeklyMenuId: uuid('weekly_menu_id')
      .notNull()
      .references(() => weeklyMenus.id, { onDelete: 'restrict' }),
    status: text('status').default('DRAFT').notNull(),
    source: text('source').notNull(),
    deliveryDate: date('delivery_date').notNull(),
    deliveryAddressSnapshot: text('delivery_address_snapshot').notNull(),
    paymentExpectation: text('payment_expectation').notNull(),
    notes: text('notes'),
    currency: text('currency').default('ARS').notNull(),
    totalMinor: integer('total_minor').notNull(),
    ...timestamps,
  },
  (table) => [
    index('orders_cycle_status_idx').on(table.salesCycleId, table.status),
    index('orders_customer_idx').on(table.customerId),
    index('orders_created_at_idx').on(table.createdAt),
    check('orders_total_check', sql`${table.totalMinor} >= 0`),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    offeringId: uuid('offering_id').references(() => weeklyMenuOfferings.id, {
      onDelete: 'set null',
    }),
    productVariantId: uuid('product_variant_id').references(() => productVariants.id, {
      onDelete: 'set null',
    }),
    productNameSnapshot: text('product_name_snapshot').notNull(),
    variantSnapshot: text('variant_snapshot').notNull(),
    quantityUnits: integer('quantity_units').notNull(),
    unitPriceMinor: integer('unit_price_minor').notNull(),
    discountMinor: integer('discount_minor').default(0).notNull(),
    surchargeMinor: integer('surcharge_minor').default(0).notNull(),
    totalMinor: integer('total_minor').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('order_items_order_idx').on(table.orderId),
    check('order_items_quantity_check', sql`${table.quantityUnits} > 0`),
    check(
      'order_items_money_check',
      sql`${table.unitPriceMinor} >= 0 and ${table.discountMinor} >= 0 and ${table.surchargeMinor} >= 0 and ${table.totalMinor} >= 0`,
    ),
  ],
);

export const orderItemSelections = pgTable(
  'order_item_selections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'cascade' }),
    slot: integer('slot').notNull(),
    dishNameSnapshot: text('dish_name_snapshot').notNull(),
  },
  (table) => [
    uniqueIndex('order_item_selections_item_slot_unique').on(table.orderItemId, table.slot),
  ],
);

export const orderDietaryInstructions = pgTable('order_dietary_instructions', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  instruction: text('instruction').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    reason: text('reason'),
    actorUserId: uuid('actor_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('order_status_history_order_idx').on(table.orderId, table.createdAt)],
);
