import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './auth.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const operatingSites = pgTable(
  'operating_sites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull().unique(),
    displayName: text('display_name').notNull(),
    orderPrefix: text('order_prefix').notNull().unique(),
    timezone: text('timezone').default('America/Argentina/Buenos_Aires').notNull(),
    coverImageUrl: text('cover_image_url'),
    publicPhone: text('public_phone'),
    publicWhatsapp: text('public_whatsapp'),
    publicEmail: text('public_email'),
    active: boolean('active').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    index('operating_sites_active_order_idx').on(table.active, table.sortOrder),
    check('operating_sites_slug_check', sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check('operating_sites_order_prefix_check', sql`${table.orderPrefix} ~ '^[A-Z0-9]{1,8}$'`),
    check('operating_sites_sort_order_check', sql`${table.sortOrder} >= 0`),
  ],
);

export const geographicZones = pgTable(
  'geographic_zones',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    operatingSiteId: uuid('operating_site_id')
      .notNull()
      .references(() => operatingSites.id, { onDelete: 'restrict' }),
    slug: text('slug').notNull(),
    displayName: text('display_name').notNull(),
    coverageDescription: text('coverage_description'),
    coverImageUrl: text('cover_image_url'),
    publicPhoneOverride: text('public_phone_override'),
    publicWhatsappOverride: text('public_whatsapp_override'),
    active: boolean('active').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('geographic_zones_site_slug_unique').on(table.operatingSiteId, table.slug),
    uniqueIndex('geographic_zones_id_site_unique').on(table.id, table.operatingSiteId),
    index('geographic_zones_site_active_order_idx').on(
      table.operatingSiteId,
      table.active,
      table.sortOrder,
    ),
    check('geographic_zones_slug_check', sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check('geographic_zones_sort_order_check', sql`${table.sortOrder} >= 0`),
  ],
);

export const userOperatingSites = pgTable(
  'user_operating_sites',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    operatingSiteId: uuid('operating_site_id')
      .notNull()
      .references(() => operatingSites.id, { onDelete: 'cascade' }),
    defaultSite: boolean('default_site').default(false).notNull(),
    active: boolean('active').default(true).notNull(),
    assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.operatingSiteId] }),
    uniqueIndex('user_operating_sites_default_unique')
      .on(table.userId)
      .where(sql`${table.active} = true and ${table.defaultSite} = true`),
    index('user_operating_sites_site_active_idx').on(table.operatingSiteId, table.active),
  ],
);

export const operatingSiteOrderCounters = pgTable(
  'operating_site_order_counters',
  {
    operatingSiteId: uuid('operating_site_id')
      .primaryKey()
      .references(() => operatingSites.id, { onDelete: 'cascade' }),
    lastOrderNumber: integer('last_order_number').default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('operating_site_order_counters_nonnegative_check', sql`${table.lastOrderNumber} >= 0`),
  ],
);
