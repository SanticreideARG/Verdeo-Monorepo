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
 * Exercises the order listing against a real PostgreSQL engine. The listing used to load one order
 * at a time, so this guards the batched version against the ways it could silently go wrong:
 * losing pagination order, attaching items to the wrong order, or dropping orders entirely.
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
const CYCLE = 'd0000000-0000-4000-8000-000000000001';
const MENU = 'e0000000-0000-4000-8000-000000000001';

/** Three orders, each with a different item shape, created oldest first. */
const seed = `
  insert into operating_sites (id, slug, display_name, order_prefix)
  values ('${SITE}', 'cipolletti', 'Cipolletti', 'CIP');
  insert into customers (id, display_name) values ('${CUSTOMER}', 'María Pérez');
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
  values ('${CYCLE}', 'Semana 34', '2026-08-20T12:00:00Z', '2026-08-25T23:00:00Z',
          '2026-08-26T22:00:00Z');
  insert into weekly_menus (id, sales_cycle_id, status)
  values ('${MENU}', '${CYCLE}', 'PUBLISHED');

  insert into orders (id, public_number, customer_id, sales_cycle_id, weekly_menu_id, source,
                      delivery_date, delivery_address_snapshot, payment_expectation, total_minor,
                      operating_site_id, created_at)
  values
    ('0a000000-0000-4000-8000-000000000001', 'CIP-00001', '${CUSTOMER}', '${CYCLE}', '${MENU}',
     'manual', '2026-08-26', 'Calle 1', 'transferencia', 25000, '${SITE}', '2026-08-20T10:00:00Z'),
    ('0a000000-0000-4000-8000-000000000002', 'CIP-00002', '${CUSTOMER}', '${CYCLE}', '${MENU}',
     'web', '2026-08-26', 'Calle 2', 'efectivo', 50000, '${SITE}', '2026-08-20T11:00:00Z'),
    ('0a000000-0000-4000-8000-000000000003', 'CIP-00003', '${CUSTOMER}', '${CYCLE}', '${MENU}',
     'manual', '2026-08-26', 'Calle 3', 'transferencia', 0, '${SITE}', '2026-08-20T12:00:00Z');

  insert into order_items (id, order_id, product_name_snapshot, variant_snapshot, quantity_units,
                           unit_price_minor, total_minor)
  values
    ('0b000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001',
     'Keto', '250', 1, 25000, 25000),
    ('0b000000-0000-4000-8000-000000000002', '0a000000-0000-4000-8000-000000000002',
     'Real', '400', 1, 38000, 38000),
    ('0b000000-0000-4000-8000-000000000003', '0a000000-0000-4000-8000-000000000002',
     'Intuitivo', '250', 1, 12000, 12000);

  insert into order_item_selections (order_item_id, slot, dish_name_snapshot)
  values
    ('0b000000-0000-4000-8000-000000000003', 1, 'Plato A'),
    ('0b000000-0000-4000-8000-000000000003', 2, 'Plato B');

  insert into order_dietary_instructions (order_id, instruction)
  values ('0a000000-0000-4000-8000-000000000001', 'Sin cebolla');
`;

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function seededService(): Promise<PostgresOperationsService> {
  const { client, close: closeDatabase, db } = await migratedDatabase();
  close = closeDatabase;
  // exec() accepts a multi-statement script; execute() prepares a single statement.
  await client.exec(seed);
  return new PostgresOperationsService(db, {
    key: 'test',
    resolve: () => Promise.resolve({ candidates: [], status: 'NO_MATCH' }),
  } as never);
}

describe('order listing', () => {
  it('returns the page in pagination order, newest first', async () => {
    const service = await seededService();

    const page = await service.listOrders({ limit: 30 });

    expect(page.items.map((order) => order.publicNumber)).toEqual([
      'CIP-00003',
      'CIP-00002',
      'CIP-00001',
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('attaches items, dish selections and instructions to the right order', async () => {
    const service = await seededService();

    const page = await service.listOrders({ limit: 30 });
    const byNumber = new Map(page.items.map((order) => [order.publicNumber, order]));

    // Two items on one order, one on another, none on the third.
    expect(byNumber.get('CIP-00002')?.items).toHaveLength(2);
    expect(byNumber.get('CIP-00001')?.items).toHaveLength(1);
    expect(byNumber.get('CIP-00003')?.items).toHaveLength(0);

    // Selections belong to a single item, not to every item of the order.
    const composed = byNumber
      .get('CIP-00002')
      ?.items.find((item) => item.productName === 'Intuitivo');
    expect(composed?.dishSelections).toEqual(['Plato A', 'Plato B']);
    const fixed = byNumber.get('CIP-00002')?.items.find((item) => item.productName === 'Real');
    expect(fixed?.dishSelections).toEqual([]);

    // Instructions stay on their own order.
    expect(byNumber.get('CIP-00001')?.dietaryInstructions).toEqual(['Sin cebolla']);
    expect(byNumber.get('CIP-00002')?.dietaryInstructions).toEqual([]);
  });

  it('paginates without dropping or repeating an order', async () => {
    const service = await seededService();

    const first = await service.listOrders({ limit: 2 });
    expect(first.items.map((order) => order.publicNumber)).toEqual(['CIP-00003', 'CIP-00002']);
    expect(first.nextCursor).not.toBeNull();

    const second = await service.listOrders({ cursor: first.nextCursor ?? undefined, limit: 2 });
    expect(second.items.map((order) => order.publicNumber)).toEqual(['CIP-00001']);
    expect(second.nextCursor).toBeNull();
  });

  it('restricts the page to the selected operation', async () => {
    const service = await seededService();

    const other = await service.listOrders({
      limit: 30,
      operatingSiteId: 'a0000000-0000-4000-8000-00000000ffff',
    });

    expect(other.items).toEqual([]);
  });
});
