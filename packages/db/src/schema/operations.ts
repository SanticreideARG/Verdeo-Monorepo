import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './auth.js';
import { geographicZones, operatingSites } from './geography.js';

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
    internalNotes: text('internal_notes'),
    status: text('status').default('active').notNull(),
    ...timestamps,
  },
  (table) => [
    index('customers_display_name_idx').on(table.displayName),
    index('customers_status_idx').on(table.status),
  ],
);

export const customerOperatingSites = pgTable(
  'customer_operating_sites',
  {
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    operatingSiteId: uuid('operating_site_id')
      .notNull()
      .references(() => operatingSites.id, { onDelete: 'cascade' }),
    preferredZoneId: uuid('preferred_zone_id'),
    status: text('status').default('active').notNull(),
    internalNotes: text('internal_notes'),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.customerId, table.operatingSiteId] }),
    foreignKey({
      columns: [table.preferredZoneId, table.operatingSiteId],
      foreignColumns: [geographicZones.id, geographicZones.operatingSiteId],
      name: 'customer_operating_sites_zone_site_fk',
    }).onDelete('restrict'),
    index('customer_operating_sites_site_status_idx').on(table.operatingSiteId, table.status),
    index('customer_operating_sites_customer_idx').on(table.customerId),
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
    source: text('source').default('manual').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('customer_identities_active_value_unique')
      .on(table.type, table.valueNormalized)
      .where(sql`${table.active} = true`),
    uniqueIndex('customer_identities_primary_type_unique')
      .on(table.customerId, table.type)
      .where(sql`${table.active} = true and ${table.primary} = true`),
    index('customer_identities_customer_idx').on(table.customerId),
  ],
);

export const customerAddresses = pgTable(
  'customer_addresses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    writtenAddress: text('written_address').notNull(),
    // Written locality. Descriptive only: an operation covers an area that may include neighbouring
    // localities, and the zone is what anchors the address operationally (ADR-031).
    city: text('city'),
    sector: text('sector'),
    geographicZoneId: uuid('geographic_zone_id')
      .notNull()
      .references(() => geographicZones.id, { onDelete: 'restrict' }),
    // Pre-regional free text, kept as migration evidence until every address is reclassified.
    operationalZone: text('operational_zone'),
    propertyType: text('property_type'),
    unit: text('unit'),
    accessNotes: text('access_notes'),
    locationUrl: text('location_url'),
    latitude: numeric('latitude', { precision: 9, scale: 6 }),
    longitude: numeric('longitude', { precision: 9, scale: 6 }),
    geocodingStatus: text('geocoding_status').default('NEEDS_LOCATION').notNull(),
    primary: boolean('primary').default(false).notNull(),
    active: boolean('active').default(true).notNull(),
    source: text('source').default('manual').notNull(),
    ...timestamps,
  },
  (table) => [
    index('customer_addresses_customer_idx').on(table.customerId),
    index('customer_addresses_zone_idx').on(table.operationalZone),
    uniqueIndex('customer_addresses_primary_unique')
      .on(table.customerId)
      .where(sql`${table.active} = true and ${table.primary} = true`),
    check(
      'customer_addresses_coordinates_check',
      sql`(${table.latitude} is null and ${table.longitude} is null) or (${table.latitude} between -90 and 90 and ${table.longitude} between -180 and 180)`,
    ),
  ],
);

export const geocodingRequests = pgTable(
  'geocoding_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    addressId: uuid('address_id')
      .notNull()
      .references(() => customerAddresses.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    providerKey: text('provider_key').notNull(),
    queryText: text('query_text').notNull(),
    locationUrl: text('location_url'),
    status: text('status').default('PENDING').notNull(),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    selectedCandidateId: uuid('selected_candidate_id'),
    requestedByUserId: uuid('requested_by_user_id'),
    ...timestamps,
  },
  (table) => [
    index('geocoding_requests_address_idx').on(table.addressId, table.createdAt),
    index('geocoding_requests_status_idx').on(table.status, table.updatedAt),
  ],
);

