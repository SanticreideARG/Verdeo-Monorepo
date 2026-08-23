import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './auth.js';

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

/**
 * AI_CORE.md's Prompt Registry: "no hardcodear prompts de negocio en componentes", "versionado y
 * rollback obligatorio". One row per task key; `activeVersionId` points at whichever version is
 * live, mirroring the CMS page/revision split — every save is a new immutable version, activating
 * (including rolling back to an older one) is just moving the pointer.
 */
export const aiPrompts = pgTable('ai_prompts', {
  id: uuid('id').defaultRandom().primaryKey(),
  taskKey: text('task_key').notNull().unique(),
  activeVersionId: uuid('active_version_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const aiPromptVersions = pgTable(
  'ai_prompt_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    promptId: uuid('prompt_id')
      .notNull()
      .references(() => aiPrompts.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    temperature: real('temperature').notNull(),
    maxTokens: integer('max_tokens').notNull(),
    preferredProviderKey: text('preferred_provider_key'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('ai_prompt_versions_prompt_version_unique').on(table.promptId, table.version),
  ],
);

/**
 * AI_CORE.md's `AIExecution` audit. `status` stays a plain 'completed'/'error' in V1 — the
 * richer accepted/edited/rejected human-review workflow needs the Workbench and real task UIs to
 * exist first, so it's deferred rather than modeled speculatively.
 */
export const aiExecutions = pgTable(
  'ai_executions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    taskKey: text('task_key').notNull(),
    promptVersionId: uuid('prompt_version_id').references(() => aiPromptVersions.id, {
      onDelete: 'set null',
    }),
    providerKey: text('provider_key').notNull(),
    model: text('model').notNull(),
    inputHash: text('input_hash').notNull(),
    outputText: text('output_text'),
    status: text('status').notNull(),
    errorMessage: text('error_message'),
    latencyMs: integer('latency_ms').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('ai_executions_task_created_idx').on(table.taskKey, table.createdAt),
    check('ai_executions_status_check', sql`${table.status} in ('completed', 'error')`),
  ],
);
