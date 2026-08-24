import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AuditService } from '@verdeo/audit';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import { PostgresAuditQueryService } from './repositories/postgres-audit-query-service.js';
import { PostgresAuditSink } from './repositories/postgres-audit-sink.js';
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

const USER = 'f0000000-0000-4000-8000-000000000001';

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function seeded() {
  const { client, close: closeDatabase, db } = await migratedDatabase();
  close = closeDatabase;
  await client.exec(`insert into users (id, display_name) values ('${USER}', 'Ana Operadora');`);
  const audit = new AuditService(new PostgresAuditSink(db));
  const query = new PostgresAuditQueryService(db);
  return { audit, db, query };
}

describe('PostgresAuditQueryService', () => {
  it('lists the most recent events first', async () => {
    const { audit, query } = await seeded();
    await audit.record({
      action: 'customer.created',
      actor: { type: 'user', userId: USER },
      correlationId: 'c1',
      entityId: 'cust-1',
      entityType: 'customer',
      requestId: 'r1',
      source: 'api',
    });
    await audit.record({
      action: 'order.status_changed',
      actor: { type: 'user', userId: USER },
      correlationId: 'c2',
      entityId: 'order-1',
      entityType: 'order',
      requestId: 'r2',
      source: 'api',
    });

    const result = await query.listEvents({ limit: 50 });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.action).toBe('order.status_changed');
    expect(result.items[0]?.actorDisplayName).toBe('Ana Operadora');
  });

  it('filters by entityType and entityId', async () => {
    const { audit, query } = await seeded();
    await audit.record({
      action: 'customer.created',
      actor: { type: 'user', userId: USER },
      correlationId: 'c1',
      entityId: 'cust-1',
      entityType: 'customer',
      requestId: 'r1',
      source: 'api',
    });
    await audit.record({
      action: 'order.status_changed',
      actor: { type: 'user', userId: USER },
      correlationId: 'c2',
      entityId: 'order-1',
      entityType: 'order',
      requestId: 'r2',
      source: 'api',
    });

    const result = await query.listEvents({ entityId: 'order-1', entityType: 'order', limit: 50 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.entityId).toBe('order-1');
  });

  it('filters by a partial action match', async () => {
    const { audit, query } = await seeded();
    await audit.record({
      action: 'customer.merged',
      actor: { type: 'system' },
      correlationId: 'c1',
      entityId: 'cust-1',
      entityType: 'customer',
      requestId: 'r1',
      source: 'api',
    });
    await audit.record({
      action: 'order.status_changed',
      actor: { type: 'system' },
      correlationId: 'c2',
      entityId: 'order-1',
      entityType: 'order',
      requestId: 'r2',
      source: 'api',
    });

    const result = await query.listEvents({ action: 'merged', limit: 50 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.action).toBe('customer.merged');
  });

  it('paginates with a before cursor and reports whether more remain', async () => {
    const { audit, query } = await seeded();
    for (let index = 0; index < 3; index += 1) {
      await audit.record({
        action: `event.${index}`,
        actor: { type: 'system' },
        correlationId: `c${index}`,
        entityId: 'e',
        entityType: 'thing',
        requestId: `r${index}`,
        source: 'api',
      });
    }

    const firstPage = await query.listEvents({ limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextBefore).not.toBeNull();

    const secondPage = await query.listEvents({ before: firstPage.nextBefore!, limit: 2 });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextBefore).toBeNull();
  });

  it('lists distinct entityType and action facets', async () => {
    const { audit, query } = await seeded();
    await audit.record({
      action: 'customer.created',
      actor: { type: 'system' },
      correlationId: 'c1',
      entityId: 'cust-1',
      entityType: 'customer',
      requestId: 'r1',
      source: 'api',
    });
    await audit.record({
      action: 'customer.created',
      actor: { type: 'system' },
      correlationId: 'c2',
      entityId: 'cust-2',
      entityType: 'customer',
      requestId: 'r2',
      source: 'api',
    });
    await audit.record({
      action: 'order.status_changed',
      actor: { type: 'system' },
      correlationId: 'c3',
      entityId: 'order-1',
      entityType: 'order',
      requestId: 'r3',
      source: 'api',
    });

    const facets = await query.listFacets();

    expect(facets.entityTypes).toEqual(['customer', 'order']);
    expect(facets.actions).toEqual(['customer.created', 'order.status_changed']);
  });
});