export const geocodingCandidates = pgTable(
  'geocoding_candidates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => geocodingRequests.id, { onDelete: 'cascade' }),
    providerCandidateId: text('provider_candidate_id').notNull(),
    formattedAddress: text('formatted_address').notNull(),
    latitude: numeric('latitude', { precision: 9, scale: 6 }).notNull(),
    longitude: numeric('longitude', { precision: 9, scale: 6 }).notNull(),
    city: text('city'),
    sector: text('sector'),
    locationUrl: text('location_url'),
    confidence: numeric('confidence', { precision: 5, scale: 4 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('geocoding_candidates_provider_unique').on(
      table.requestId,
      table.providerCandidateId,
    ),
    index('geocoding_candidates_request_idx').on(table.requestId),
    check(
      'geocoding_candidates_coordinates_check',
      sql`${table.latitude} between -90 and 90 and ${table.longitude} between -180 and 180`,
    ),
    check('geocoding_candidates_confidence_check', sql`${table.confidence} between 0 and 1`),
  ],
);

export const customerPreferences = pgTable(
  'customer_preferences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    value: text('value').notNull(),
    active: boolean('active').default(true).notNull(),
    source: text('source').default('manual').notNull(),
    ...timestamps,
  },
  (table) => [
    index('customer_preferences_customer_idx').on(table.customerId),
    uniqueIndex('customer_preferences_active_unique')
      .on(table.customerId, table.category, table.value)
      .where(sql`${table.active} = true`),
  ],
);

export const customerRestrictions = pgTable(
  'customer_restrictions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    reason: text('reason').notNull(),
    active: boolean('active').default(true).notNull(),
    createdByUserId: uuid('created_by_user_id'),
    resolvedByUserId: uuid('resolved_by_user_id'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('customer_restrictions_customer_idx').on(table.customerId),
    index('customer_restrictions_active_idx').on(table.active),
  ],
);

export const messageTemplates = pgTable(
  'message_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    key: text('key').notNull().unique(),
    displayName: text('display_name').notNull(),
    channel: text('channel').default('whatsapp').notNull(),
    actionKey: text('action_key'),
    body: text('body').notNull(),
    variables: jsonb('variables')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    scopeType: text('scope_type').default('global').notNull(),
    scopeReferenceId: text('scope_reference_id'),
    active: boolean('active').default(true).notNull(),
    createdByUserId: uuid('created_by_user_id'),
    updatedByUserId: uuid('updated_by_user_id'),
    ...timestamps,
  },
  (table) => [
    index('message_templates_action_idx').on(table.actionKey, table.active),
    index('message_templates_scope_idx').on(table.scopeType, table.scopeReferenceId),
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

// `kind` is a domain discriminator, not a reconfigurable catalog: FIXED families define their five
// dishes, COMPOSABLE ones let the customer pick five from the published universe. The engine branches
// on this value so the display name stays freely renameable (ADR-030).
export const productFamilies = pgTable(
  'product_families',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull().unique(),
    displayName: text('display_name').notNull(),
    kind: text('kind').default('FIXED').notNull(),
    active: boolean('active').default(true).notNull(),
    ...timestamps,
  },
  (table) => [check('product_families_kind_check', sql`${table.kind} in ('FIXED', 'COMPOSABLE')`)],
);

// Whether the weekly menu builder may include a composable ("Intuitivo") offering at all — a
// system-wide switch, not a per-week choice. "Latest row wins" (same pattern as surplus_configs):
// never updated in place, just appended to, so the setting's own history stays inspectable.
export const menuCatalogSettings = pgTable('menu_catalog_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  intuitivoEnabled: boolean('intuitivo_enabled').default(true).notNull(),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
});

// Commercial size. '250' and '400' are commercial names and never express a unit of measure.
export const productSizes = pgTable(
  'product_sizes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull().unique(),
    displayName: text('display_name').notNull(),
    mealsPerUnit: integer('meals_per_unit').default(5).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    active: boolean('active').default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    index('product_sizes_active_order_idx').on(table.active, table.sortOrder),
    check('product_sizes_meals_positive_check', sql`${table.mealsPerUnit} > 0`),
    check('product_sizes_sort_order_check', sql`${table.sortOrder} >= 0`),
  ],
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productFamilyId: uuid('product_family_id')
      .notNull()
      .references(() => productFamilies.id, { onDelete: 'restrict' }),
    productSizeId: uuid('product_size_id')
      .notNull()
      .references(() => productSizes.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    displayName: text('display_name').notNull(),
    mealsPerUnit: integer('meals_per_unit').default(5).notNull(),
    active: boolean('active').default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('product_variants_family_code_unique').on(table.productFamilyId, table.code),
    uniqueIndex('product_variants_family_size_unique').on(
      table.productFamilyId,
      table.productSizeId,
    ),
    check('product_variants_meals_positive_check', sql`${table.mealsPerUnit} > 0`),
  ],
);

