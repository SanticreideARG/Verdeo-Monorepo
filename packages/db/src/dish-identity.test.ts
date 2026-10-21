import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from './index.js';
import { PostgresOperationsService } from './repositories/postgres-operations-service.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const SITE = 'a0000000-0000-4000-8000-000000000009';
const CUSTOMER = 'c0000000-0000-4000-8000-000000000001';
const CYCLE = 'd0000000-0000-4000-8000-000000000001';
const MENU = 'e0000000-0000-4000-8000-000000000001';
const SIZE = 'f1000000-0000-4000-8000-000000000001';
const INTUITIVO = 'f3000000-0000-4000-8000-000000000001';
const KETO = 'f3000000-0000-4000-8000-000000000002';
const ANTIAGE = 'f3000000-0000-4000-8000-000000000003';

/*
 * Dos menús que comparten un plato: "Lomo con cebolla" es el plato 3 de Keto y el plato 1 de
 * Anti-Age. Son dos platos distintos (DISH_IDENTITY_AND_DEBTORS_PLAN.md).
 */
const seed = `
  insert into operating_sites (id, slug, display_name, order_prefix)
  values ('${SITE}', 'cipolletti', 'Cipolletti', 'CIP');
  insert into customers (id, display_name) values ('${CUSTOMER}', 'María Pérez');
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
  values ('${CYCLE}', 'Semana 34', '2026-08-20T12:00:00Z', '2026-08-25T23:00:00Z',
          '2126-08-26T22:00:00Z');
  insert into weekly_menus (id, sales_cycle_id, status)
  values ('${MENU}', '${CYCLE}', 'PUBLISHED');
  insert into product_sizes (id, code, display_name, meals_per_unit)
  values ('${SIZE}', '250', '250', 5);
  insert into weekly_menu_prices (weekly_menu_id, product_size_id, unit_price_minor)
  values ('${MENU}', '${SIZE}', 2500000);

  insert into product_families (id, code, display_name, kind) values
    ('f0000000-0000-4000-8000-000000000001', 'intuitivo', 'Intuitivo', 'COMPOSABLE'),
    ('f0000000-0000-4000-8000-000000000002', 'keto', 'Keto', 'FIXED'),
    ('f0000000-0000-4000-8000-000000000003', 'antiage', 'Anti-Age', 'FIXED');
  insert into product_variants (id, product_family_id, product_size_id, code, display_name) values
    ('f2000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', '${SIZE}', 'i-250', '250'),
    ('f2000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002', '${SIZE}', 'k-250', '250'),
    ('f2000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000003', '${SIZE}', 'a-250', '250');
  insert into weekly_menu_offerings (id, weekly_menu_id, product_variant_id) values
    ('${INTUITIVO}', '${MENU}', 'f2000000-0000-4000-8000-000000000001'),
    ('${KETO}', '${MENU}', 'f2000000-0000-4000-8000-000000000002'),
    ('${ANTIAGE}', '${MENU}', 'f2000000-0000-4000-8000-000000000003');
  insert into weekly_menu_items (offering_id, slot, dish_name) values
    ('${KETO}', 1, 'Pastel'), ('${KETO}', 2, 'Pollo'), ('${KETO}', 3, 'Lomo con cebolla'),
    ('${KETO}', 4, 'Cazuela'), ('${KETO}', 5, 'Canelones'),
    ('${ANTIAGE}', 1, 'Lomo con cebolla'), ('${ANTIAGE}', 2, 'Wok'), ('${ANTIAGE}', 3, 'Tarta'),
    ('${ANTIAGE}', 4, 'Guiso'), ('${ANTIAGE}', 5, 'Ensalada');
`;

const CONTEXT = { correlationId: 'test', requestId: 'test', source: 'test' };

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function sembrada() {
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
  await client.exec(seed);
  close = () => client.close();
  return new PostgresOperationsService(
    drizzle(client, { schema }) as unknown as Database,
    {
      key: 'test',
      resolve: () => Promise.resolve({ candidates: [], status: 'NO_MATCH' }),
    } as never,
  );
}

function intuitivo(
  dishes:
    | { selectedDishes: { dishName: string; familyName: string }[] }
    | { selectedDishNames: string[] },
) {
  return {
    customerId: CUSTOMER,
    deliveryAddress: 'Calle 1',
    deliveryDate: '2126-08-27',
    dietaryInstructions: [],
    initialStatus: 'CONFIRMED' as const,
    items: [{ offeringId: INTUITIVO, quantityUnits: 2, ...dishes }],
    menuId: MENU,
    operatingSiteId: SITE,
    paymentExpectation: 'Efectivo',
    source: 'manual',
  };
}

