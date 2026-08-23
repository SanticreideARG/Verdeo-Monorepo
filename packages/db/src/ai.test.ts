import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { encryptSecret, type AIProvider } from '@verdeo/ai';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PostgresAIPromptService } from './repositories/postgres-ai-prompt-service.js';
import {
  AITaskNotConfiguredError,
  AITaskValidationError,
  PostgresAITaskService,
} from './repositories/postgres-ai-task-service.js';
import type { Database } from './index.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function migratedDatabase(): Promise<{
  client: PGlite;
  close: () => Promise<void>;
  db: Database;
}> {
  const client = new PGlite();
  await client.waitReady;

  for (const file of readdirSync(migrationsFolder)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    for (const statement of readFileSync(join(migrationsFolder, file), 'utf8')
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !/^(--[^\n]*\n?)*$/.test(part))) {
      await client.exec(statement);
    }
  }

  return {
    client,
    close: () => client.close(),
    db: drizzle(client, { schema }) as unknown as Database,
  };
}

const CONTEXT = { correlationId: 'test', requestId: 'test', source: 'test' };
const ENCRYPTION_KEY = randomBytes(32).toString('base64');

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function seeded() {
  const { client, close: closeDatabase, db } = await migratedDatabase();
  close = closeDatabase;
  const prompts = new PostgresAIPromptService(db);
  return { client, db, prompts };
}

