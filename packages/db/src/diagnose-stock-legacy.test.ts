import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(here, '..', 'migrations');
const script = readFileSync(join(here, '..', 'scripts', 'diagnose-stock-legacy.sql'), 'utf8');

const SITE = 'a0000000-0000-4000-8000-000000000009';
const VIEJO = 'd0000000-0000-4000-8000-000000000001';
const ACTUAL = 'd0000000-0000-4000-8000-000000000002';
const MENU_VIEJO = 'e0000000-0000-4000-8000-000000000001';
const MENU_ACTUAL = 'e0000000-0000-4000-8000-000000000002';
const STOCK = 'c0000000-0000-4000-8000-000000000001';
const ANA = 'c0000000-0000-4000-8000-000000000002';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();

/*
 * El script usa now(): los períodos se arman alrededor de hoy. El período en curso tiene dos
 * pedidos del cliente STOCK (uno cancelado) y uno de Ana; el anterior, uno del STOCK que no se toca.
 */
const seed = `
  insert into operating_sites (id, slug, display_name, order_prefix)
  values ('${SITE}', 'caba', 'CABA', 'CABA');
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at) values
    ('${VIEJO}', 'Anterior', '${day(-20)}', '${day(-17)}', '${day(-15)}'),
    ('${ACTUAL}', 'En curso', '${day(-2)}', '${day(1)}', '${day(3)}');
  insert into weekly_menus (id, sales_cycle_id, status) values
    ('${MENU_VIEJO}', '${VIEJO}', 'PUBLISHED'), ('${MENU_ACTUAL}', '${ACTUAL}', 'PUBLISHED');
  insert into customers (id, display_name) values ('${STOCK}', ' Stock '), ('${ANA}', 'Ana');
  insert into orders (id, public_number, customer_id, sales_cycle_id, weekly_menu_id, source,
                      status, delivery_date, delivery_address_snapshot, payment_expectation,
                      total_minor, operating_site_id) values
    ('0a000000-0000-4000-8000-000000000001', 'CABA-00001', '${STOCK}', '${VIEJO}', '${MENU_VIEJO}',
     'manual', 'DELIVERED', '2026-09-06', '-', '-', 0, '${SITE}'),
    ('0a000000-0000-4000-8000-000000000002', 'CABA-00002', '${STOCK}', '${ACTUAL}', '${MENU_ACTUAL}',
     'manual', 'CONFIRMED', '2026-10-16', '-', '-', 0, '${SITE}'),
    ('0a000000-0000-4000-8000-000000000003', 'CABA-00003', '${STOCK}', '${ACTUAL}', '${MENU_ACTUAL}',
     'manual', 'DRAFT', '2026-10-16', '-', '-', 0, '${SITE}'),
    ('0a000000-0000-4000-8000-000000000004', 'CABA-00004', '${STOCK}', '${ACTUAL}', '${MENU_ACTUAL}',
     'manual', 'CANCELLED', '2026-10-16', '-', '-', 0, '${SITE}'),
    ('0a000000-0000-4000-8000-000000000005', 'CABA-00005', '${ANA}', '${ACTUAL}', '${MENU_ACTUAL}',
     'manual', 'CONFIRMED', '2026-10-16', '-', '-', 0, '${SITE}');
  insert into order_items (order_id, product_name_snapshot, variant_snapshot, quantity_units,
                           unit_price_minor, total_minor) values
    ('0a000000-0000-4000-8000-000000000001', 'KETO', '400', 9, 0, 0),
    ('0a000000-0000-4000-8000-000000000002', 'KETO', '400', 3, 0, 0),
    ('0a000000-0000-4000-8000-000000000002', 'VEGGIE', '300', 2, 0, 0),
    ('0a000000-0000-4000-8000-000000000003', 'KETO', '400', 1, 0, 0),
    ('0a000000-0000-4000-8000-000000000004', 'KETO', '400', 5, 0, 0),
    ('0a000000-0000-4000-8000-000000000005', 'KETO', '400', 1, 0, 0);
  -- Lo que se cargó desde Cocina, una baja y un lote de un período anterior con una vianda vendida.
  insert into production_stock (sales_cycle_id, operating_site_id, family_name, variant_name,
                                quantity_units)
  values ('${ACTUAL}', '${SITE}', 'VEGGIE', '300', 4);
  insert into surplus_writeoffs (sales_cycle_id, operating_site_id, family_name, variant_name, quantity_units, reason)
  values ('${ACTUAL}', '${SITE}', 'VEGGIE', '300', 1, 'Vencimiento');
  insert into stock_lots (id, operating_site_id, sales_cycle_id, family_name, variant_name, quantity_units, expires_at)
  values ('1b000000-0000-4000-8000-000000000001', '${SITE}', '${VIEJO}', 'KETO', '400', 3, '${day(10)}');
  update order_items set stock_lot_id = '1b000000-0000-4000-8000-000000000001'
  where order_id = '0a000000-0000-4000-8000-000000000005';
`;

let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
});

async function base() {
  const client = new PGlite();
  await client.waitReady;
  close = () => client.close();
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
  return client;
}

describe('diagnose-stock-legacy.sql', () => {
  /*
   * El diagnóstico del stock viejo (STOCK_COMO_PEDIDO_PLAN.md, sección 9) lo corre el equipo en
   * Neon: tiene que andar contra el esquema real y no cambiar nada.
   */
  it('cuenta cada forma de stock y no escribe nada', async () => {
    const client = await base();
    const before = await client.query<{ n: number }>('select count(*)::int n from orders');

    const results = await client.exec(script);

    const summary = results.find((result) => result.fields.some((field) => field.name === 'origen'))
      ?.rows as { origen: string; registros: number; viandas: number | null }[];
    const row = (prefix: string) => summary.find((entry) => entry.origen.startsWith(prefix));
    // Pedidos del STOCK no cancelados: CABA-00001, 00002 y 00003; 9 + 3 + 2 + 1 viandas.
    expect(row('1.')).toMatchObject({ registros: 3, viandas: 15 });
    expect(row('2.')).toMatchObject({ registros: 1, viandas: 4 });
    expect(row('3.')).toMatchObject({ registros: 1, viandas: 1 });
    // El lote: 3 cargadas, 1 vendida (el pedido de Ana), 2 disponibles sin vencer.
    expect(row('4b.')).toMatchObject({ viandas: 1 });
    expect(row('4c.')).toMatchObject({ registros: 1, viandas: 2 });

    const live = results.find((result) => result.fields.some((field) => field.name === 'pedido'));
    expect((live?.rows as { pedido: string }[]).map((entry) => entry.pedido)).toEqual([
      'CABA-00002',
      'CABA-00003',
    ]);

    const after = await client.query<{ n: number }>('select count(*)::int n from orders');
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n);
  });
});
