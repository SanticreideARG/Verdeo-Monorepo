import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from './index.js';
import { PostgresCustomerLoginService } from './repositories/postgres-customer-login-service.js';
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

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
});

async function harness() {
  const database = await migratedDatabase();
  close = database.close;
  return { client: database.client, service: new PostgresCustomerLoginService(database.db) };
}

describe('PostgresCustomerLoginService', () => {
  it('issues a link and lets it be consumed once', async () => {
    const { service } = await harness();
    const issued = await service.requestLogin('Cliente@Ejemplo.com');
    expect(issued).not.toBeNull();

    // Normalised on the way in, so casing in the address cannot create a second identity.
    expect(await service.consume(issued!.token)).toEqual({
      emailNormalized: 'cliente@ejemplo.com',
    });

    // The point of a single-use link: a second visit, or a forwarded email, gets nothing.
    expect(await service.consume(issued!.token)).toBeNull();
  });

  it('refuses a token that was never issued', async () => {
    const { service } = await harness();
    await service.requestLogin('alguien@ejemplo.com');

    expect(await service.consume('un-token-inventado')).toBeNull();
  });

  it('refuses an expired link', async () => {
    const { client, service } = await harness();
    const issued = await service.requestLogin('vencido@ejemplo.com');
    // Aged directly rather than waiting fifteen real minutes.
    await client.exec(`update customer_login_tokens set expires_at = now() - interval '1 minute'`);

    expect(await service.consume(issued!.token)).toBeNull();
  });

  /**
   * Following a link spends every other outstanding one for that address: the person is already
   * in, and an older link sitting in their inbox should not open a session later.
   */
  it('spends every outstanding link for the address when one is used', async () => {
    const { service } = await harness();
    const first = await service.requestLogin('multi@ejemplo.com');
    const second = await service.requestLogin('multi@ejemplo.com');

    expect(await service.consume(second!.token)).not.toBeNull();
    expect(await service.consume(first!.token)).toBeNull();
  });

  it('does not let one address flood itself with links', async () => {
    const { service } = await harness();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await service.requestLogin('flood@ejemplo.com')).not.toBeNull();
    }

    // Refused rather than thrown: the route has to answer identically either way, or the endpoint
    // becomes a way to discover which addresses have an account.
    expect(await service.requestLogin('flood@ejemplo.com')).toBeNull();
    // Per address, not global.
    expect(await service.requestLogin('otro@ejemplo.com')).not.toBeNull();
  });

  it('stores only the hash, never the token itself', async () => {
    const { client, service } = await harness();
    const issued = await service.requestLogin('hash@ejemplo.com');

    const rows = await client.query<{ token_hash: string }>(
      'select token_hash from customer_login_tokens',
    );
    expect(rows.rows).toHaveLength(1);
    // A database leak must not hand anyone a working sign-in link.
    expect(rows.rows[0]?.token_hash).not.toBe(issued!.token);
    expect(rows.rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
