import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(here, '..', 'migrations');
const script = readFileSync(join(here, '..', 'scripts', 'convert-stock-customer.sql'), 'utf8');

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
  -- Ya había stock cargado desde Cocina: se suma.
  insert into production_stock (sales_cycle_id, family_name, variant_name, quantity_units)
  values ('${ACTUAL}', 'VEGGIE', '300', 4);
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

describe('convert-stock-customer.sql', () => {
  it('pasa los pedidos del STOCK del período en curso a stock y archiva el cliente', async () => {
    const client = await base();

    await client.exec(script);

    const stock = await client.query<{ f: string; q: number; v: string }>(
      `select family_name f, variant_name v, quantity_units q from production_stock
       where sales_cycle_id = '${ACTUAL}' order by f`,
    );
    // KETO 400: 3 + 1 (el cancelado no cuenta); VEGGIE 300: 2 + los 4 que ya había.
    expect(stock.rows).toEqual([
      { f: 'KETO', q: 4, v: '400' },
      { f: 'VEGGIE', q: 6, v: '300' },
    ]);

    const orders = await client.query<{ public_number: string }>(
      `select public_number from orders order by public_number`,
    );
    // Se van los dos del período en curso; quedan el cancelado, el del período anterior y Ana.
    expect(orders.rows.map((row) => row.public_number)).toEqual([
      'CABA-00001',
      'CABA-00004',
      'CABA-00005',
    ]);

    const customers = await client.query<{ display_name: string; status: string }>(
      `select display_name, status from customers order by display_name`,
    );
    expect(customers.rows).toEqual([
      { display_name: ' Stock ', status: 'archived' },
      { display_name: 'Ana', status: 'active' },
    ]);

    const audit = await client.query<{ action: string }>(`select action from audit_events`);
    expect(audit.rows).toEqual([{ action: 'production.stock_customer_converted' }]);
  });
});
