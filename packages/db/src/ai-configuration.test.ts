import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import { PostgresAIConfigurationService } from './repositories/postgres-ai-configuration-service.js';
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

const CONTEXT = {
  actorUserId: '55276601-ec66-4f63-9f2f-edf73904ede0',
  correlationId: 'test',
  requestId: 'test',
  source: 'test',
};

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

// Regression test: upsert() used to `return this.database.transaction(...)` — which resolves to
// whatever the transaction callback returns (nothing, here) — followed by an unreachable
// `return this.list()`. Every save answered `undefined`, which failed the API's response schema
// on every call. Covering both branches (create and update) here.
describe('PostgresAIConfigurationService.upsert', () => {
  it('returns the fresh list after creating a provider', async () => {
    const { client, close: closeDatabase, db } = await migratedDatabase();
    close = closeDatabase;
    const service = new PostgresAIConfigurationService(db, randomBytes(32).toString('base64'));
    void client;

    const result = await service.upsert(
      {
        adapterType: 'openai-compatible',
        apiKey: 'sk-test-key-1234',
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
        displayName: 'OpenAI',
        enabled: true,
        key: 'openai',
      },
      CONTEXT,
    );

    expect(result).toBeDefined();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ key: 'openai', keyConfigured: true });
  });

  it('returns the fresh list after updating an existing provider', async () => {
    const { close: closeDatabase, db } = await migratedDatabase();
    close = closeDatabase;
    const service = new PostgresAIConfigurationService(db, randomBytes(32).toString('base64'));
    await service.upsert(
      {
        adapterType: 'openai-compatible',
        apiKey: 'sk-test-key-1234',
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
        displayName: 'OpenAI',
        enabled: true,
        key: 'openai',
      },
      CONTEXT,
    );

    const result = await service.upsert(
      {
        adapterType: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o',
        displayName: 'OpenAI',
        enabled: true,
        key: 'openai',
      },
      CONTEXT,
    );

    expect(result).toBeDefined();
    expect(result.items[0]).toMatchObject({ defaultModel: 'gpt-4o', keyConfigured: true });
  });
});
