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
const OLD_CYCLE = 'd0000000-0000-4000-8000-000000000001';
const NEW_CYCLE = 'd0000000-0000-4000-8000-000000000002';
const OLD_MENU = 'e0000000-0000-4000-8000-000000000001';
const NEW_MENU = 'e0000000-0000-4000-8000-000000000002';
const FAMILY = 'f0000000-0000-4000-8000-000000000001';
const SIZE = 'f1000000-0000-4000-8000-000000000001';
const VARIANT = 'f2000000-0000-4000-8000-000000000001';
const OLD_OFFERING = 'f3000000-0000-4000-8000-000000000001';
const NEW_OFFERING = 'f3000000-0000-4000-8000-000000000002';

/*
 * Dos períodos abiertos a la vez, con la misma variedad: $20.000 en el anterior y $25.000 en el
 * actual, para ver que el pedido toma el precio del período al que pasa.
 */
const seed = `
  insert into operating_sites (id, slug, display_name, order_prefix)
  values ('${SITE}', 'cipolletti', 'Cipolletti', 'CIP');
  insert into customers (id, display_name) values ('${CUSTOMER}', 'María Pérez');
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
  values
    ('${OLD_CYCLE}', 'Semana 1', '2126-01-01T12:00:00Z', '2126-01-06T23:00:00Z',
     '2126-01-07T22:00:00Z'),
    ('${NEW_CYCLE}', 'Semana 2', '2126-01-08T12:00:00Z', '2126-01-13T23:00:00Z',
     '2126-01-14T22:00:00Z');
  insert into weekly_menus (id, sales_cycle_id, status)
  values ('${OLD_MENU}', '${OLD_CYCLE}', 'PUBLISHED'), ('${NEW_MENU}', '${NEW_CYCLE}', 'PUBLISHED');

  insert into product_families (id, code, display_name, kind)
  values ('${FAMILY}', 'keto', 'Keto', 'FIXED'),
         ('f0000000-0000-4000-8000-000000000002', 'intuitivo', 'Intuitivo', 'COMPOSABLE');
  insert into product_sizes (id, code, display_name, meals_per_unit)
  values ('${SIZE}', '250', '250', 5);
  insert into product_variants (id, product_family_id, product_size_id, code, display_name)
  values ('${VARIANT}', '${FAMILY}', '${SIZE}', 'keto-250', '250');
  insert into weekly_menu_prices (weekly_menu_id, product_size_id, unit_price_minor)
  values ('${OLD_MENU}', '${SIZE}', 2000000), ('${NEW_MENU}', '${SIZE}', 2500000);
  insert into weekly_menu_offerings (id, weekly_menu_id, product_variant_id)
  values ('${OLD_OFFERING}', '${OLD_MENU}', '${VARIANT}'),
         ('${NEW_OFFERING}', '${NEW_MENU}', '${VARIANT}');
  insert into weekly_menu_items (offering_id, slot, dish_name)
  values
    ('${OLD_OFFERING}', 1, 'Plato A'), ('${OLD_OFFERING}', 2, 'Plato B'),
    ('${OLD_OFFERING}', 3, 'Plato C'), ('${OLD_OFFERING}', 4, 'Plato D'),
    ('${OLD_OFFERING}', 5, 'Plato E'),
    ('${NEW_OFFERING}', 1, 'Plato F'), ('${NEW_OFFERING}', 2, 'Plato G'),
    ('${NEW_OFFERING}', 3, 'Plato H'), ('${NEW_OFFERING}', 4, 'Plato I'),
    ('${NEW_OFFERING}', 5, 'Plato J');
`;

const CONTEXT = { correlationId: 'test', requestId: 'test', source: 'test' };

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function sembrada(): Promise<{ client: PGlite; operations: PostgresOperationsService }> {
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
  return {
    client,
    operations: new PostgresOperationsService(
      drizzle(client, { schema }) as unknown as Database,
      {
        key: 'test',
        resolve: () => Promise.resolve({ candidates: [], status: 'NO_MATCH' }),
      } as never,
    ),
  };
}

async function pedidoEn(
  operations: PostgresOperationsService,
  menuId: string,
  offeringId: string,
  deliveryDate: string,
) {
  return operations.createOrder(
    {
      customerId: CUSTOMER,
      deliveryAddress: 'Calle 1',
      deliveryDate,
      dietaryInstructions: [],
      items: [{ offeringId, quantityUnits: 1 }],
      menuId,
      operatingSiteId: SITE,
      paymentExpectation: 'Efectivo',
      source: 'manual',
    },
    CONTEXT,
  );
}

