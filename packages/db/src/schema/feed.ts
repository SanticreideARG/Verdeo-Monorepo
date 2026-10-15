import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './auth.js';
import { operatingSites } from './geography.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

/**
 * Lo que la gente publica en el tablero (DASHBOARD_FEED_PLAN.md, "Comunicaciones").
 *
 * Un aviso que queda, no una charla: para conversar está el chat interno. Por eso guarda quién lo
 * leyó (`feed_post_reads`) y no se borra de verdad: un "desde el lunes el corte es el jueves" que
 * desaparece sin rastro es justo lo que después nadie puede reconstruir.
 */
export const feedPosts = pgTable(
  'feed_posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Null si se dio de baja al autor: la publicación sigue diciendo lo que dijo.
    authorUserId: uuid('author_user_id').references(() => users.id, { onDelete: 'set null' }),
    // Null: para todas las ciudades.
    operatingSiteId: uuid('operating_site_id').references(() => operatingSites.id, {
      onDelete: 'cascade',
    }),
    tag: text('tag').notNull(),
    body: text('body').notNull(),
    // Fijada arriba hasta esta fecha; null si no está fijada. Un fijado sin vencimiento termina
    // siendo ruido permanente arriba de todo.
    pinnedUntil: timestamp('pinned_until', { withTimezone: true }),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('feed_posts_created_idx').on(table.createdAt),
    check('feed_posts_tag_check', sql`${table.tag} in ('aviso', 'cambio', 'novedad')`),
    check('feed_posts_body_check', sql`length(${table.body}) between 1 and 4000`),
  ],
);

/** Quién vio cada publicación y, en las que lo piden, quién confirmó "lo leí". */
export const feedPostReads = pgTable(
  'feed_post_reads',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => feedPosts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }).defaultNow().notNull(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.postId, table.userId] })],
);