describe('un plato con el mismo nombre en dos menús son dos platos', () => {
  it('el Intuitivo guarda de qué menú y de qué posición es cada plato', async () => {
    const operations = await sembrada();
    await operations.createOrder(
      intuitivo({
        selectedDishes: [
          { dishName: 'Lomo con cebolla', familyName: 'Anti-Age' },
          { dishName: 'Lomo con cebolla', familyName: 'Keto' },
          { dishName: 'Pastel', familyName: 'Keto' },
          { dishName: 'Wok', familyName: 'Anti-Age' },
          { dishName: 'Guiso', familyName: 'Anti-Age' },
        ],
      }),
      CONTEXT,
    );

    const kitchen = await operations.kitchenSummary(CYCLE);
    expect(kitchen.custom[0]?.dishSources).toEqual([
      { familyName: 'Anti-Age', slot: 1 },
      { familyName: 'Keto', slot: 3 },
      { familyName: 'Keto', slot: 1 },
      { familyName: 'Anti-Age', slot: 2 },
      { familyName: 'Anti-Age', slot: 4 },
    ]);
    // "Platos a preparar" cuenta los dos lomos por separado: dos unidades de cada uno.
    expect(kitchen.dishTally).toEqual(
      expect.arrayContaining([
        { dishName: 'Lomo con cebolla', familyName: 'Anti-Age', portions: 2 },
        { dishName: 'Lomo con cebolla', familyName: 'Keto', portions: 2 },
      ]),
    );
  });

  it('rechaza un plato que no está en el menú que se dijo', async () => {
    const operations = await sembrada();

    await expect(
      operations.createOrder(
        intuitivo({
          selectedDishes: [
            { dishName: 'Wok', familyName: 'Keto' },
            { dishName: 'Pastel', familyName: 'Keto' },
            { dishName: 'Pollo', familyName: 'Keto' },
            { dishName: 'Cazuela', familyName: 'Keto' },
            { dishName: 'Canelones', familyName: 'Keto' },
          ],
        }),
        CONTEXT,
      ),
    ).rejects.toThrow(/"Wok" no está en el menú Keto/);
  });

  it('con sólo nombres, ubica los únicos y deja sin origen los repetidos', async () => {
    const operations = await sembrada();
    await operations.createOrder(
      intuitivo({
        selectedDishNames: ['Lomo con cebolla', 'Pastel', 'Wok', 'Guiso', 'Cazuela'],
      }),
      CONTEXT,
    );

    const kitchen = await operations.kitchenSummary(CYCLE);
    expect(kitchen.custom[0]?.dishSources).toEqual([
      null,
      { familyName: 'Keto', slot: 1 },
      { familyName: 'Anti-Age', slot: 2 },
      { familyName: 'Anti-Age', slot: 4 },
      { familyName: 'Keto', slot: 4 },
    ]);
  });
});

describe('pedidos viejos (migración 0068)', () => {
  it('completa el origen sólo si el nombre está en un único menú', async () => {
    const client = new PGlite();
    await client.waitReady;
    const files = readdirSync(migrationsFolder)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    const backfill = files.find((name) => name.startsWith('0068'));
    for (const file of files) {
      for (const statement of readFileSync(join(migrationsFolder, file), 'utf8')
        .split('--> statement-breakpoint')
        .map((part) => part.trim())
        .filter((part) => part.length > 0 && !/^(--[^\n]*\n?)*$/.test(part))) {
        await client.exec(statement);
      }
    }
    close = () => client.close();
    await client.exec(seed);
    await client.exec(`
      insert into orders (id, public_number, customer_id, sales_cycle_id, weekly_menu_id,
        operating_site_id, status, source, delivery_date, delivery_address_snapshot,
        payment_expectation, total_minor, currency)
      values ('0a000000-0000-4000-8000-000000000001', 'CIP-1', '${CUSTOMER}', '${CYCLE}', '${MENU}',
        '${SITE}', 'CONFIRMED', 'manual', '2126-08-27', 'Calle 1', 'Efectivo', 0, 'ARS');
      insert into order_items (id, order_id, offering_id, product_name_snapshot, variant_snapshot,
        quantity_units, unit_price_minor, total_minor)
      values ('0b000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001',
        '${INTUITIVO}', 'Intuitivo', '250', 1, 0, 0);
      insert into order_item_selections (order_item_id, slot, dish_name_snapshot) values
        ('0b000000-0000-4000-8000-000000000001', 1, 'Lomo con cebolla'),
        ('0b000000-0000-4000-8000-000000000001', 2, 'Wok');
    `);

    // El UPDATE de la migración, otra vez, sobre estos pedidos "viejos".
    const sql = readFileSync(join(migrationsFolder, backfill ?? ''), 'utf8').split(
      '--> statement-breakpoint',
    );
    await client.exec(sql.at(-1) ?? '');

    const { rows } = await client.query<{
      dish: string;
      family: string | null;
      slot: number | null;
    }>(
      `select dish_name_snapshot as dish, source_family_snapshot as family, source_slot as slot
       from order_item_selections order by dish_name_snapshot`,
    );
    expect(rows).toEqual([
      // Está en Keto y en Anti-Age: no se adivina.
      { dish: 'Lomo con cebolla', family: null, slot: null },
      { dish: 'Wok', family: 'Anti-Age', slot: 2 },
    ]);
  });
});
