import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import { PostgresPaymentsService } from './repositories/postgres-payments-service.js';
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

const SITE = 'a0000000-0000-4000-8000-000000000009';
const CUSTOMER = 'c0000000-0000-4000-8000-000000000001';
const CYCLE = 'd0000000-0000-4000-8000-000000000001';
const MENU = 'e0000000-0000-4000-8000-000000000001';
const ORDER = '0a000000-0000-4000-8000-000000000001';
const REPARTIDOR = 'f0000000-0000-4000-8000-000000000001';
const OPERADOR = 'f0000000-0000-4000-8000-000000000002';

const seed = `
  insert into operating_sites (id, slug, display_name, order_prefix)
  values ('${SITE}', 'cipolletti', 'Cipolletti', 'CIP');
  insert into customers (id, display_name) values ('${CUSTOMER}', 'Ana Gómez');
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
  values ('${CYCLE}', 'Semana 34', '2026-08-20T12:00:00Z', '2026-08-25T23:00:00Z',
          '2026-08-26T22:00:00Z');
  insert into weekly_menus (id, sales_cycle_id, status)
  values ('${MENU}', '${CYCLE}', 'PUBLISHED');
  insert into users (id, display_name) values
    ('${REPARTIDOR}', 'Diego Reparto'),
    ('${OPERADOR}', 'Operadora');

  insert into orders (id, public_number, customer_id, sales_cycle_id, weekly_menu_id, source,
                      status, delivery_date, delivery_address_snapshot, payment_expectation,
                      total_minor, operating_site_id)
  values ('${ORDER}', 'CIP-00001', '${CUSTOMER}', '${CYCLE}', '${MENU}', 'web', 'CONFIRMED',
          '2026-08-26', 'Calle 1', 'efectivo', 25000, '${SITE}');
`;

const CONTEXT = {
  actorUserId: REPARTIDOR,
  correlationId: 'test',
  requestId: 'test',
  source: 'test',
};

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function seededService(): Promise<PostgresPaymentsService> {
  const { client, close: closeDatabase, db } = await migratedDatabase();
  close = closeDatabase;
  await client.exec(seed);
  return new PostgresPaymentsService(db);
}

describe('getOrCreateForOrder', () => {
  it('lazily creates a PENDING payment matching the order total', async () => {
    const service = await seededService();

    const payment = await service.getOrCreateForOrder(ORDER);

    expect(payment).toMatchObject({
      amountMinor: 25000,
      expectedMethod: 'efectivo',
      status: 'PENDING',
    });
  });

  it('is idempotent', async () => {
    const service = await seededService();
    const first = await service.getOrCreateForOrder(ORDER);

    const second = await service.getOrCreateForOrder(ORDER);

    expect(second.id).toBe(first.id);
  });
});

describe('recordCollection', () => {
  it('moves a cash collection to TO_SETTLE', async () => {
    const service = await seededService();

    await service.recordCollection(ORDER, 25000, 'efectivo', CONTEXT);

    const [payment] = await service.listByStatus('TO_SETTLE');
    expect(payment?.orderId).toBe(ORDER);
  });

  it('moves a non-cash collection straight to PAID', async () => {
    const service = await seededService();

    await service.recordCollection(ORDER, 25000, 'transferencia', CONTEXT);

    const [payment] = await service.listByStatus('PAID');
    expect(payment?.orderId).toBe(ORDER);
  });

  it('surfaces cash held by the collecting repartidor before settlement', async () => {
    const service = await seededService();
    await service.recordCollection(ORDER, 25000, 'efectivo', CONTEXT);

    const held = await service.listUnsettledCollections(REPARTIDOR);

    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ amountMinor: 25000, orderId: ORDER });
  });
});

describe('settleCollection', () => {
  it('settles the collection and marks the order PAID', async () => {
    const service = await seededService();
    const collection = await service.recordCollection(ORDER, 25000, 'efectivo', CONTEXT);

    await service.settleCollection(collection.id, OPERADOR, {
      actorUserId: OPERADOR,
      correlationId: 'test',
      requestId: 'test',
      source: 'test',
    });

    const [payment] = await service.listByStatus('PAID');
    expect(payment?.orderId).toBe(ORDER);
    expect(await service.listUnsettledCollections()).toHaveLength(0);
  });

  it('refuses to settle the same collection twice', async () => {
    const service = await seededService();
    const collection = await service.recordCollection(ORDER, 25000, 'efectivo', CONTEXT);
    const settleContext = {
      actorUserId: OPERADOR,
      correlationId: 'test',
      requestId: 'test',
      source: 'test',
    };
    await service.settleCollection(collection.id, OPERADOR, settleContext);

    await expect(service.settleCollection(collection.id, OPERADOR, settleContext)).rejects.toThrow(
      /ya fue rendida/,
    );
  });
});

describe('dashboard', () => {
  it('totals pending, to-settle and paid, plus cash held per repartidor', async () => {
    const service = await seededService();
    await service.recordCollection(ORDER, 25000, 'efectivo', CONTEXT);

    const dashboard = await service.dashboard(SITE);

    expect(dashboard.toSettleTotalMinor).toBe(25000);
    expect(dashboard.pendingTotalMinor).toBe(0);
    expect(dashboard.cashByRepartidor).toEqual([
      expect.objectContaining({ amountMinor: 25000, collectedByUserId: REPARTIDOR }),
    ]);
  });
});
