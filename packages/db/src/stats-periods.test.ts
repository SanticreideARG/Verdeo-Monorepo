import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import { statsEvents } from './repositories/stats-events.js';
import { statsPeriods } from './repositories/stats-periods.js';
import type { Database } from './index.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function seeded(seed: string): Promise<Database> {
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
  return drizzle(client, { schema }) as unknown as Database;
}

const SITE_A = 'a0000000-0000-4000-8000-000000000001';
const SITE_B = 'a0000000-0000-4000-8000-000000000002';
const C = (n: number) => `d0000000-0000-4000-8000-00000000000${String(n)}`;
const M = (n: number) => `e0000000-0000-4000-8000-00000000000${String(n)}`;
const K = (n: number) => `c0000000-0000-4000-8000-00000000000${String(n)}`;
let orderSeq = 0;

/** Un pedido con un ítem; devuelve el SQL y el id. */
function order(input: {
  cancelledToStock?: boolean;
  customer: number;
  cycle: number;
  discount?: number;
  family?: string;
  menu?: number;
  method?: string;
  paid?: boolean;
  site?: string;
  status?: string;
  total: number;
}): { id: string; sql: string } {
  orderSeq += 1;
  const id = `0a000000-0000-4000-8000-${String(orderSeq).padStart(12, '0')}`;
  const discount = input.discount ?? 0;
  return {
    id,
    sql: `
      insert into orders (id, public_number, customer_id, sales_cycle_id, weekly_menu_id, source,
                          status, delivery_date, delivery_address_snapshot, payment_expectation,
                          total_minor, operating_site_id, paid_at, cancelled_to_stock)
      values ('${id}', 'P-${String(orderSeq)}', '${K(input.customer)}', '${C(input.cycle)}',
              '${M(input.menu ?? input.cycle)}', 'manual', '${input.status ?? 'CONFIRMED'}',
              '2026-09-0${String(input.cycle)}', 'Calle', '${input.method ?? 'transferencia'}',
              ${String(input.total)}, '${input.site ?? SITE_A}',
              ${input.paid ? `'2026-09-0${String(input.cycle)}T12:00:00Z'` : 'null'},
              ${input.cancelledToStock ? 'true' : 'false'});
      insert into order_items (order_id, product_name_snapshot, variant_snapshot, quantity_units,
                               unit_price_minor, discount_minor, total_minor)
      values ('${id}', '${input.family ?? 'Keto'}', '400', 1, ${String(input.total + discount)},
              ${String(discount)}, ${String(input.total)});`,
  };
}

const base = `
  insert into operating_sites (id, slug, display_name, order_prefix)
  values ('${SITE_A}', 'cordoba', 'Córdoba', 'COR'), ('${SITE_B}', 'rosario', 'Rosario', 'ROS');
  insert into customers (id, display_name)
  values ('${K(1)}', 'Ana'), ('${K(2)}', 'Beto'), ('${K(3)}', 'Caro'), ('${K(4)}', 'Dani'),
         ('${K(9)}', 'STOCK');
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
  values
    ('${C(1)}', 'Semana 1', '2026-09-01T00:00:00Z', '2026-09-05T00:00:00Z', '2026-09-06T00:00:00Z'),
    ('${C(2)}', 'Semana 2', '2026-09-08T00:00:00Z', '2026-09-12T00:00:00Z', '2026-09-13T00:00:00Z'),
    ('${C(3)}', 'Semana 3', '2026-09-15T00:00:00Z', '2026-09-19T00:00:00Z', '2026-09-20T00:00:00Z'),
    ('${C(4)}', 'Semana 4', '2026-09-22T00:00:00Z', '2026-09-26T00:00:00Z', '2026-09-27T00:00:00Z');
  insert into weekly_menus (id, sales_cycle_id, operating_site_id, status)
  values ('${M(1)}', '${C(1)}', '${SITE_A}', 'PUBLISHED'), ('${M(2)}', '${C(2)}', '${SITE_A}', 'PUBLISHED'),
         ('${M(3)}', '${C(3)}', '${SITE_A}', 'PUBLISHED'), ('${M(4)}', '${C(4)}', '${SITE_A}', 'PUBLISHED'),
         ('${M(5)}', '${C(4)}', '${SITE_B}', 'PUBLISHED');
`;

