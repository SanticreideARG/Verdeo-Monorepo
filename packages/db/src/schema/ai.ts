import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const aiProviderConfigs = pgTable(
  'ai_provider_configs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    key: text('key').notNull().unique(),
    displayName: text('display_name').notNull(),
    adapterType: text('adapter_type').notNull(),
    baseUrl: text('base_url').notNull(),
    defaultModel: text('default_model').notNull(),
    encryptedApiKey: text('encrypted_api_key'),
    apiKeyLastFour: text('api_key_last_four'),
    enabled: boolean('enabled').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('ai_provider_configs_enabled_idx').on(table.enabled)],
);
