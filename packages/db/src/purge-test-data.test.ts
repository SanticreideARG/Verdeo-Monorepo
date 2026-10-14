import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from './index.js';
import { purgeTestData } from './purge-test-data.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const NOW = new Date('2026-10-13T12:00:00Z');
const SITE = 'a0000000-0000-4000-8000-000000000009';
const USER = 'b0000000-0000-4000-8000-000000000001';
const VIEJO = 'd0000000-0000-4000-8000-000000000001';
const ACTUAL = 'd0000000-0000-4000-8000-000000000002';
const MENU_VIEJO = 'e0000000-0000-4000-8000-000000000001';
const MENU_ACTUAL = 'e0000000-0000-4000-8000-000000000002';
const FICTICIO = 'c0000000-0000-4000-8000-000000000001';
const VIEJO_CON_PEDIDO = 'c0000000-0000-4000-8000-000000000002';
const NUEVO = 'c0000000-0000-4000-8000-000000000003';
const PEDIDO_VIEJO = '0a000000-0000-4000-8000-000000000001';
const PEDIDO_A = '0a000000-0000-4000-8000-000000000002';
const PEDIDO_B = '0a000000-0000-4000-8000-000000000003';
const RUTA_VIEJA = '0e000000-0000-4000-8000-000000000001';
const COBRO = '0b000000-0000-4000-8000-000000000001';

/*
 * Un período de prueba (septiembre) con su menú, un pedido, su ruta y su cobro rendido, y el
 * período en curso con dos pedidos que siguen la numeración de las pruebas (00118 y 00119).
 * Clientes: uno ficticio de septiembre sin nada en el período en curso, uno de septiembre que sí
 * pidió en el período en curso, y uno cargado hoy.
 */
const seed = `
  insert into users (id, display_name) values ('${USER}', 'Equipo');
  insert into operating_sites (id, slug, display_name, order_prefix)
  values ('${SITE}', 'caba', 'CABA', 'CABA');
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at) values
    ('${VIEJO}', 'Prueba 1', '2026-09-01T12:00:00Z', '2026-09-05T12:00:00Z', '2026-09-06T12:00:00Z'),
    ('${ACTUAL}', 'Octubre 2', '2026-10-12T12:00:00Z', '2026-10-15T12:00:00Z', '2026-10-16T12:00:00Z');
  insert into weekly_menus (id, sales_cycle_id, status) values
    ('${MENU_VIEJO}', '${VIEJO}', 'PUBLISHED'), ('${MENU_ACTUAL}', '${ACTUAL}', 'PUBLISHED');
  insert into customers (id, display_name, created_at) values
    ('${FICTICIO}', 'Paula Castro', '2026-09-01T10:00:00Z'),
    ('${VIEJO_CON_PEDIDO}', 'Ana Real', '2026-09-02T10:00:00Z'),
    ('${NUEVO}', 'Beto Nuevo', '2026-10-13T09:00:00Z');
  insert into customer_identities (customer_id, type, value_display, value_normalized, "primary")
  values ('${FICTICIO}', 'whatsapp', '+5491155550101', '+5491155550101', true);
  insert into orders (id, public_number, customer_id, sales_cycle_id, weekly_menu_id, source,
                      status, delivery_date, delivery_address_snapshot, payment_expectation,
                      total_minor, operating_site_id, created_at) values
    ('${PEDIDO_VIEJO}', 'CABA-00001', '${FICTICIO}', '${VIEJO}', '${MENU_VIEJO}', 'manual',
     'DELIVERED', '2026-09-06', 'Calle 1', 'Efectivo', 100, '${SITE}', '2026-09-02T10:00:00Z'),
    ('${PEDIDO_A}', 'CABA-00118', '${VIEJO_CON_PEDIDO}', '${ACTUAL}', '${MENU_ACTUAL}', 'manual',
     'DRAFT', '2026-10-16', 'Calle 2', 'Efectivo', 100, '${SITE}', '2026-10-12T15:00:00Z'),
    ('${PEDIDO_B}', 'CABA-00119', '${NUEVO}', '${ACTUAL}', '${MENU_ACTUAL}', 'spreadsheet_import',
     'DRAFT', '2026-10-16', 'Calle 3', 'Efectivo', 100, '${SITE}', '2026-10-13T10:00:00Z');
  insert into operating_site_order_counters (operating_site_id, last_order_number)
  values ('${SITE}', 119);
  insert into delivery_routes (id, operating_site_id, delivery_date, status)
  values ('${RUTA_VIEJA}', '${SITE}', '2026-09-06', 'published');
  insert into delivery_stops (route_id, order_id, sequence, status)
  values ('${RUTA_VIEJA}', '${PEDIDO_VIEJO}', 1, 'delivered');
  insert into cash_collections (id, order_id, amount_minor, method, collected_by_user_id)
  values ('${COBRO}', '${PEDIDO_VIEJO}', 100, 'efectivo', '${USER}');
  insert into cash_settlements (collection_id, amount_minor, settled_by_user_id, received_by_user_id)
  values ('${COBRO}', 100, '${USER}', '${USER}');
`;

