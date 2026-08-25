import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import { PostgresOAuthIdentityRepository } from './repositories/postgres-oauth-identity-repository.js';
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

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function seeded(): Promise<{
  client: PGlite;
  db: Database;
  repository: PostgresOAuthIdentityRepository;
}> {
  const { client, close: closeDatabase, db } = await migratedDatabase();
  close = closeDatabase;
  // Same 'cliente' role the real seed.ts creates — not part of the migrations themselves.
  await client.exec(
    `insert into roles (id, key, name, description)
     values ('a0000000-0000-4000-8000-000000000001', 'cliente', 'Cliente', 'Cliente');`,
  );
  return { client, db, repository: new PostgresOAuthIdentityRepository(db) };
}

describe('PostgresOAuthIdentityRepository.resolveOrProvisionCustomer', () => {
  it('creates a new user, a new CRM customer, and the cliente role on a first-time email', async () => {
    const { db, repository } = await seeded();

    const resolved = await repository.resolveOrProvisionCustomer({
      email: 'nueva@example.com',
      provider: 'supabase',
      providerSubject: 'sub-1',
    });

    expect(resolved.linked).toBe(true);
    const [role] = await db
      .select({ roleId: schema.userRoles.roleId })
      .from(schema.userRoles)
      .where(eq(schema.userRoles.userId, resolved.userId));
    expect(role).toBeDefined();
    const [customer] = await db
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(eq(schema.customers.id, resolved.customerId));
    expect(customer).toBeDefined();
  });

  it('resolves the same identity a second time without creating duplicates', async () => {
    const { db, repository } = await seeded();
    const first = await repository.resolveOrProvisionCustomer({
      email: 'repetida@example.com',
      provider: 'supabase',
      providerSubject: 'sub-2',
    });

    const second = await repository.resolveOrProvisionCustomer({
      email: 'repetida@example.com',
      provider: 'supabase',
      providerSubject: 'sub-2',
    });

    expect(second).toEqual({ customerId: first.customerId, linked: false, userId: first.userId });
    const customers = await db.select().from(schema.customers);
    expect(customers).toHaveLength(1);
  });

  it('links to an existing CRM customer matched by email instead of creating a duplicate', async () => {
    const { client, repository } = await seeded();
    await client.exec(
      `insert into customers (id, display_name)
       values ('b0000000-0000-4000-8000-000000000001', 'Cliente Existente');
       insert into customer_identities (customer_id, type, value_normalized, value_display, active, "primary")
       values ('b0000000-0000-4000-8000-000000000001', 'email', 'ya@example.com', 'ya@example.com', true, true);`,
    );

    const resolved = await repository.resolveOrProvisionCustomer({
      email: 'ya@example.com',
      provider: 'supabase',
      providerSubject: 'sub-3',
    });

    expect(resolved.customerId).toBe('b0000000-0000-4000-8000-000000000001');
  });

  it('reuses an existing (e.g. staff) user matched by email instead of creating a second account', async () => {
    const { client, db, repository } = await seeded();
    await client.exec(
      `insert into users (id, display_name, email_normalized)
       values ('c0000000-0000-4000-8000-000000000001', 'Colaborador', 'compartido@example.com');`,
    );

    const resolved = await repository.resolveOrProvisionCustomer({
      email: 'compartido@example.com',
      provider: 'supabase',
      providerSubject: 'sub-4',
    });

    expect(resolved.userId).toBe('c0000000-0000-4000-8000-000000000001');
    const identities = await db
      .select()
      .from(schema.authIdentities)
      .where(eq(schema.authIdentities.userId, 'c0000000-0000-4000-8000-000000000001'));
    expect(identities).toHaveLength(1);
  });
});
