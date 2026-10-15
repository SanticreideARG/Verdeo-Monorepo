import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NearestNeighborRouteOptimizer } from '@verdeo/routing';

import type { Database } from './index.js';
import {
  PostgresDeliveryService,
  splitByProximity,
} from './repositories/postgres-delivery-service.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const SITE = 'a0000000-0000-4000-8000-000000000009';
const NORTE = '0d000000-0000-4000-8000-000000000001';
const SUR = '0d000000-0000-4000-8000-000000000002';
const CYCLE = 'd0000000-0000-4000-8000-000000000001';
const MENU = 'e0000000-0000-4000-8000-000000000001';
const RUN = '0f000000-0000-4000-8000-000000000001';
const CUSTOMER = 'c0000000-0000-4000-8000-000000000001';

// Cuatro pedidos confirmados con ubicación (dos en el norte, en Núñez; dos en el sur, en
// Barracas), uno en borrador y uno confirmado sin ubicación.
const pedidos = [
  { id: 1, zona: NORTE, barrio: 'nunez', lat: -34.54, lng: -58.46, status: 'CONFIRMED' },
  { id: 2, zona: NORTE, barrio: 'nunez', lat: -34.545, lng: -58.465, status: 'CONFIRMED' },
  { id: 3, zona: SUR, barrio: 'barracas', lat: -34.645, lng: -58.38, status: 'CONFIRMED' },
  { id: 4, zona: SUR, barrio: 'barracas', lat: -34.65, lng: -58.385, status: 'READY' },
  { id: 5, zona: SUR, barrio: 'barracas', lat: -34.651, lng: -58.386, status: 'DRAFT' },
  { id: 6, zona: SUR, barrio: null, lat: null, lng: null, status: 'CONFIRMED' },
] as const;

const seed = `
  insert into operating_sites (id, slug, display_name, order_prefix, origin_latitude, origin_longitude)
  values ('${SITE}', 'caba', 'CABA', 'CABA', -34.6037, -58.3816);
  insert into geographic_zones (id, operating_site_id, slug, display_name) values
    ('${NORTE}', '${SITE}', 'norte', 'Norte'), ('${SUR}', '${SITE}', 'sur', 'Sur');
  insert into neighborhoods (id, geographic_zone_id, display_name, name_key) values
    ('1b000000-0000-4000-8000-000000000001', '${NORTE}', 'Núñez', 'nunez'),
    ('1b000000-0000-4000-8000-000000000002', '${SUR}', 'Barracas', 'barracas');
  insert into customers (id, display_name) values ('${CUSTOMER}', 'Ana Prueba');
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
  values ('${CYCLE}', 'Octubre 3', '2026-10-12T12:00:00Z', '2026-10-17T12:00:00Z', '2026-10-19T02:15:00Z');
  insert into weekly_menus (id, sales_cycle_id, status) values ('${MENU}', '${CYCLE}', 'PUBLISHED');
  insert into delivery_runs (id, operating_site_id, delivery_date, label)
  values ('${RUN}', '${SITE}', '2026-10-18', 'Domingo 18');
  ${pedidos
    .map(
      (pedido) => `
    insert into customer_addresses (id, customer_id, label, written_address, geographic_zone_id,
      neighborhood_id, latitude, longitude)
    values ('0c000000-0000-4000-8000-00000000000${String(pedido.id)}', '${CUSTOMER}', 'Casa',
      'Calle ${String(pedido.id)}', '${pedido.zona}',
      ${pedido.barrio ? `(select id from neighborhoods where name_key = '${pedido.barrio}')` : 'null'},
      ${pedido.lat === null ? 'null' : String(pedido.lat)}, ${pedido.lng === null ? 'null' : String(pedido.lng)});
    insert into orders (id, public_number, customer_id, sales_cycle_id, weekly_menu_id, source, status,
      delivery_date, delivery_address_snapshot, delivery_address_id, payment_expectation, total_minor,
      operating_site_id, geographic_zone_id, delivery_run_id)
    values ('0a000000-0000-4000-8000-00000000000${String(pedido.id)}', 'CABA-0000${String(pedido.id)}',
      '${CUSTOMER}', '${CYCLE}', '${MENU}', 'manual', '${pedido.status}', '2026-10-18',
      'Calle ${String(pedido.id)}', '0c000000-0000-4000-8000-00000000000${String(pedido.id)}',
      'Efectivo', 100, '${SITE}', '${pedido.zona}', '${RUN}');`,
    )
    .join('\n')}
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
  const db = drizzle(client, { schema }) as unknown as Database;
  return {
    client,
    service: new PostgresDeliveryService(db, new NearestNeighborRouteOptimizer(), {
      sendToCustomer: vi.fn(() => Promise.resolve({ sent: true })),
    }),
  };
}

const contexto = { correlationId: 'c', requestId: 'r', source: 'test' };

describe('rutas desde un reparto', () => {
  it('una hoja con todo lo ruteable, y dice lo que quedó afuera', async () => {
    const { service } = await base();
    const result = await service.createRoutesFromRun(RUN, { mode: 'single' }, contexto);
    expect(result.routes).toEqual([expect.objectContaining({ label: 'Domingo 18', stops: 4 })]);
    expect(result.skipped).toEqual({ alreadyRouted: 0, drafts: 1, unlocated: 1 });
  });

  it('una hoja por zona', async () => {
    const { service } = await base();
    const result = await service.createRoutesFromRun(RUN, { mode: 'by_zone' }, contexto);
    expect(result.routes.map((route) => [route.label, route.stops]).sort()).toEqual([
      ['Domingo 18 · Norte', 2],
      ['Domingo 18 · Sur', 2],
    ]);
  });

  it('en dos hojas sin partir los barrios, y lo ya armado no se repite', async () => {
    const { client, service } = await base();
    const result = await service.createRoutesFromRun(RUN, { count: 2, mode: 'split' }, contexto);
    expect(result.routes.map((route) => route.stops)).toEqual([2, 2]);
    const { rows } = await client.query<{ barrios: number }>(`
      select count(distinct a.neighborhood_id)::int as barrios
      from delivery_stops s join orders o on o.id = s.order_id
      join customer_addresses a on a.id = o.delivery_address_id
      group by s.route_id`);
    expect(rows.map((row) => row.barrios)).toEqual([1, 1]);

    await expect(service.createRoutesFromRun(RUN, { mode: 'single' }, contexto)).rejects.toThrow(
      /sin hoja/,
    );
  });

  it('al publicar una hoja, el reparto pasa a estar en la calle', async () => {
    const { client, service } = await base();
    const result = await service.createRoutesFromRun(RUN, { mode: 'single' }, contexto);
    await service.publishRoute(result.routes[0]?.id ?? '', contexto);
    const { rows } = await client.query<{ status: string }>('select status from delivery_runs');
    expect(rows).toEqual([{ status: 'dispatched' }]);
  });
});

describe('splitByProximity', () => {
  it('no arma más hojas que pedidos', () => {
    const uno = [{ latitude: '-34.6', longitude: '-58.4', neighborhood: null }];
    expect(splitByProximity(uno, 3, null)).toHaveLength(1);
  });
});
