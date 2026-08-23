import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import { PostgresOperationsService } from './repositories/postgres-operations-service.js';
import type { Database } from './index.js';
import * as schema from './schema/index.js';

/**
 * Public order tracking pairs a publicNumber with the contact the customer checked out with — this
 * is the anti-enumeration boundary (a guessed publicNumber alone must not surface anyone's order),
 * so it is exercised against a real PostgreSQL engine rather than mocked.
 */

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

const SITE = 'a0000000-0000-4000-8000-000000000009';
const CUSTOMER = 'c0000000-0000-4000-8000-000000000001';
const OTHER_CUSTOMER = 'c0000000-0000-4000-8000-000000000002';
const CYCLE = 'd0000000-0000-4000-8000-000000000001';
const MENU = 'e0000000-0000-4000-8000-000000000001';
const ORDER = '0a000000-0000-4000-8000-000000000001';

const seed = `
  insert into operating_sites (id, slug, display_name, order_prefix)
  values ('${SITE}', 'cipolletti', 'Cipolletti', 'CIP');
  insert into customers (id, display_name) values
    ('${CUSTOMER}', 'María Pérez'),
    ('${OTHER_CUSTOMER}', 'Otro Cliente');
  insert into customer_identities (customer_id, type, value_normalized, value_display, "primary")
  values ('${CUSTOMER}', 'email', 'maria@example.com', 'maria@example.com', true);
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
  values ('${CYCLE}', 'Semana 34', '2026-08-20T12:00:00Z', '2026-08-25T23:00:00Z',
          '2026-08-26T22:00:00Z');
  insert into weekly_menus (id, sales_cycle_id, status)
  values ('${MENU}', '${CYCLE}', 'PUBLISHED');

  insert into orders (id, public_number, customer_id, sales_cycle_id, weekly_menu_id, source,
                      status, delivery_date, delivery_address_snapshot, payment_expectation,
                      total_minor, operating_site_id, created_at)
  values ('${ORDER}', 'CIP-00001', '${CUSTOMER}', '${CYCLE}', '${MENU}', 'web', 'CONFIRMED',
          '2026-08-26', 'Calle 1', 'transferencia', 25000, '${SITE}', '2026-08-20T10:00:00Z');

  insert into order_items (id, order_id, product_name_snapshot, variant_snapshot, quantity_units,
                           unit_price_minor, total_minor)
  values ('0b000000-0000-4000-8000-000000000001', '${ORDER}', 'Keto', '250', 1, 25000, 25000);

  insert into order_status_history (order_id, from_status, to_status, created_at)
  values ('${ORDER}', null, 'CONFIRMED', '2026-08-20T10:00:00Z');
`;

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function seededService(): Promise<PostgresOperationsService> {
  const { client, close: closeDatabase, db } = await migratedDatabase();
  close = closeDatabase;
  await client.exec(seed);
  return new PostgresOperationsService(db, {
    key: 'test',
    resolve: () => Promise.resolve({ candidates: [], status: 'NO_MATCH' }),
  } as never);
}

describe('public order tracking', () => {
  it('returns the order when the number and contact match', async () => {
    const service = await seededService();

    const result = await service.trackPublicOrder('CIP-00001', 'maria@example.com');

    expect(result?.order.publicNumber).toBe('CIP-00001');
    expect(result?.order.status).toBe('CONFIRMED');
    expect(result?.history).toHaveLength(1);
  });

  it('is case/whitespace tolerant on the public number', async () => {
    const service = await seededService();

    const result = await service.trackPublicOrder('  cip-00001 ', 'maria@example.com');

    expect(result?.order.publicNumber).toBe('CIP-00001');
  });

  it('returns null when the contact does not match the order', async () => {
    const service = await seededService();

    const result = await service.trackPublicOrder('CIP-00001', 'nadie@example.com');

    expect(result).toBeNull();
  });

  it('returns null when the public number does not exist', async () => {
    const service = await seededService();

    const result = await service.trackPublicOrder('XXX-99999', 'maria@example.com');

    expect(result).toBeNull();
  });
});
