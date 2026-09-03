import { sql } from 'drizzle-orm';
import { boolean, check, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Credentials for third-party integrations that are not AI providers — today the maps/geocoding
 * key, tomorrow whatever else needs a secret.
 *
 * Deliberately a separate table from `ai_provider_configs` rather than a widened version of it:
 * that table carries adapter/model/baseUrl columns that only make sense for an LLM, and a maps key
 * has none of them. Same encryption story though — the secret is stored encrypted with
 * AI_CONFIG_ENCRYPTION_KEY and only ever read back as a masked last-four, so the dashboard can show
 * "configured" without ever shipping the key to a browser.
 *
 * One row per integration key ("maps"), so this is a settings table, not a log.
 */
export const integrationCredentials = pgTable(
  'integration_credentials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    key: text('key').notNull().unique(),
    displayName: text('display_name').notNull(),
    // Which concrete adapter the key belongs to ('google-maps'), so swapping providers later is a
    // value change rather than a schema change.
    provider: text('provider').notNull(),
    encryptedApiKey: text('encrypted_api_key'),
    apiKeyLastFour: text('api_key_last_four'),
    // Non-secret configuration the integration needs alongside its key — the sender address and
    // reply-to for email, whatever the next one needs. Kept beside the key rather than in env vars
    // so an operator can change who mail comes from without a redeploy, and readable by the
    // dashboard (unlike the key, which only ever leaves as a masked last-four).
    settings: jsonb('settings').$type<Record<string, string>>(),
    enabled: boolean('enabled').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('integration_credentials_key_check', sql`${table.key} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
  ],
);
