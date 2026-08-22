import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { roles, users } from './auth.js';

/**
 * Staff-to-staff messaging. Deliberately separate from the customer channel, which reserves
 * `conversations`, `messages` and the `messages.*` permissions for conversations with customers
 * (ADR-032). These share a word and nothing else.
 */

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

// Pairs are stored normalised (least, greatest) so a link is the same in both directions and the
// unique index actually prevents duplicates.
export const chatRoleLinks = pgTable(
  'chat_role_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roleAId: uuid('role_a_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    roleBId: uuid('role_b_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    active: boolean('active').default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('chat_role_links_pair_unique').on(table.roleAId, table.roleBId),
    check('chat_role_links_normalized_check', sql`${table.roleAId} <= ${table.roleBId}`),
  ],
);

export const chatUserLinks = pgTable(
  'chat_user_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userAId: uuid('user_a_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userBId: uuid('user_b_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    effect: text('effect').notNull(),
    reason: text('reason'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('chat_user_links_pair_unique').on(table.userAId, table.userBId),
    check('chat_user_links_normalized_check', sql`${table.userAId} < ${table.userBId}`),
    check('chat_user_links_effect_check', sql`${table.effect} in ('allow', 'deny')`),
  ],
);

export const staffConversations = pgTable(
  'staff_conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kind: text('kind').default('direct').notNull(),
    title: text('title'),
    // The normalised participant pair for a direct conversation, so two people opening a thread at
    // the same moment cannot create two of them. Null for groups.
    directKey: text('direct_key'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('staff_conversations_direct_key_unique')
      .on(table.directKey)
      .where(sql`${table.directKey} is not null`),
    index('staff_conversations_last_message_idx').on(table.lastMessageAt),
    check('staff_conversations_kind_check', sql`${table.kind} in ('direct', 'group')`),
    check(
      'staff_conversations_direct_key_check',
      sql`(${table.kind} = 'direct' and ${table.directKey} is not null) or (${table.kind} = 'group' and ${table.directKey} is null)`,
    ),
  ],
);

export const staffConversationParticipants = pgTable(
  'staff_conversation_participants',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => staffConversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
    // Kept rather than deleted: who was in a conversation and when is part of its history.
    leftAt: timestamp('left_at', { withTimezone: true }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    muted: boolean('muted').default(false).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    index('staff_conversation_participants_user_idx').on(table.userId, table.leftAt),
  ],
);

export const staffMessages = pgTable(
  'staff_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => staffConversations.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind').default('text').notNull(),
    body: text('body'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    // A deleted message keeps its row with the body cleared, so the gap stays visible.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Serves both the conversation transcript and the unread count against last_read_at.
    index('staff_messages_conversation_created_idx').on(table.conversationId, table.createdAt),
    index('staff_messages_created_idx').on(table.createdAt),
    check('staff_messages_kind_check', sql`${table.kind} in ('text', 'location', 'reference')`),
    check(
      'staff_messages_body_check',
      sql`${table.deletedAt} is not null or ${table.kind} <> 'text' or ${table.body} is not null`,
    ),
  ],
);

// A location is the coordinates the sender chose, never a customer's stored address — that goes
// through staff_message_references instead, where the viewer's own permission applies (ADR-032).
export const staffMessageLocations = pgTable(
  'staff_message_locations',
  {
    messageId: uuid('message_id')
      .primaryKey()
      .references(() => staffMessages.id, { onDelete: 'cascade' }),
    latitude: numeric('latitude', { precision: 9, scale: 6 }).notNull(),
    longitude: numeric('longitude', { precision: 9, scale: 6 }).notNull(),
    label: text('label'),
  },
  (table) => [
    check(
      'staff_message_locations_coordinates_check',
      sql`${table.latitude} between -90 and 90 and ${table.longitude} between -180 and 180`,
    ),
  ],
);

// A pointer, never a copy: {resource_type, resource_id}. The viewer resolves it through the
// existing order/customer endpoint with their own permissions at render time, so a recipient
// without customers.read sees "referencia no disponible" instead of a cached, staling snapshot.
export const staffMessageReferences = pgTable(
  'staff_message_references',
  {
    messageId: uuid('message_id')
      .primaryKey()
      .references(() => staffMessages.id, { onDelete: 'cascade' }),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id').notNull(),
  },
  (table) => [
    index('staff_message_references_resource_idx').on(table.resourceType, table.resourceId),
    check(
      'staff_message_references_resource_type_check',
      sql`${table.resourceType} in ('order', 'customer')`,
    ),
  ],
);

// Declared statuses are a catalog, not a union type in code: a business that wants "en ruta" for
// drivers adds a row. Only the offline derivation is a rule, and that lives in @verdeo/chat.
export const chatPresenceStatuses = pgTable(
  'chat_presence_statuses',
  {
    key: text('key').primaryKey(),
    displayName: text('display_name').notNull(),
    // Whether colleagues should read this as reachable. Presentation, not authorization.
    reachable: boolean('reachable').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    active: boolean('active').default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    index('chat_presence_statuses_active_order_idx').on(table.active, table.sortOrder),
    check('chat_presence_statuses_sort_order_check', sql`${table.sortOrder} >= 0`),
  ],
);

export const staffPresence = pgTable(
  'staff_presence',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    statusMessage: text('status_message'),
    // The heartbeat. Freshness is judged by the server, never asserted by the client.
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('staff_presence_last_seen_idx').on(table.lastSeenAt)],
);
