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
const FAMILY = 'f0000000-0000-4000-8000-000000000001';
const SIZE = 'f1000000-0000-4000-8000-000000000001';
const VARIANT = 'f2000000-0000-4000-8000-000000000001';
const OFFERING = 'f3000000-0000-4000-8000-000000000001';

/*
 * Un Intuitivo de cinco platos a $25.000, es decir $5.000 el plato. Los números están elegidos para
 * que las cuentas del test se puedan verificar de cabeza.
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

  insert into product_families (id, code, display_name, kind)
  values ('${FAMILY}', 'intuitivo', 'Intuitivo', 'COMPOSABLE');
  insert into product_sizes (id, code, display_name, meals_per_unit)
  values ('${SIZE}', '250', '250', 5);
  insert into product_variants (id, product_family_id, product_size_id, code, display_name)
  values ('${VARIANT}', '${FAMILY}', '${SIZE}', 'intuitivo-250', '250');
  insert into weekly_menu_prices (weekly_menu_id, product_size_id, unit_price_minor)
  values ('${MENU}', '${SIZE}', 2500000);
  insert into weekly_menu_offerings (id, weekly_menu_id, product_variant_id)
  values ('${OFFERING}', '${MENU}', '${VARIANT}');
  insert into weekly_menu_items (offering_id, slot, dish_name)
  values
    ('${OFFERING}', 1, 'Plato A'), ('${OFFERING}', 2, 'Plato B'), ('${OFFERING}', 3, 'Plato C'),
    ('${OFFERING}', 4, 'Plato D'), ('${OFFERING}', 5, 'Plato E');

  -- El universo elegible del Intuitivo son todos los platos publicados esta semana para el mismo
  -- tamaño, repartidos entre las variedades: una variedad sola no puede publicar más de cinco
  -- (weekly_menu_items_slot_check), que es la definición del menú y no el tope del pedido.
  insert into product_families (id, code, display_name, kind)
  values ('f0000000-0000-4000-8000-000000000002', 'keto', 'Keto', 'FIXED');
  insert into product_variants (id, product_family_id, product_size_id, code, display_name)
  values ('f2000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002',
          '${SIZE}', 'keto-250', '250');
  insert into weekly_menu_offerings (id, weekly_menu_id, product_variant_id)
  values ('f3000000-0000-4000-8000-000000000002', '${MENU}', 'f2000000-0000-4000-8000-000000000002');
  insert into weekly_menu_items (offering_id, slot, dish_name)
  values
    ('f3000000-0000-4000-8000-000000000002', 1, 'Plato F'),
    ('f3000000-0000-4000-8000-000000000002', 2, 'Plato G');
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

async function crear(
  operations: PostgresOperationsService,
  selectedDishNames: string[],
): Promise<{ totalMinor: number }> {
  const order = await operations.createOrder(
    {
      customerId: CUSTOMER,
      deliveryAddress: 'Calle 1',
      deliveryDate: '2126-08-27',
      dietaryInstructions: [],
      items: [{ offeringId: OFFERING, quantityUnits: 1, selectedDishNames }],
      menuId: MENU,
      operatingSiteId: SITE,
      paymentExpectation: 'Efectivo',
      source: 'manual',
    },
    CONTEXT,
  );
  return order;
}

const CINCO = ['Plato A', 'Plato B', 'Plato C', 'Plato D', 'Plato E'];

describe('precio del Intuitivo con más platos', () => {
  /*
   * El caso que no se puede romper: con la cantidad estándar el precio es el del menú, intacto.
   * Si la regla tocara esto, el menú cobraría distinto de lo que muestra.
   */
  it('cobra el precio del menú con los cinco platos', async () => {
    const { operations } = await sembrada();

    expect((await crear(operations, CINCO)).totalMinor).toBe(2_500_000);
  });

  it('propone la parte proporcional con un plato de más', async () => {
    const { operations } = await sembrada();

    // 6 × $5.000 = $30.000.
    expect((await crear(operations, [...CINCO, 'Plato F'])).totalMinor).toBe(3_000_000);
  });

  it('aplica el coeficiente configurado de la ciudad', async () => {
    const { client, operations } = await sembrada();
    await client.exec(
      `insert into menu_catalog_settings (operating_site_id, intuitivo_pricing_mode,
                                          intuitivo_pricing_factor_bp)
       values ('${SITE}', 'coeficiente', 9000);`,
    );

    // 6 × $5.000 × 0,90 = $27.000.
    expect((await crear(operations, [...CINCO, 'Plato F'])).totalMinor).toBe(2_700_000);
  });

  it('cobra un monto fijo por plato extra cuando así se configuró', async () => {
    const { client, operations } = await sembrada();
    await client.exec(
      `insert into menu_catalog_settings (operating_site_id, intuitivo_pricing_mode,
                                          intuitivo_extra_dish_minor)
       values ('${SITE}', 'monto_fijo', 400000);`,
    );

    // $25.000 + 2 × $4.000 = $33.000.
    expect((await crear(operations, [...CINCO, 'Plato F', 'Plato G'])).totalMinor).toBe(3_300_000);
  });

  // Dos porciones del mismo plato son dos porciones: se cobran como dos.
  it('deja repetir un plato y lo cobra', async () => {
    const { operations } = await sembrada();

    expect((await crear(operations, [...CINCO, 'Plato A'])).totalMinor).toBe(3_000_000);
  });

  /*
   * El máximo existe porque nada distingue un pedido familiar de un cero de más: quince platos es
   * un pedido grande, cincuenta es un error de tipeo que llega a cocina.
   */
  it('rechaza más platos que el máximo de la ciudad', async () => {
    const { client, operations } = await sembrada();
    await client.exec(
      `insert into menu_catalog_settings (operating_site_id, intuitivo_max_dishes)
       values ('${SITE}', 6);`,
    );

    await expect(crear(operations, [...CINCO, 'Plato F', 'Plato G'])).rejects.toThrow(/at most 6/);
  });

  it('rechaza menos platos que el estándar del tamaño', async () => {
    const { operations } = await sembrada();

    await expect(crear(operations, ['Plato A', 'Plato B'])).rejects.toThrow(/at least 5/);
  });
});
