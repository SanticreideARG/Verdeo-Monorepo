import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { users } from './auth.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

/**
 * "No construir un WordPress genérico. Usar secciones tipadas." (CMS_AND_PUBLIC_WEB.md)
 *
 * A page's content lives as an ordered array of typed section blocks on `page_revisions.sections`
 * — an immutable, append-only snapshot per save, not a normalized per-section table with its own
 * revisioning. Publishing/reverting is then just moving `pages.published_revision_id` to point at a
 * different (already-existing) revision row; nothing is deleted or rewritten, so history is
 * inherently preserved and a revert never needs a special code path distinct from publish.
 */
export const pages = pgTable('pages', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  // Deliberately no FK to page_revisions: that table already references this one, and a second FK
  // the other way would make the pair circular for no real benefit (the app enforces that the
  // published revision belongs to this page).
  publishedRevisionId: uuid('published_revision_id'),
  ...timestamps,
});

export const pageRevisions = pgTable(
  'page_revisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    sections: jsonb('sections').$type<unknown[]>().notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('page_revisions_page_revision_unique').on(table.pageId, table.revision)],
);

export const mediaAssets = pgTable('media_assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  url: text('url').notNull(),
  contentType: text('content_type').notNull(),
  label: text('label'),
  uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