let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
});

async function base() {
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
  return { client, db: drizzle(client, { schema }) as unknown as Database };
}

const contar = async (client: PGlite, tabla: string) =>
  (await client.query<{ total: number }>(`select count(*)::int as total from ${tabla}`)).rows[0]
    ?.total;

describe('purgeTestData', () => {
  it('en seco dice lo que haría y no cambia nada', async () => {
    const { client, db } = await base();

    const summary = await purgeTestData(db, { dryRun: true, now: NOW });

    expect(summary).toMatchObject({
      customers: ['Paula Castro'],
      cycles: ['Prueba 1'],
      kept: { alias: 'Octubre 2', id: ACTUAL },
      keptOldCustomers: ['Ana Real'],
      menus: 1,
      orders: 1,
      renumbered: [
        { from: 'CABA-00118', to: 'CABA-00001' },
        { from: 'CABA-00119', to: 'CABA-00002' },
      ],
      routes: 1,
    });
    expect(await contar(client, 'orders')).toBe(3);
    expect(await contar(client, 'sales_cycles')).toBe(2);
    expect(await contar(client, 'customers')).toBe(3);
    expect(await contar(client, 'audit_events')).toBe(0);
  });

  it('borra los períodos de prueba con todo lo que cuelga y los clientes ficticios', async () => {
    const { client, db } = await base();

    await purgeTestData(db, { dryRun: false, now: NOW });

    expect(await contar(client, 'sales_cycles')).toBe(1);
    expect(await contar(client, 'weekly_menus')).toBe(1);
    expect(await contar(client, 'delivery_routes')).toBe(0);
    expect(await contar(client, 'cash_collections')).toBe(0);
    const { rows } = await client.query<{ display_name: string }>(
      `select display_name from customers order by display_name`,
    );
    // El de septiembre que pidió en el período en curso se queda.
    expect(rows.map((row) => row.display_name)).toEqual(['Ana Real', 'Beto Nuevo']);
    // Su WhatsApp ya no ocupa el número: se puede volver a cargar.
    expect(await contar(client, 'customer_identities')).toBe(0);
  });

  it('renumera los pedidos que quedan desde 00001 y deja el contador en el último', async () => {
    const { client, db } = await base();

    await purgeTestData(db, { dryRun: false, now: NOW });

    const { rows } = await client.query<{ id: string; public_number: string }>(
      `select id, public_number from orders order by public_number`,
    );
    expect(rows).toEqual([
      { id: PEDIDO_A, public_number: 'CABA-00001' },
      { id: PEDIDO_B, public_number: 'CABA-00002' },
    ]);
    const contador = await client.query<{ last_order_number: number }>(
      `select last_order_number from operating_site_order_counters where operating_site_id = '${SITE}'`,
    );
    expect(contador.rows[0]?.last_order_number).toBe(2);
  });

  it('deja constancia en la auditoría', async () => {
    const { client, db } = await base();
    await purgeTestData(db, { dryRun: false, now: NOW });
    const { rows } = await client.query<{ action: string }>(`select action from audit_events`);
    expect(rows.map((row) => row.action)).toEqual(['maintenance.test_data_purged']);
  });
});
