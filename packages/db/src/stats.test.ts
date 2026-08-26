import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import { PostgresOperationsService } from './repositories/postgres-operations-service.js';
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

const SITE_A = 'a0000000-0000-4000-8000-000000000001';
const SITE_B = 'a0000000-0000-4000-8000-000000000002';
const CUSTOMER = 'c0000000-0000-4000-8000-000000000001';
const CYCLE = 'd0000000-0000-4000-8000-000000000001';
const MENU_A = 'e0000000-0000-4000-8000-000000000001';
const MENU_B = 'e0000000-0000-4000-8000-000000000002';

// Two sites, one cycle: three real orders (two in site A, one in site B) plus a cancelled order
// that must never show up in any rollup — a cancelled order was never real demand.
const seed = `
  insert into operating_sites (id, slug, display_name, order_prefix)
  values
    ('${SITE_A}', 'cipolletti', 'Cipolletti', 'CIP'),
    ('${SITE_B}', 'general-roca', 'General Roca', 'GRO');
  insert into customers (id, display_name) values ('${CUSTOMER}', 'María Pérez');
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
  values ('${CYCLE}', 'Semana 34', '2026-08-20T12:00:00Z', '2026-08-25T23:00:00Z',
          '2026-08-26T22:00:00Z');
  insert into weekly_menus (id, sales_cycle_id, operating_site_id, status)
  values
    ('${MENU_A}', '${CYCLE}', '${SITE_A}', 'PUBLISHED'),
    ('${MENU_B}', '${CYCLE}', '${SITE_B}', 'PUBLISHED');

  insert into orders (id, public_number, customer_id, sales_cycle_id, weekly_menu_id, source,
                      status, delivery_date, delivery_address_snapshot, payment_expectation,
                      total_minor, operating_site_id)
  values
    ('0a000000-0000-4000-8000-000000000001', 'CIP-00001', '${CUSTOMER}', '${CYCLE}', '${MENU_A}',
     'manual', 'CONFIRMED', '2026-08-26', 'Calle 1', 'transferencia', 25000, '${SITE_A}'),
    ('0a000000-0000-4000-8000-000000000002', 'CIP-00002', '${CUSTOMER}', '${CYCLE}', '${MENU_A}',
     'web', 'DELIVERED', '2026-08-26', 'Calle 2', 'efectivo', 50000, '${SITE_A}'),
    ('0a000000-0000-4000-8000-000000000003', 'NQN-00001', '${CUSTOMER}', '${CYCLE}', '${MENU_B}',
     'manual', 'DRAFT', '2026-08-26', 'Calle 3', 'transferencia', 12000, '${SITE_B}'),
    ('0a000000-0000-4000-8000-000000000004', 'NQN-00002', '${CUSTOMER}', '${CYCLE}', '${MENU_B}',
     'manual', 'CANCELLED', '2026-08-26', 'Calle 4', 'transferencia', 99999, '${SITE_B}');

  insert into order_items (id, order_id, product_name_snapshot, variant_snapshot, quantity_units,
                           unit_price_minor, total_minor)
  values
    ('0b000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001',
     'Keto', '250', 1, 25000, 25000),
    ('0b000000-0000-4000-8000-000000000002', '0a000000-0000-4000-8000-000000000002',
     'Keto', '400', 1, 38000, 38000),
    ('0b000000-0000-4000-8000-000000000003', '0a000000-0000-4000-8000-000000000002',
     'Real', '250', 1, 12000, 12000),
    ('0b000000-0000-4000-8000-000000000004', '0a000000-0000-4000-8000-000000000003',
     'Real', '250', 1, 12000, 12000),
    ('0b000000-0000-4000-8000-000000000005', '0a000000-0000-4000-8000-000000000004',
     'Real', '400', 1, 99999, 99999);
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

describe('getStatsOverview', () => {
  it('excludes cancelled orders from every rollup', async () => {
    const service = await seededService();

    const overview = await service.getStatsOverview({});

    expect(overview.global.orderCount).toBe(3);
    expect(overview.global.revenueMinor).toBe(25000 + 50000 + 12000);
    expect(overview.global.averageOrderValueMinor).toBe(Math.round((25000 + 50000 + 12000) / 3));
    // The cancelled order's own status never even appears in the breakdown.
    expect(overview.global.statusBreakdown.map((row) => row.status).sort()).toEqual([
      'CONFIRMED',
      'DELIVERED',
      'DRAFT',
    ]);
  });

  it('rolls up revenue and order count by zone', async () => {
    const service = await seededService();

    const overview = await service.getStatsOverview({});

    const bySite = new Map(overview.byZone.map((row) => [row.operatingSiteName, row]));
    expect(bySite.get('Cipolletti')).toMatchObject({ orderCount: 2, revenueMinor: 75000 });
    expect(bySite.get('General Roca')).toMatchObject({ orderCount: 1, revenueMinor: 12000 });
  });

  it('rolls up revenue by sales cycle', async () => {
    const service = await seededService();

    const overview = await service.getStatsOverview({});

    expect(overview.byCycle).toHaveLength(1);
    expect(overview.byCycle[0]).toMatchObject({
      cycleAlias: 'Semana 34',
      orderCount: 3,
      revenueMinor: 87000,
    });
  });

  it('rolls up units and revenue by size across every order item', async () => {
    const service = await seededService();

    const overview = await service.getStatsOverview({});

    const bySize = new Map(overview.bySize.map((row) => [row.sizeName, row]));
    // Two 250s (25000 + 12000) from CIP-00001/CIP-00002, plus one more 250 (12000) from NQN-00001.
    expect(bySize.get('250')).toMatchObject({ revenueMinor: 25000 + 12000 + 12000, units: 3 });
    // One 400 at 38000 — the cancelled order's 400 (99999) must not be counted here.
    expect(bySize.get('400')).toMatchObject({ revenueMinor: 38000, units: 1 });
  });

  it('scopes to a single operating site when filtered', async () => {
    const service = await seededService();

    const overview = await service.getStatsOverview({ operatingSiteId: SITE_B });

    expect(overview.global.orderCount).toBe(1);
    expect(overview.global.revenueMinor).toBe(12000);
    expect(overview.byZone).toHaveLength(1);
    expect(overview.byZone[0]?.operatingSiteName).toBe('General Roca');
  });

  it('scopes to a delivery-date window', async () => {
    const service = await seededService();

    const withinWindow = await service.getStatsOverview({
      from: '2026-08-26',
      to: '2026-08-26',
    });
    expect(withinWindow.global.orderCount).toBe(3);

    const outsideWindow = await service.getStatsOverview({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(outsideWindow.global.orderCount).toBe(0);
    expect(outsideWindow.byZone).toHaveLength(0);
  });
});