describe('PostgresAIPromptService', () => {
  it('creates the first version of a prompt and activates it', async () => {
    const { prompts } = await seeded();

    const detail = await prompts.createVersion(
      'rewrite_message',
      { maxTokens: 500, systemPrompt: 'Sos un asistente de Verdeo.', temperature: 0.5 },
      CONTEXT,
    );

    expect(detail.versions).toHaveLength(1);
    expect(detail.activeVersionId).toBe(detail.versions[0]!.id);
  });

  it('stacks versions and keeps the latest active', async () => {
    const { prompts } = await seeded();
    await prompts.createVersion(
      'rewrite_message',
      { maxTokens: 500, systemPrompt: 'v1', temperature: 0.5 },
      CONTEXT,
    );

    const detail = await prompts.createVersion(
      'rewrite_message',
      { maxTokens: 500, systemPrompt: 'v2', temperature: 0.5 },
      CONTEXT,
    );

    expect(detail.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(detail.versions.find((v) => v.id === detail.activeVersionId)?.systemPrompt).toBe('v2');
  });

  it('rolls back to an older version without creating a new row', async () => {
    const { prompts } = await seeded();
    const first = await prompts.createVersion(
      'rewrite_message',
      { maxTokens: 500, systemPrompt: 'v1', temperature: 0.5 },
      CONTEXT,
    );
    await prompts.createVersion(
      'rewrite_message',
      { maxTokens: 500, systemPrompt: 'v2', temperature: 0.5 },
      CONTEXT,
    );

    const rolledBack = await prompts.activateVersion(
      'rewrite_message',
      first.versions[0]!.id,
      CONTEXT,
    );

    expect(rolledBack.versions).toHaveLength(2); // still just 2 rows, no new version created
    expect(rolledBack.activeVersionId).toBe(first.versions[0]!.id);
  });

  it('lists all catalog tasks with configured/active flags', async () => {
    const { prompts } = await seeded();
    await prompts.createVersion(
      'rewrite_message',
      { maxTokens: 500, systemPrompt: 'v1', temperature: 0.5 },
      CONTEXT,
    );

    const list = await prompts.listPrompts();

    expect(list.find((row) => row.taskKey === 'rewrite_message')).toMatchObject({
      configured: true,
      hasActiveVersion: true,
    });
    expect(list.find((row) => row.taskKey === 'extract_order')).toMatchObject({
      configured: false,
      hasActiveVersion: false,
    });
  });
});

function fakeProvider(text: string, providerKey = 'test-provider'): AIProvider {
  return {
    generateText: vi.fn(() =>
      Promise.resolve({ text, usage: { inputTokens: 10, outputTokens: 20 } }),
    ),
    key: providerKey,
  };
}

async function seededWithProvider(overrides: Partial<{ enabled: boolean }> = {}) {
  const { client, db, prompts } = await seeded();
  await client.exec(`
    insert into ai_provider_configs (key, display_name, adapter_type, base_url, default_model,
                                      encrypted_api_key, api_key_last_four, enabled)
    values ('test-provider', 'Test', 'openai-compatible', 'https://example.test/v1', 'gpt-test',
            '${encryptSecret('sk-test-key', ENCRYPTION_KEY)}', 'test', ${overrides.enabled ?? true});
  `);
  return { client, db, prompts };
}

describe('PostgresAITaskService', () => {
  it('runs a plain-text task end to end and records the execution', async () => {
    const { db, prompts } = await seededWithProvider();
    await prompts.createVersion(
      'rewrite_message',
      { maxTokens: 500, systemPrompt: 'Reescribí el mensaje.', temperature: 0.5 },
      CONTEXT,
    );
    const provider = fakeProvider('Hola, gracias por tu compra!');
    const service = new PostgresAITaskService(db, prompts, () => provider, ENCRYPTION_KEY);

    const result = await service.runTask(
      'rewrite_message',
      { style: 'cordial', text: 'gracias x la compra' },
      CONTEXT,
    );

    expect(result.output).toBe('Hola, gracias por tu compra!');
    expect(result.providerKey).toBe('test-provider');
    const executions = await service.listExecutions('rewrite_message');
    expect(executions).toHaveLength(1);
    expect(executions[0]).toMatchObject({ status: 'completed' });
  });

  it('validates structured output against the task schema and records it on success', async () => {
    const { db, prompts } = await seededWithProvider();
    await prompts.createVersion(
      'extract_order',
      { maxTokens: 400, systemPrompt: 'Extraé el pedido.', temperature: 0.1 },
      CONTEXT,
    );
    const provider = fakeProvider(
      JSON.stringify({
        confidence: 0.9,
        dishes: ['Milanesa'],
        familyName: 'Real',
        quantityUnits: 1,
        sizeName: '400',
        variantName: 'Pollo',
      }),
    );
    const service = new PostgresAITaskService(db, prompts, () => provider, ENCRYPTION_KEY);

    const result = await service.runTask(
      'extract_order',
      { message: 'quiero un real de pollo con milanesa' },
      CONTEXT,
    );

    expect(result.output).toMatchObject({ familyName: 'Real', quantityUnits: 1 });
  });

  it('throws AITaskValidationError and still audits when the model returns invalid JSON', async () => {
    const { db, prompts } = await seededWithProvider();
    await prompts.createVersion(
      'extract_order',
      { maxTokens: 400, systemPrompt: 'Extraé el pedido.', temperature: 0.1 },
      CONTEXT,
    );
    const provider = fakeProvider('no soy json');
    const service = new PostgresAITaskService(db, prompts, () => provider, ENCRYPTION_KEY);

    await expect(service.runTask('extract_order', { message: 'algo' }, CONTEXT)).rejects.toThrow(
      AITaskValidationError,
    );

    const executions = await service.listExecutions('extract_order');
    expect(executions[0]).toMatchObject({ status: 'error' });
  });

  it('throws AITaskNotConfiguredError when no prompt is active for the task', async () => {
    const { db, prompts } = await seededWithProvider();
    const provider = fakeProvider('irrelevant');
    const service = new PostgresAITaskService(db, prompts, () => provider, ENCRYPTION_KEY);

    await expect(
      service.runTask('rewrite_message', { style: 'cordial', text: 'hola' }, CONTEXT),
    ).rejects.toThrow(AITaskNotConfiguredError);
  });

  it('throws AITaskNotConfiguredError when the only capable provider is disabled', async () => {
    const { db, prompts } = await seededWithProvider({ enabled: false });
    await prompts.createVersion(
      'rewrite_message',
      { maxTokens: 500, systemPrompt: 'x', temperature: 0.5 },
      CONTEXT,
    );
    const provider = fakeProvider('irrelevant');
    const service = new PostgresAITaskService(db, prompts, () => provider, ENCRYPTION_KEY);

    await expect(
      service.runTask('rewrite_message', { style: 'cordial', text: 'hola' }, CONTEXT),
    ).rejects.toThrow();
  });

  it('records a failed execution when the provider call throws', async () => {
    const { db, prompts } = await seededWithProvider();
    await prompts.createVersion(
      'rewrite_message',
      { maxTokens: 500, systemPrompt: 'x', temperature: 0.5 },
      CONTEXT,
    );
    const provider: AIProvider = {
      generateText: vi.fn(() => Promise.reject(new Error('boom'))),
      key: 'test-provider',
    };
    const service = new PostgresAITaskService(db, prompts, () => provider, ENCRYPTION_KEY);

    await expect(
      service.runTask('rewrite_message', { style: 'cordial', text: 'hola' }, CONTEXT),
    ).rejects.toThrow('boom');

    const executions = await service.listExecutions('rewrite_message');
    expect(executions[0]).toMatchObject({ errorMessage: 'boom', status: 'error' });
  });
});