describe('statsPeriods', () => {
  it('arma una fila por período y ciudad con el mismo criterio que el informe', async () => {
    const orders = [
      order({ customer: 1, cycle: 1, total: 10_000, paid: true, method: 'efectivo' }),
      order({ customer: 1, cycle: 2, total: 20_000, discount: 2_000, paid: true }),
      order({ customer: 2, cycle: 2, total: 30_000 }),
      order({ customer: 3, cycle: 2, total: 7_000, status: 'CANCELLED', cancelledToStock: true }),
      order({ customer: 9, cycle: 2, total: 99_000 }),
      order({ customer: 4, cycle: 4, menu: 5, site: SITE_B, total: 15_000 }),
    ];
    const db = await seeded(base + orders.map((item) => item.sql).join('\n'));

    const result = await statsPeriods(db, {});

    expect(result.rows.map((row) => `${row.cycleAlias} · ${row.operatingSiteName}`)).toEqual([
      'Semana 4 · Rosario',
      'Semana 2 · Córdoba',
      'Semana 1 · Córdoba',
    ]);
    const week2 = result.rows.find((row) => row.cycleAlias === 'Semana 2');
    expect(week2).toMatchObject({
      adjustmentMinor: 0,
      cancelledCount: 1,
      cancelledMinor: 7_000,
      cancelledToStockMinor: 7_000,
      customerCount: 2,
      discountMinor: 2_000,
      grossMinor: 52_000,
      netMinor: 50_000,
      // Ana ya había pedido en la Semana 1: sólo Beto es nuevo.
      newCustomerCount: 1,
      orderCount: 2,
      paidMinor: 20_000,
      pendingMinor: 30_000,
      units: 2,
    });
    expect(week2?.methods).toEqual([
      { isCash: false, method: 'transferencia', paidMinor: 20_000, totalMinor: 50_000 },
    ]);
    expect(result.mix).toContainEqual({ familyName: 'Keto', salesCycleId: C(2), units: 2 });
  });

  it('respeta la ciudad y no vuelve nuevo a un cliente viejo al achicar las fechas', async () => {
    const orders = [
      order({ customer: 1, cycle: 1, total: 10_000 }),
      order({ customer: 1, cycle: 2, total: 10_000 }),
      order({ customer: 4, cycle: 4, menu: 5, site: SITE_B, total: 15_000 }),
    ];
    const db = await seeded(base + orders.map((item) => item.sql).join('\n'));

    const narrowed = await statsPeriods(db, { from: '2026-09-02' });
    expect(narrowed.rows.find((row) => row.cycleAlias === 'Semana 2')?.newCustomerCount).toBe(0);

    const onlyA = await statsPeriods(db, { operatingSiteId: SITE_A });
    expect(onlyA.rows.every((row) => row.operatingSiteName === 'Córdoba')).toBe(true);
  });
});

describe('statsEvents', () => {
  it('avisa récord, clientes de siempre que faltan, ciudad nueva y cancelado cocinado', async () => {
    const cancelled = order({ customer: 3, cycle: 4, total: 7_000, status: 'CANCELLED' });
    const orders = [
      order({ customer: 1, cycle: 1, total: 10_000 }),
      order({ customer: 1, cycle: 2, total: 10_000 }),
      order({ customer: 1, cycle: 3, total: 10_000 }),
      order({ customer: 2, cycle: 4, total: 10_000 }),
      order({ customer: 3, cycle: 4, total: 10_000 }),
      order({ customer: 4, cycle: 4, menu: 5, site: SITE_B, total: 10_000 }),
      cancelled,
    ];
    const sheet = `
      insert into kitchen_sheets (sales_cycle_id, operating_site_id, format, orders, report)
      values ('${C(4)}', '${SITE_A}', 'xlsx',
              '[{"orderId":"${cancelled.id}","customerName":"Caro","lines":[],"publicNumber":"P"}]',
              '{}');`;
    const db = await seeded(base + orders.map((item) => item.sql).join('\n') + sheet);

    const events = await statsEvents(db, { now: new Date('2026-09-24T12:00:00Z') });
    const kinds = events.map((event) => event.kind);

    expect(kinds).toContain('record');
    expect(events.find((event) => event.kind === 'record')?.text).toBe(
      'Semana 4 ya es el período con más pedidos: 3.',
    );
    expect(events.find((event) => event.kind === 'ausentes')?.text).toContain('Ana');
    expect(events.find((event) => event.kind === 'cocina')).toMatchObject({
      href: `/app/pedidos/${cancelled.id}`,
      tone: 'danger',
    });
    expect(events.some((event) => event.text === 'Primer período con pedidos en Rosario.')).toBe(
      true,
    );
    // Lo que hay que revisar va primero.
    expect(events[0]?.tone).toBe('danger');
    // Lejos del cierre, lo que falta cobrar todavía no es un evento.
    expect(kinds).not.toContain('cobro');
  });

  it('avisa lo que falta cobrar cuando el cierre está cerca', async () => {
    const orders = [
      order({ customer: 1, cycle: 4, total: 10_000 }),
      order({ customer: 2, cycle: 4, total: 10_000, method: 'efectivo' }),
    ];
    const db = await seeded(base + orders.map((item) => item.sql).join('\n'));

    const events = await statsEvents(db, { now: new Date('2026-09-26T12:00:00Z') });

    expect(events.find((event) => event.kind === 'cobro')?.text).toBe(
      '1 pedido de Semana 4 sin efectivo sigue sin cobrar a días del cierre.',
    );
  });
});
