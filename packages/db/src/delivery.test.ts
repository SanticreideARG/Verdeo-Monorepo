import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { NearestNeighborRouteOptimizer } from '@verdeo/routing';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PostgresDeliveryService } from './repositories/postgres-delivery-service.js';
import type { Database } from './index.js';
import * as schema from './schema/index.js';

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
const CUSTOMER_A = 'c0000000-0000-4000-8000-000000000001';
const CUSTOMER_B = 'c0000000-0000-4000-8000-000000000002';
const CYCLE = 'd0000000-0000-4000-8000-000000000001';
const MENU = 'e0000000-0000-4000-8000-000000000001';
const ADDRESS_A = '0c000000-0000-4000-8000-000000000001';
const ADDRESS_B = '0c000000-0000-4000-8000-000000000002';
const ZONE = '0d000000-0000-4000-8000-000000000001';
const ORDER_A = '0a000000-0000-4000-8000-000000000001';
const ORDER_B = '0a000000-0000-4000-8000-000000000002';
const USER_REPARTIDOR = 'f0000000-0000-4000-8000-000000000001';

const seed = `
  insert into operating_sites (id, slug, display_name, order_prefix, origin_latitude, origin_longitude)
  values ('${SITE}', 'cipolletti', 'Cipolletti', 'CIP', 0, 0);
  insert into geographic_zones (id, operating_site_id, slug, display_name)
  values ('${ZONE}', '${SITE}', 'centro', 'Centro');
  insert into customers (id, display_name) values
    ('${CUSTOMER_A}', 'Ana Gómez'),
    ('${CUSTOMER_B}', 'Bruno Díaz');
  insert into customer_addresses (id, customer_id, label, written_address, geographic_zone_id, latitude, longitude)
  values
    ('${ADDRESS_A}', '${CUSTOMER_A}', 'Casa', 'Calle 1', '${ZONE}', 0, 3),
    ('${ADDRESS_B}', '${CUSTOMER_B}', 'Casa', 'Calle 2', '${ZONE}', 0, 1);
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
  values ('${CYCLE}', 'Semana 34', '2026-08-20T12:00:00Z', '2026-08-25T23:00:00Z',
          '2026-08-26T22:00:00Z');
  insert into weekly_menus (id, sales_cycle_id, status)
  values ('${MENU}', '${CYCLE}', 'PUBLISHED');
  insert into users (id, display_name) values ('${USER_REPARTIDOR}', 'Diego Reparto');

  insert into orders (id, public_number, customer_id, sales_cycle_id, weekly_menu_id, source,
                      status, delivery_date, delivery_address_id, delivery_address_snapshot,
                      payment_expectation, total_minor, operating_site_id)
  values
    ('${ORDER_A}', 'CIP-00001', '${CUSTOMER_A}', '${CYCLE}', '${MENU}', 'web', 'CONFIRMED',
     '2026-08-26', '${ADDRESS_A}', 'Calle 1', 'efectivo', 25000, '${SITE}'),
    ('${ORDER_B}', 'CIP-00002', '${CUSTOMER_B}', '${CYCLE}', '${MENU}', 'web', 'CONFIRMED',
     '2026-08-26', '${ADDRESS_B}', 'Calle 2', 'transferencia', 30000, '${SITE}');
`;

const CONTEXT = { correlationId: 'test', requestId: 'test', source: 'test' };

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

function stubMessaging() {
  return { sendToCustomer: vi.fn(() => Promise.resolve({ sent: true })) };
}

async function seededService(messaging = stubMessaging()) {
  const { client, close: closeDatabase, db } = await migratedDatabase();
  close = closeDatabase;
  await client.exec(seed);
  return {
    db,
    messaging,
    service: new PostgresDeliveryService(db, new NearestNeighborRouteOptimizer(), messaging),
  };
}

