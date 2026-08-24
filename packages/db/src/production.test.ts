import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import {
  OperationsConflictError,
  PostgresOperationsService,
} from './repositories/postgres-operations-service.js';
import type { Database } from './index.js';
import * as schema from './schema/index.js';

/**
 * Production reporting (CHAT-3-adjacent slice: "informar producción real", snapshots) and
 * excedente (coefficient, tracking, write-offs, opportunity-sale stock) against a real Postgres
 * engine. `demanda confirmada` comes from confirmed/ready/delivered orders whose source is not
 * `opportunity_sale`; opportunity sales draw from the excedente instead of adding to demand.
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
const FAMILY = 'f0000000-0000-4000-8000-000000000001';
const SIZE = 'f1000000-0000-4000-8000-000000000001';
const VARIANT = 'f2000000-0000-4000-8000-000000000001';
const OFFERING = 'f3000000-0000-4000-8000-000000000001';

// One confirmed order for 4 units of Keto 250 — the only demand the cycle has — plus a published
// Keto 250 offering so a Keto 250 order (including an opportunity-sale one) can be created in the
// same cycle.
const seed = `
  insert into operating_sites (id, slug, display_name, order_prefix)
  values ('${SITE}', 'cipolletti', 'Cipolletti', 'CIP');
  insert into customers (id, display_name) values ('${CUSTOMER}', 'María Pérez');
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
  values ('${CYCLE}', 'Semana 34', '2026-08-20T12:00:00Z', '2026-08-25T23:00:00Z',
          '2026-08-26T22:00:00Z');
  insert into weekly_menus (id, sales_cycle_id, status)
  values ('${MENU}', '${CYCLE}', 'PUBLISHED');

  insert into product_families (id, code, display_name, kind)
  values ('${FAMILY}', 'keto', 'Keto', 'FIXED');
  -- resolveOrderItems always resolves the composable family, even for a FIXED order.
  insert into product_families (code, display_name, kind)
  values ('intuitivo', 'Intuitivo', 'COMPOSABLE');
  insert into product_sizes (id, code, display_name)
  values ('${SIZE}', '250', '250');
  insert into product_variants (id, product_family_id, product_size_id, code, display_name)
  values ('${VARIANT}', '${FAMILY}', '${SIZE}', 'keto-250', '250');
  insert into weekly_menu_prices (weekly_menu_id, product_size_id, unit_price_minor)
  values ('${MENU}', '${SIZE}', 25000);
  insert into weekly_menu_offerings (id, weekly_menu_id, product_variant_id)
  values ('${OFFERING}', '${MENU}', '${VARIANT}');
  insert into weekly_menu_items (offering_id, slot, dish_name)
  values
    ('${OFFERING}', 1, 'Plato A'), ('${OFFERING}', 2, 'Plato B'), ('${OFFERING}', 3, 'Plato C'),
    ('${OFFERING}', 4, 'Plato D'), ('${OFFERING}', 5, 'Plato E');

  insert into orders (id, public_number, customer_id, sales_cycle_id, weekly_menu_id, source,
                      status, delivery_date, delivery_address_snapshot, payment_expectation,
                      total_minor, operating_site_id, created_at)
  values
    ('0a000000-0000-4000-8000-000000000001', 'CIP-00001', '${CUSTOMER}', '${CYCLE}', '${MENU}',
     'manual', 'CONFIRMED', '2026-08-26', 'Calle 1', 'transferencia', 100000, '${SITE}',
     '2026-08-20T10:00:00Z');

  insert into order_items (id, order_id, product_name_snapshot, variant_snapshot, quantity_units,
                           unit_price_minor, total_minor)
  values
    ('0b000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001',
     'Keto', '250', 4, 25000, 100000);

  -- The seeded order above claimed CIP-00001 by hand; the counter has to know that so a
  -- service-created order does not collide with it.
  insert into operating_site_order_counters (operating_site_id, last_order_number)
  values ('${SITE}', 1);
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

const context = { correlationId: 'corr-1', requestId: 'req-1', source: 'test' };

describe('production actuals', () => {
  it('reports and re-reports (upserts) the same family/variant pair', async () => {
    const service = await seededService();

    await service.reportProduction(
      CYCLE,
      [{ familyName: 'Keto', quantityUnits: 5, variantName: '250' }],
      context,
    );
    const first = await service.listProductionActuals(CYCLE);
    expect(first).toHaveLength(1);
    expect(first[0]?.quantityUnits).toBe(5);

    await service.reportProduction(
      CYCLE,
      [{ familyName: 'Keto', quantityUnits: 6, variantName: '250' }],
      context,
    );
    const second = await service.listProductionActuals(CYCLE);
    expect(second).toHaveLength(1);
    expect(second[0]?.quantityUnits).toBe(6);
  });

  it('rejects an empty report', async () => {
    const service = await seededService();
    await expect(service.reportProduction(CYCLE, [], context)).rejects.toThrow(
      OperationsConflictError,
    );
  });
});

describe('production snapshots', () => {
  it('takes a partial snapshot and a final one carries the delta against it', async () => {
    const service = await seededService();
    await service.reportProduction(
      CYCLE,
      [{ familyName: 'Keto', quantityUnits: 5, variantName: '250' }],
      context,
    );

    const partial = await service.generateProductionSnapshot(CYCLE, 'partial', null, context);
    expect(partial.kind).toBe('partial');

    // More came out by the final snapshot.
    await service.reportProduction(
      CYCLE,
      [{ familyName: 'Keto', quantityUnits: 7, variantName: '250' }],
      context,
    );
    const final = await service.generateProductionSnapshot(CYCLE, 'final', null, context);

    const payload = final.payload as {
      delta: { deltaUnits: number; familyName: string; variantName: string }[];
    };
    expect(payload.delta).toEqual([
      expect.objectContaining({ deltaUnits: 0, familyName: 'Keto', variantName: '250' }),
    ]);
  });

  it('overwrites the row for the same (cycle, kind) instead of accumulating', async () => {
    const service = await seededService();
    await service.generateProductionSnapshot(CYCLE, 'partial', null, context);
    await service.generateProductionSnapshot(CYCLE, 'partial', null, context);

    const snapshots = await service.listProductionSnapshots(CYCLE);
    expect(snapshots.filter((snapshot) => snapshot.kind === 'partial')).toHaveLength(1);
  });
});

describe('excedente', () => {
  it('reports zero disponible before any actual production is reported', async () => {
    const service = await seededService();
    const report = await service.surplusReport(CYCLE);
    const keto = report.items.find(
      (item) => item.familyName === 'Keto' && item.variantName === '250',
    );
    expect(keto?.disponible).toBe(0);
  });

  it('computes excedente efectivo as producción real minus demanda confirmada', async () => {
    const service = await seededService();
    await service.reportProduction(
      CYCLE,
      [{ familyName: 'Keto', quantityUnits: 6, variantName: '250' }],
      context,
    );

    const report = await service.surplusReport(CYCLE);
    const keto = report.items.find(
      (item) => item.familyName === 'Keto' && item.variantName === '250',
    );
    expect(keto?.demandaConfirmada).toBe(4);
    expect(keto?.produccionReal).toBe(6);
    expect(keto?.excedenteEfectivo).toBe(2);
    expect(keto?.disponible).toBe(2);
  });

  it('produccion planificada applies the configured coefficient over demand', async () => {
    const service = await seededService();
    await service.setSurplusConfig(25, context);

    const report = await service.surplusReport(CYCLE);
    const keto = report.items.find(
      (item) => item.familyName === 'Keto' && item.variantName === '250',
    );
    // 4 confirmed * 1.25 = 5, rounded up.
    expect(keto?.produccionPlanificada).toBe(5);
  });

  it('a write-off reduces disponible and is rejected past what is available', async () => {
    const service = await seededService();
    await service.reportProduction(
      CYCLE,
      [{ familyName: 'Keto', quantityUnits: 6, variantName: '250' }],
      context,
    );

    await service.writeOffSurplus(
      CYCLE,
      [{ familyName: 'Keto', quantityUnits: 1, reason: 'Vencimiento', variantName: '250' }],
      context,
    );
    const afterWriteoff = await service.surplusReport(CYCLE);
    const keto = afterWriteoff.items.find(
      (item) => item.familyName === 'Keto' && item.variantName === '250',
    );
    expect(keto?.disponible).toBe(1);

    await expect(
      service.writeOffSurplus(
        CYCLE,
        [{ familyName: 'Keto', quantityUnits: 5, reason: 'Otra baja', variantName: '250' }],
        context,
      ),
    ).rejects.toThrow(OperationsConflictError);
  });
});

describe('kitchen labels', () => {
  it('expands the seeded order into one label per physical unit', async () => {
    const service = await seededService();
    const labels = await service.cycleLabels(CYCLE, null);
    expect(labels).toHaveLength(4);
    expect(
      labels.every((label) => label.familyName === 'Keto' && label.variantName === '250'),
    ).toBe(true);
    expect(labels.every((label) => label.customerDisplayName === null)).toBe(true);
  });

  it('labels a single order the same way, scoped to just that order', async () => {
    const service = await seededService();
    const labels = await service.orderLabels('0a000000-0000-4000-8000-000000000001');
    expect(labels).toHaveLength(4);
  });

  it('defaults label settings to 8 per page with no background, then upserts on save', async () => {
    const service = await seededService();
    expect(await service.getLabelSettings()).toMatchObject({
      backgroundImageUrl: null,
      labelsPerPage: 8,
    });

    await service.setLabelSettings({ labelsPerPage: 6 }, context);
    expect(await service.getLabelSettings()).toMatchObject({ labelsPerPage: 6 });

    await service.setLabelSettings(
      { backgroundImageUrl: 'https://blob.example/bg.png', labelsPerPage: 4 },
      context,
    );
    const settings = await service.getLabelSettings();
    expect(settings).toMatchObject({
      backgroundImageUrl: 'https://blob.example/bg.png',
      labelsPerPage: 4,
    });
  });
});

describe('opportunity sale stock', () => {
  it('rejects an opportunity-sale order requesting more than disponible', async () => {
    const service = await seededService();
    // No production reported yet, so disponible is 0.
    await expect(
      service.createOrder(
        {
          customerId: CUSTOMER,
          operatingSiteId: SITE,
          deliveryAddress: 'Calle 9',
          deliveryDate: '2026-08-26',
          dietaryInstructions: [],
          items: [{ offeringId: OFFERING, quantityUnits: 1 }],
          menuId: MENU,
          paymentExpectation: 'efectivo',
          source: 'opportunity_sale',
        },
        context,
      ),
    ).rejects.toThrow(OperationsConflictError);
  });

  it('allows an opportunity-sale order within disponible, and it counts as vendido afterwards', async () => {
    const service = await seededService();
    // 6 real - 4 confirmed demand = 2 disponible.
    await service.reportProduction(
      CYCLE,
      [{ familyName: 'Keto', quantityUnits: 6, variantName: '250' }],
      context,
    );

    const order = await service.createOrder(
      {
        customerId: CUSTOMER,
        operatingSiteId: SITE,
        deliveryAddress: 'Calle 9',
        deliveryDate: '2026-08-26',
        dietaryInstructions: [],
        initialStatus: 'CONFIRMED',
        items: [{ offeringId: OFFERING, quantityUnits: 2 }],
        menuId: MENU,
        paymentExpectation: 'efectivo',
        source: 'opportunity_sale',
      },
      context,
    );
    expect(order.status).toBe('CONFIRMED');

    const report = await service.surplusReport(CYCLE);
    const keto = report.items.find(
      (item) => item.familyName === 'Keto' && item.variantName === '250',
    );
    expect(keto?.vendidoOportunidad).toBe(2);
    expect(keto?.disponible).toBe(0);

    // A second opportunity sale now has nothing left to draw from.
    await expect(
      service.createOrder(
        {
          customerId: CUSTOMER,
          operatingSiteId: SITE,
          deliveryAddress: 'Calle 10',
          deliveryDate: '2026-08-26',
          dietaryInstructions: [],
          initialStatus: 'CONFIRMED',
          items: [{ offeringId: OFFERING, quantityUnits: 1 }],
          menuId: MENU,
          paymentExpectation: 'efectivo',
          source: 'opportunity_sale',
        },
        context,
      ),
    ).rejects.toThrow(OperationsConflictError);
  });

  it('does not require any surplus check for a regular (non-opportunity) order', async () => {
    const service = await seededService();
    const order = await service.createOrder(
      {
        customerId: CUSTOMER,
        operatingSiteId: SITE,
        deliveryAddress: 'Calle 9',
        deliveryDate: '2026-08-26',
        dietaryInstructions: [],
        items: [{ offeringId: OFFERING, quantityUnits: 100 }],
        menuId: MENU,
        paymentExpectation: 'efectivo',
        source: 'manual',
      },
      context,
    );
    expect(order.id).toBeDefined();
  });
});