async function periodoDe(client: PGlite, orderId: string) {
  const result = await client.query<{ menu: string; cycle: string; total: number }>(
    `select weekly_menu_id as menu, sales_cycle_id as cycle, total_minor::int as total
       from orders where id = $1`,
    [orderId],
  );
  return result.rows[0];
}

describe('mover un pedido al período anterior', () => {
  it('lo pasa al período anterior con su menú y su precio', async () => {
    const { client, operations } = await sembrada();
    const order = await pedidoEn(operations, NEW_MENU, NEW_OFFERING, '2126-01-15');

    const moved = await operations.moveOrderToPreviousPeriod(order.id, CONTEXT);

    expect(moved).toMatchObject({ closed: false, cycleAlias: 'Semana 1', totalMinor: 2_000_000 });
    expect(await periodoDe(client, order.id)).toEqual({
      cycle: OLD_CYCLE,
      menu: OLD_MENU,
      total: 2_000_000,
    });
  });

  it('la vista previa no guarda nada', async () => {
    const { client, operations } = await sembrada();
    const order = await pedidoEn(operations, NEW_MENU, NEW_OFFERING, '2126-01-15');

    const preview = await operations.moveOrderToPreviousPeriod(order.id, CONTEXT, true);

    expect(preview).toMatchObject({ closed: false, cycleAlias: 'Semana 1' });
    expect((await periodoDe(client, order.id))?.cycle).toBe(NEW_CYCLE);
  });

  it('con el anterior cerrado, la vista previa lo avisa y mover se niega', async () => {
    const { client, operations } = await sembrada();
    const order = await pedidoEn(operations, NEW_MENU, NEW_OFFERING, '2126-01-15');
    await client.exec(`update sales_cycles set status = 'CLOSED' where id = '${OLD_CYCLE}'`);

    expect(await operations.moveOrderToPreviousPeriod(order.id, CONTEXT, true)).toEqual({
      closed: true,
      cycleAlias: 'Semana 1',
      cycleId: OLD_CYCLE,
    });
    await expect(operations.moveOrderToPreviousPeriod(order.id, CONTEXT)).rejects.toThrow(
      /cerrado/,
    );
    expect((await periodoDe(client, order.id))?.cycle).toBe(NEW_CYCLE);
  });

  // Un pedido que se lleva lo último de un stock (2026-11-24): su propia vianda no cuenta.
  it('mueve un pedido que se lleva lo último de un stock', async () => {
    const { client, operations } = await sembrada();
    const LOT = 'f4000000-0000-4000-8000-000000000001';
    await client.exec(
      `insert into stock_lots (id, operating_site_id, sales_cycle_id, family_name, variant_name,
                               quantity_units, expires_at)
       values ('${LOT}', '${SITE}', '${OLD_CYCLE}', 'Keto', '250', 1, '2126-12-31T00:00:00Z');`,
    );
    const order = await operations.createOrder(
      {
        customerId: CUSTOMER,
        deliveryAddress: 'Calle 1',
        deliveryDate: '2126-01-15',
        dietaryInstructions: [],
        items: [{ offeringId: NEW_OFFERING, quantityUnits: 1, stockLotId: LOT }],
        menuId: NEW_MENU,
        operatingSiteId: SITE,
        paymentExpectation: 'Efectivo',
        source: 'manual',
      },
      CONTEXT,
    );

    await expect(operations.moveOrderToPreviousPeriod(order.id, CONTEXT)).resolves.toMatchObject({
      closed: false,
    });
    const lot = await client.query<{ lot: string | null }>(
      `select stock_lot_id as lot from order_items where order_id = $1`,
      [order.id],
    );
    expect(lot.rows[0]?.lot).toBe(LOT);
  });

  it('no mueve más atrás del primer período', async () => {
    const { operations } = await sembrada();
    const order = await pedidoEn(operations, OLD_MENU, OLD_OFFERING, '2126-01-08');

    await expect(operations.moveOrderToPreviousPeriod(order.id, CONTEXT)).rejects.toThrow(
      /No hay un período anterior/,
    );
  });
});
