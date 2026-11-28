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
import { operatingSites } from './geography.js';
import { customers, orders } from './operations.js';

/*
 * Tags personalizables (TAGS_Y_STOCK_CON_NOMBRE_PLAN.md, 2026-11-28): aclaraciones con nombre y
 * color —"Sin semillas"— que se ponen a clientes, a pedidos o a ambos. El de un cliente marca todos
 * sus pedidos; se calcula al leer, no se copia.
 */

/** Dónde se puede poner un tag. */
export const TAG_TARGETS = ['CUSTOMER', 'ORDER', 'BOTH'] as const;
/** Cómo sale en una planilla: no sale, al final del nombre del cliente, o en una columna con ☐. */
export const TAG_SHEET_MODES = ['OFF', 'NAME', 'CHECK'] as const;

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    /** Uno de la paleta de la app (`TAG_COLORS` en contratos); texto para sumar sin migrar. */
    color: text('color').default('green').notNull(),
    appliesTo: text('applies_to').default('BOTH').notNull(),
    // Por planilla: la de producción (cocina), la hoja de reparto y la planilla de pedidos (Excel).
    productionSheet: text('production_sheet').default('NAME').notNull(),
    deliverySheet: text('delivery_sheet').default('NAME').notNull(),
    ordersSheet: text('orders_sheet').default('NAME').notNull(),
    /** Archivado: no se ofrece, pero lo que ya lo tiene lo sigue mostrando. */
    active: boolean('active').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('tags_name_unique').on(sql`lower(${table.name})`),
    check('tags_name_check', sql`length(trim(${table.name})) between 1 and 40`),
    check('tags_applies_to_check', sql`${table.appliesTo} in ('CUSTOMER', 'ORDER', 'BOTH')`),
    check(
      'tags_sheet_modes_check',
      sql`${table.productionSheet} in ('OFF', 'NAME', 'CHECK') and ${table.deliverySheet} in ('OFF', 'NAME', 'CHECK') and ${table.ordersSheet} in ('OFF', 'NAME', 'CHECK')`,
    ),
  ],
);

/** Las ciudades de un tag. Sin filas, vale para todas. */
export const tagSites = pgTable(
  'tag_sites',
  {
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    operatingSiteId: uuid('operating_site_id')
      .notNull()
      .references(() => operatingSites.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.tagId, table.operatingSiteId] })],
);

export const customerTags = pgTable(
  'customer_tags',
  {
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.customerId, table.tagId] }),
    index('customer_tags_tag_idx').on(table.tagId),
  ],
);

export const orderTags = pgTable(
  'order_tags',
  {
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.orderId, table.tagId] }),
    index('order_tags_tag_idx').on(table.tagId),
  ],
);
