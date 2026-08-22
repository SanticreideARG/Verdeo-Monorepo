import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from './index.js';
import { PostgresAccessTokenRepository } from './repositories/postgres-access-token-repository.js';
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

const REPARTIDOR_ROLE = '10000000-0000-4000-8000-000000000001';
const OPERADOR_ROLE = '10000000-0000-4000-8000-000000000002';
const REPARTIDOR_USER = '30000000-0000-4000-8000-000000000001';
const SUPERADMIN = '30000000-0000-4000-8000-000000000002';

// A clean database already has the initial operation that migration 0009 creates (slug=neuquen),
// so this references it instead of inserting a second row under the same slug.
const seed = `
  insert into roles (id, key, name) values
    ('${REPARTIDOR_ROLE}', 'repartidor', 'Repartidor'),
    ('${OPERADOR_ROLE}', 'operador', 'Operador');
  insert into users (id, display_name) values
    ('${REPARTIDOR_USER}', 'Chofer Uno'),
    ('${SUPERADMIN}', 'Superadmin');
`;

async function neuquenSiteId(client: PGlite): Promise<string> {
  const result = await client.query<{ id: string }>(
    "select id from operating_sites where slug = 'neuquen' limit 1",
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('Seeded Neuquén operating site not found');
  return id;
}

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function seededRepository(): Promise<{
  repository: PostgresAccessTokenRepository;
  siteId: string;
}> {
  const { client, close: closeDatabase, db } = await migratedDatabase();
  close = closeDatabase;
  await client.exec(seed);
  const siteId = await neuquenSiteId(client);
  return { repository: new PostgresAccessTokenRepository(db), siteId };
}

describe('access tokens: repartidor_access', () => {
  it('finds the record by its hash, scoped to the bound user', async () => {
    const { repository, siteId } = await seededRepository();
    const created = await repository.create({
      boundUserId: REPARTIDOR_USER,
      createdByUserId: SUPERADMIN,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      kind: 'repartidor_access',
      label: 'Repartidor Neuquén',
      operatingSiteId: siteId,
      roleId: REPARTIDOR_ROLE,
      ttlHours: 48,
      tokenHash: 'hash-1',
    });
    const record = await repository.findActiveByHash('hash-1');
    expect(record?.boundUserId).toBe(REPARTIDOR_USER);
    expect(record?.kind).toBe('repartidor_access');
    expect(record?.id).toBe(created.id);
  });

  it('marking it redeemed multiple times increments use_count without blocking reuse', async () => {
    const { repository, siteId } = await seededRepository();
    await repository.create({
      boundUserId: REPARTIDOR_USER,
      createdByUserId: SUPERADMIN,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      kind: 'repartidor_access',
      label: 'Repartidor Neuquén',
      operatingSiteId: siteId,
      roleId: REPARTIDOR_ROLE,
      ttlHours: 48,
      tokenHash: 'hash-2',
    });
    const record = await repository.findActiveByHash('hash-2');
    if (!record) throw new Error('record not found');
    await repository.markRedeemed(record.id);
    await repository.markRedeemed(record.id);
    const summaries = await repository.list();
    const summary = summaries.find((item) => item.id === record.id);
    expect(summary?.useCount).toBe(2);
    expect(summary?.redeemedAt).not.toBeNull();
  });

  it('revoking sets revokedAt', async () => {
    const { repository, siteId } = await seededRepository();
    const created = await repository.create({
      boundUserId: REPARTIDOR_USER,
      createdByUserId: SUPERADMIN,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      kind: 'repartidor_access',
      label: 'Repartidor Neuquén',
      operatingSiteId: siteId,
      roleId: REPARTIDOR_ROLE,
      ttlHours: 48,
      tokenHash: 'hash-3',
    });
    await repository.revoke(created.id);
    const summaries = await repository.list();
    expect(summaries.find((item) => item.id === created.id)?.revokedAt).not.toBeNull();
  });
});

describe('access tokens: user_invite', () => {
  it('provisioning creates the user, assigns the role, and joins the operating site', async () => {
    const { repository, siteId } = await seededRepository();
    const created = await repository.create({
      createdByUserId: SUPERADMIN,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      kind: 'user_invite',
      label: 'Invitación operador',
      operatingSiteId: siteId,
      roleId: OPERADOR_ROLE,
      ttlHours: 168,
      tokenHash: 'hash-4',
    });
    const { userId } = await repository.provisionInviteUser(created.id, {
      displayName: 'Nueva Operadora',
      operatingSiteId: siteId,
      roleId: OPERADOR_ROLE,
    });
    expect(userId).toBeTruthy();
  });

  it('lists tokens filtered by operating site, with joined display names', async () => {
    const { repository, siteId } = await seededRepository();
    await repository.create({
      boundUserId: REPARTIDOR_USER,
      createdByUserId: SUPERADMIN,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      kind: 'repartidor_access',
      label: 'Repartidor Neuquén',
      operatingSiteId: siteId,
      roleId: REPARTIDOR_ROLE,
      ttlHours: 48,
      tokenHash: 'hash-5',
    });
    const summaries = await repository.list({ operatingSiteId: siteId });
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.boundUserDisplayName).toBe('Chofer Uno');
    expect(summaries[0]?.createdByDisplayName).toBe('Superadmin');
    expect(summaries[0]?.operatingSiteName).toBe('Neuquén');
    expect(summaries[0]?.roleKey).toBe('repartidor');
  });
});
