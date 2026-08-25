import {
  boolean,
  index,
  integer,
  pgTable,
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

// "Ayuda modularizada": each article is gated by an optional permission key (free text, same
// convention as message-template ConfigurableKeySchema fields — never a hardcoded enum of app
// sections). A null requiredPermission means visible to every signed-in user; otherwise it's
// shown only to a viewer who actually holds that permission, so nobody sees help for a screen
// they can't reach.
export const helpArticles = pgTable(
  'help_articles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    key: text('key').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    category: text('category').notNull(),
    requiredPermission: text('required_permission'),
    ordinal: integer('ordinal').default(0).notNull(),
    active: boolean('active').default(true).notNull(),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('help_articles_key_unique').on(table.key),
    index('help_articles_category_idx').on(table.category, table.ordinal),
  ],
);
