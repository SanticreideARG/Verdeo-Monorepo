import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { roles, users } from './auth.js';
import { operatingSites } from './geography.js';

/**
 * "Acceder con token" (login page): an alternative to email+password.
 *
 * - repartidor_access: bound to an existing repartidor at generation time (boundUserId), reusable
 *   across logins until it expires or is revoked — a temporary password, not a one-time code.
 * - user_invite: nobody is bound yet; redeeming it creates a new user with the preset role and
 *   consumes the token (redeemedAt set, single use).
 */
export const accessTokens = pgTable(
  'access_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kind: text('kind').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    label: text('label').notNull(),
    roleId: uuid('role_id').references(() => roles.id, { onDelete: 'restrict' }),
    operatingSiteId: uuid('operating_site_id').references(() => operatingSites.id, {
      onDelete: 'set null',
    }),
    // Set at generation for repartidor_access; set on redemption for user_invite.
    boundUserId: uuid('bound_user_id').references(() => users.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    useCount: integer('use_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('access_tokens_kind_idx').on(table.kind),
    index('access_tokens_expires_idx').on(table.expiresAt),
    index('access_tokens_operating_site_idx').on(table.operatingSiteId),
    check('access_tokens_kind_check', sql`${table.kind} in ('repartidor_access', 'user_invite')`),
    check('access_tokens_use_count_check', sql`${table.useCount} >= 0`),
  ],
);
