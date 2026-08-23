import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './auth.js';
import { operatingSites } from './geography.js';
import { orders } from './operations.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

/**
 * Fase 8 skeleton (DELIVERY_AND_ROUTES.md). "Pedido normalmente pertenece a una ruta; puede
 * existir pedido sin delivery como excepción" — a route groups a subset of a day's confirmed
 * orders for one operation, sequenced by `@verdeo/routing`'s optimizer and assigned to a
 * repartidor. "Operadores crean/publican rutas; optimización asistida, decisión humana": creating
 * a route only proposes a sequence — nothing reaches the delivery app until `publish`.
 */
export const deliveryRoutes = pgTable(
  'delivery_routes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    operatingSiteId: uuid('operating_site_id')
      .notNull()
      .references(() => operatingSites.id, { onDelete: 'restrict' }),
    deliveryDate: date('delivery_date').notNull(),
    label: text('label'),
    status: text('status').default('draft').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('delivery_routes_site_date_idx').on(table.operatingSiteId, table.deliveryDate),
    check(
      'delivery_routes_status_check',
      sql`${table.status} in ('draft', 'published', 'completed')`,
    ),
  ],
);

export const deliveryStops = pgTable(
  'delivery_stops',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    routeId: uuid('route_id')
      .notNull()
      .references(() => deliveryRoutes.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    sequence: integer('sequence').notNull(),
    assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
    status: text('status').default('pending').notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('delivery_stops_route_order_unique').on(table.routeId, table.orderId),
    uniqueIndex('delivery_stops_route_sequence_unique').on(table.routeId, table.sequence),
    index('delivery_stops_assigned_idx').on(table.assignedUserId, table.status),
    index('delivery_stops_order_idx').on(table.orderId),
    check(
      'delivery_stops_status_check',
      sql`${table.status} in ('pending', 'en_route', 'at_address', 'delivered', 'skipped')`,
    ),
  ],
);
