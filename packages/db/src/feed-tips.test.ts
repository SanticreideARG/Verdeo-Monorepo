import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from './index.js';
import { feedTips } from './repositories/feed-tips.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const NOW = new Date('2026-10-14T12:00:00Z');
const SITE = 'a0000000-0000-4000-8000-000000000001';
const C = (n: number) => `d0000000-0000-4000-8000-00000000000${String(n)}`;
const M = (n: number) => `e0000000-0000-4000-8000-00000000000${String(n)}`;
const ANA = 'c0000000-0000-4000-8000-000000000001';
const BETO = 'c0000000-0000-4000-8000-000000000002';
const CARLA = 'c0000000-0000-4000-8000-000000000003';
const ADDRESS = 'f0000000-0000-4000-8000-000000000001';

let orderNumber = 0;
function order(customer: string, cycle: number, created: string, address = 'null') {
  orderNumber += 1;
  return `('0a000000-0000-4000-8000-${String(orderNumber).padStart(12, '0')}', 'CABA-${String(orderNumber).padStart(5, '0')}',
    '${customer}', '${C(cycle)}', '${M(cycle)}', 'manual', 'CONFIRMED', '2026-10-16', '-', '-', 0,
    '${SITE}', '${created}', ${address === 'null' ? 'null' : `'${address}'`})`;
}

/*
 * Cuatro períodos semanales; el cuarto es el en curso (abrió el 12). Ana y Beto pidieron en los
 * tres anteriores; Ana ya pidió en éste, Beto no. Carla pidió sólo en dos. El pedido de Ana usa un
 * domicilio sin barrio ni ubicación.
 */
function seed() {
  orderNumber = 0;
  const cycles = [
    [1, '2026-09-21'],
    [2, '2026-09-28'],
    [3, '2026-10-05'],
    [4, '2026-10-12'],
  ] as const;
  return `
  insert into operating_sites (id, slug, display_name, order_prefix) values ('${SITE}', 'caba', 'CABA', 'CABA');
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at) values
    ${cycles
      .map(
        ([n, day]) =>
          `('${C(n)}', 'Semana ${String(n)}', '${day}T12:00:00Z', '${day}T20:00:00Z', '${day}T12:00:00Z'::timestamptz + interval '6 days')`,
      )
      .join(',\n')};
  insert into weekly_menus (id, sales_cycle_id, status) values
    ${cycles.map(([n]) => `('${M(n)}', '${C(n)}', 'PUBLISHED')`).join(', ')};
  insert into customers (id, display_name) values
    ('${ANA}', 'Ana'), ('${BETO}', 'Beto'), ('${CARLA}', 'Carla');
  insert into geographic_zones (id, operating_site_id, slug, display_name)
    values ('a1000000-0000-4000-8000-000000000001', '${SITE}', 'centro', 'Centro');
  insert into customer_addresses (id, customer_id, label, written_address, geographic_zone_id)
    values ('${ADDRESS}', '${ANA}', 'Casa', 'Calle 1', 'a1000000-0000-4000-8000-000000000001');
  insert into orders (id, public_number, customer_id, sales_cycle_id, weekly_menu_id, source, status,
                      delivery_date, delivery_address_snapshot, payment_expectation, total_minor,
                      operating_site_id, created_at, delivery_address_id) values
    ${[
      order(ANA, 1, '2026-09-22T10:00:00Z'),
      order(ANA, 2, '2026-09-29T10:00:00Z'),
      order(ANA, 3, '2026-10-06T10:00:00Z'),
      order(BETO, 1, '2026-09-22T10:00:00Z'),
      order(BETO, 2, '2026-09-29T10:00:00Z'),
      order(BETO, 3, '2026-10-06T10:00:00Z'),
      order(BETO, 3, '2026-10-09T10:00:00Z'),
      order(CARLA, 2, '2026-09-29T10:00:00Z'),
      order(CARLA, 3, '2026-10-06T10:00:00Z'),
      order(ANA, 4, '2026-10-13T10:00:00Z', ADDRESS),
    ].join(',\n')};
  insert into order_items (order_id, product_name_snapshot, variant_snapshot, quantity_units,
                           unit_price_minor, total_minor)
    select id, 'KETO', '400', 3, 0, 0 from orders where sales_cycle_id = '${C(4)}';
`;
}

let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
});

async function database() {
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
  await client.exec(seed());
  return drizzle(client, { schema }) as unknown as Database;
}

describe('feedTips', () => {
  it('arma cada consejo con los datos del período en curso', async () => {
    const db = await database();

    const tips = await feedTips(db, {
      now: NOW,
      permissions: ['customers.read', 'orders.read', 'production.read', 'stats.read'],
    });

    expect(tips.map((tip) => tip.key)).toEqual([
      'tip:habituales:1',
      'tip:sin-ubicacion:1',
      'tip:sin-barrio:1',
      'tip:mas-pedido:KETO:400',
      // Uno en éste; en el anterior, a la misma altura (dos días), ya había tres.
      'tip:ritmo:1:3',
    ]);
    expect(tips[0]?.text).toContain('Beto');
    expect(tips[4]?.text).toBe(
      'Van 1 pedido en este período, 2 menos que el anterior a esta altura.',
    );
  });

  it('sin permiso de ventas no hay consejo de ventas; sin permisos, nada', async () => {
    const db = await database();

    const tips = await feedTips(db, { now: NOW, permissions: ['orders.read'] });
    expect(tips.map((tip) => tip.key)).toEqual(['tip:sin-ubicacion:1']);
    expect(await feedTips(db, { now: NOW, permissions: [] })).toEqual([]);
  });
});