describe('createRoute', () => {
  it('proposes a draft route sequencing both confirmed orders by distance from the origin', async () => {
    const { service } = await seededService();

    const route = await service.createRoute(SITE, '2026-08-26', undefined, CONTEXT);

    expect(route?.status).toBe('draft');
    expect(route?.stops).toHaveLength(2);
    // Origin is (0,0); B is closer (longitude 1) than A (longitude 3).
    expect(route?.stops.map((stop) => stop.orderId)).toEqual([ORDER_B, ORDER_A]);
  });

  it('excludes an order already on an active route', async () => {
    const { service } = await seededService();
    await service.createRoute(SITE, '2026-08-26', undefined, CONTEXT);

    const second = await service.createRoute(SITE, '2026-08-26', undefined, CONTEXT);

    expect(second?.stops).toHaveLength(0);
  });
});

describe('publishRoute', () => {
  it('moves a draft route to published and refuses a second publish', async () => {
    const { service } = await seededService();
    const route = await service.createRoute(SITE, '2026-08-26', undefined, CONTEXT);

    const published = await service.publishRoute(route!.id, CONTEXT);
    expect(published?.status).toBe('published');

    await expect(service.publishRoute(route!.id, CONTEXT)).rejects.toThrow(/borrador/);
  });
});

describe('stop assignment and status', () => {
  it('assigns a stop and exposes it in the assignee PII-safe list once published', async () => {
    const { service } = await seededService();
    const route = await service.createRoute(SITE, '2026-08-26', undefined, CONTEXT);
    const stop = route!.stops[0]!;
    await service.assignStop(stop.id, USER_REPARTIDOR, CONTEXT);

    expect(await service.listStopsForUser(USER_REPARTIDOR)).toHaveLength(0); // not published yet

    await service.publishRoute(route!.id, CONTEXT);
    const stops = await service.listStopsForUser(USER_REPARTIDOR);

    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveProperty('customerFirstName');
    expect(JSON.stringify(stops[0])).not.toContain('Gómez');
    expect(JSON.stringify(stops[0])).not.toContain('Díaz');
  });

  it('marks a stop delivered and transitions the underlying order', async () => {
    const { db, service } = await seededService();
    const route = await service.createRoute(SITE, '2026-08-26', undefined, CONTEXT);
    const stop = route!.stops[0]!;

    await service.updateStopStatus(stop.id, 'delivered', USER_REPARTIDOR, CONTEXT);

    const [order] = await db
      .select({ status: schema.orders.status })
      .from(schema.orders)
      .where(eq(schema.orders.id, stop.orderId));
    expect(order?.status).toBe('DELIVERED');
  });
});

describe('reorderStops', () => {
  it('rewrites sequence without violating the unique (route, sequence) index', async () => {
    const { service } = await seededService();
    const route = await service.createRoute(SITE, '2026-08-26', undefined, CONTEXT);
    const [first, second] = route!.stops;

    const reordered = await service.reorderStops(route!.id, [second!.id, first!.id]);

    expect(reordered?.stops.map((stop) => stop.id)).toEqual([second!.id, first!.id]);
  });
});

describe('triggerMessage', () => {
  it('sends the configured template for the action', async () => {
    const { db, messaging, service } = await seededService();
    const route = await service.createRoute(SITE, '2026-08-26', undefined, CONTEXT);
    const stop = route!.stops[0]!;
    await db.insert(schema.messageTemplates).values({
      actionKey: 'ON_MY_WAY',
      body: 'Estoy en camino!',
      displayName: 'En camino',
      key: 'on-my-way',
    });

    const result = await service.triggerMessage(stop.id, 'ON_MY_WAY', CONTEXT);

    expect(result).toEqual({ sent: true });
    expect(messaging.sendToCustomer).toHaveBeenCalledWith(
      expect.any(String),
      SITE,
      'Estoy en camino!',
      expect.objectContaining({ correlationId: 'test' }),
    );
  });

  it('returns no_template when nothing is configured for the action', async () => {
    const { service } = await seededService();
    const route = await service.createRoute(SITE, '2026-08-26', undefined, CONTEXT);
    const stop = route!.stops[0]!;

    const result = await service.triggerMessage(stop.id, 'AT_ADDRESS', CONTEXT);

    expect(result).toEqual({ reason: 'no_template', sent: false });
  });
});
