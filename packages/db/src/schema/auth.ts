import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    displayName: text('display_name').notNull(),
    emailNormalized: text('email_normalized'),
    // Set by the (separate, not-yet-built) avatar upload flow once Vercel Blob is configured. Null
    // means the UI falls back to the display-name initial.
    avatarUrl: text('avatar_url'),
    status: text('status').default('active').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('users_email_normalized_unique')
      .on(table.emailNormalized)
      .where(sql`${table.emailNormalized} is not null`),
    index('users_status_idx').on(table.status),
  ],
);

export const authIdentities = pgTable(
  'auth_identities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerSubject: text('provider_subject').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('auth_identities_provider_subject_unique').on(
      table.provider,
      table.providerSubject,
    ),
    index('auth_identities_user_id_idx').on(table.userId),
  ],
);

export const passwordCredentials = pgTable('password_credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  failedAttempts: integer('failed_attempts').default(0).notNull(),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  active: boolean('active').default(true).notNull(),
  ...timestamps,
});

export const permissions = pgTable('permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  group: text('group_name').notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export const userPermissionOverrides = pgTable(
  'user_permission_overrides',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    effect: text('effect').notNull(),
    reason: text('reason'),
    grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.permissionId] })],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expiry_idx').on(table.expiresAt),
  ],
);

/**
 * Single-use email sign-in links for customers.
 *
 * Deliberately its own table rather than another `access_tokens` kind: that one binds to an
 * existing user, and the whole point here is that the person may not exist yet — the email *is*
 * the identity until the link is followed. The semantics differ too: short-lived, single-use, and
 * consumed rather than revoked.
 *
 * Only the hash is stored, so a database leak does not hand anyone a working sign-in link.
 */
export const customerLoginTokens = pgTable(
  'customer_login_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    emailNormalized: text('email_normalized').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // Set when the link is followed; a second visit finds it used and is refused.
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Rate limiting reads by email over a recent window, so it is worth an index of its own.
    index('customer_login_tokens_email_created_idx').on(table.emailNormalized, table.createdAt),
  ],
);

/**
 * Which widgets a person keeps on their dashboard, and in what order.
 *
 * Just the keys and their order. What a widget *is* — its title, its permission, what it renders —
 * lives in the frontend catalogue, because none of that is data the server needs to reason about:
 * a layout naming a widget that no longer exists is filtered on render rather than migrated.
 *
 * One row per user; absence means "the default layout", which is why there is no seeding step.
 */
/**
 * Cómo se ve la app para una persona: tema, fuente y tamaño de texto.
 *
 * Vive en el servidor y no en localStorage porque una preferencia de legibilidad que se pierde al
 * cambiar de máquina no es una preferencia, es una molestia repetida. Todas las columnas son
 * opcionales y el servidor no valida los valores: qué temas y qué fuentes existen es del frontend,
 * y un valor desconocido cae al de por defecto al renderizar.
 *
 * Una fila por usuario; la ausencia de fila significa "lo de por defecto".
 */
export const userAppearance = pgTable('user_appearance', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  theme: text('theme'),
  fontKey: text('font_key'),
  textScale: text('text_scale'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const dashboardLayouts = pgTable('dashboard_layouts', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  widgets: jsonb('widgets').$type<string[]>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