// A menu with no operation is the global master. Distribution materialises an independent revision
// per operation, so an order always references one concrete row and never composes global plus
// regional at order time (ADR-028).
export const weeklyMenus = pgTable(
  'weekly_menus',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    salesCycleId: uuid('sales_cycle_id')
      .notNull()
      .references(() => salesCycles.id, { onDelete: 'restrict' }),
    operatingSiteId: uuid('operating_site_id').references(() => operatingSites.id, {
      onDelete: 'restrict',
    }),
    sourceMenuId: uuid('source_menu_id'),
    status: text('status').default('DRAFT').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    revision: integer('revision').default(1).notNull(),
    ...timestamps,
  },
  (table) => [
    // One master revision per cycle, and one regional revision per cycle and operation.
    uniqueIndex('weekly_menus_master_revision_unique')
      .on(table.salesCycleId, table.revision)
      .where(sql`${table.operatingSiteId} is null`),
    uniqueIndex('weekly_menus_site_revision_unique')
      .on(table.salesCycleId, table.operatingSiteId, table.revision)
      .where(sql`${table.operatingSiteId} is not null`),
    index('weekly_menus_status_idx').on(table.status),
    index('weekly_menus_site_status_idx').on(table.operatingSiteId, table.status),
    foreignKey({
      columns: [table.sourceMenuId],
      foreignColumns: [table.id],
      name: 'weekly_menus_source_menu_fk',
    }).onDelete('set null'),
  ],
);

// Price depends on size and scope, never on the variety: two varieties of the same size cost the
// same within one menu (ADR-030). This list is the authority.
export const weeklyMenuPrices = pgTable(
  'weekly_menu_prices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    weeklyMenuId: uuid('weekly_menu_id')
      .notNull()
      .references(() => weeklyMenus.id, { onDelete: 'cascade' }),
    productSizeId: uuid('product_size_id')
      .notNull()
      .references(() => productSizes.id, { onDelete: 'restrict' }),
    unitPriceMinor: integer('unit_price_minor').notNull(),
    currency: text('currency').default('ARS').notNull(),
    // Set when an operator edits this row on a distributed menu. A later distribution refreshes
    // only what nobody customised, unless it is an explicit replace (ADR-028).
    customized: boolean('customized').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('weekly_menu_prices_menu_size_unique').on(table.weeklyMenuId, table.productSizeId),
    check('weekly_menu_prices_price_check', sql`${table.unitPriceMinor} >= 0`),
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
    // Deliberate per-variety exception. Null means "use the menu's price for this size", which is
    // the normal case; a value here is an explicit override an operator chose.
    unitPriceMinor: integer('unit_price_minor'),
    currency: text('currency').default('ARS').notNull(),
    active: boolean('active').default(true).notNull(),
    customized: boolean('customized').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('weekly_menu_offerings_menu_variant_unique').on(
      table.weeklyMenuId,
      table.productVariantId,
    ),
    check(
      'weekly_menu_offerings_price_check',
      sql`${table.unitPriceMinor} is null or ${table.unitPriceMinor} >= 0`,
    ),
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
    // Assigned transactionally from the operation's counter and prefix; no global default (ADR-028).
    publicNumber: text('public_number').notNull().unique(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    // Derived from the delivery zone, never chosen by the operator (ADR-031).
    operatingSiteId: uuid('operating_site_id')
      .notNull()
      .references(() => operatingSites.id, { onDelete: 'restrict' }),
    geographicZoneId: uuid('geographic_zone_id'),
    salesCycleId: uuid('sales_cycle_id')
      .notNull()
      .references(() => salesCycles.id, { onDelete: 'restrict' }),
    weeklyMenuId: uuid('weekly_menu_id')
      .notNull()
      .references(() => weeklyMenus.id, { onDelete: 'restrict' }),
    status: text('status').default('DRAFT').notNull(),
    source: text('source').notNull(),
    deliveryDate: date('delivery_date').notNull(),
    deliveryAddressId: uuid('delivery_address_id').references(() => customerAddresses.id, {
      onDelete: 'set null',
    }),
    deliveryAddressSnapshot: text('delivery_address_snapshot').notNull(),
    deliveryLocationUrlSnapshot: text('delivery_location_url_snapshot'),
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
    index('orders_site_status_idx').on(table.operatingSiteId, table.status),
    index('orders_site_created_at_idx').on(table.operatingSiteId, table.createdAt),
    // Zone and operation cannot disagree: the pair must exist in geographic_zones. A null zone
    // leaves the constraint unenforced, which is what an order without a stored address needs.
    foreignKey({
      columns: [table.geographicZoneId, table.operatingSiteId],
      foreignColumns: [geographicZones.id, geographicZones.operatingSiteId],
      name: 'orders_zone_site_fk',
    }).onDelete('restrict'),
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

export const orderRevisions = pgTable(
  'order_revisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    reason: text('reason').notNull(),
    actorUserId: uuid('actor_user_id'),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('order_revisions_order_revision_unique').on(table.orderId, table.revision),
    index('order_revisions_order_idx').on(table.orderId, table.createdAt),
  ],
);
