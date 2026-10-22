import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from './index.js';
import { PostgresGeographyService } from './repositories/postgres-geography-service.js';
import { PostgresOperationsService } from './repositories/postgres-operations-service.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const NQN = 'a0000000-0000-4000-8000-000000000001';
const CBA = 'a0000000-0000-4000-8000-000000000002';
const ZONE_NQN = 'b0000000-0000-4000-8000-000000000001';
const ZONE_CBA = 'b0000000-0000-4000-8000-000000000002';
const CUSTOMER = 'c0000000-0000-4000-8000-000000000001';
const ADDRESS = 'c1000000-0000-4000-8000-000000000001';
const CYCLE = 'd0000000-0000-4000-8000-000000000001';
const MENU_NQN = 'e0000000-0000-4000-8000-000000000001';
const MENU_CBA = 'e0000000-0000-4000-8000-000000000002';
const SIZE = 'f1000000-0000-4000-8000-000000000001';
const VARIANT = 'f2000000-0000-4000-8000-000000000001';
const OFFER_NQN = 'f3000000-0000-4000-8000-000000000001';
const OFFER_CBA = 'f3000000-0000-4000-8000-000000000002';

/*
 * El mismo Keto 250 en las dos ciudades del mismo período, a precios distintos: $70.000 en Neuquén
 * y $80.000 en Córdoba. Córdoba reparte los sábados.
 */
const seed = `
  insert into operating_sites (id, slug, display_name, order_prefix) values
    ('${NQN}', 'prueba-origen', 'Origen', 'ORI'), ('${CBA}', 'prueba-destino', 'Destino', 'DES');
  insert into geographic_zones (id, operating_site_id, slug, display_name) values
    ('${ZONE_NQN}', '${NQN}', 'centro-nqn', 'Centro NQN'),
    ('${ZONE_CBA}', '${CBA}', 'centro-cba', 'Centro CBA');
  insert into customers (id, display_name) values ('${CUSTOMER}', 'Ana Prueba');
  insert into customer_operating_sites (customer_id, operating_site_id) values ('${CUSTOMER}', '${NQN}');
  insert into customer_addresses (id, customer_id, label, written_address, geographic_zone_id,
    "primary", latitude, longitude, geocoding_status)
  values ('${ADDRESS}', '${CUSTOMER}', 'Casa', 'Mitre 100', '${ZONE_NQN}', true, -38.95, -68.06,
    'CONFIRMED');
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at, status)
  values ('${CYCLE}', 'Octubre 3', '2126-10-12T12:00:00Z', '2126-10-17T12:00:00Z',
          '2126-10-19T02:15:00Z', 'OPEN');
  insert into product_families (id, code, display_name, kind)
  values ('f0000000-0000-4000-8000-000000000001', 'keto', 'Keto', 'FIXED');
  insert into product_families (code, display_name, kind) values ('intuitivo', 'Intuitivo', 'COMPOSABLE');
  insert into product_sizes (id, code, display_name) values ('${SIZE}', '250', '250');
  insert into product_variants (id, product_family_id, product_size_id, code, display_name)
  values ('${VARIANT}', 'f0000000-0000-4000-8000-000000000001', '${SIZE}', 'keto-250', '250');
  insert into weekly_menus (id, sales_cycle_id, operating_site_id, status) values
    ('${MENU_NQN}', '${CYCLE}', '${NQN}', 'PUBLISHED'),
    ('${MENU_CBA}', '${CYCLE}', '${CBA}', 'PUBLISHED');
  insert into weekly_menu_prices (weekly_menu_id, product_size_id, unit_price_minor) values
    ('${MENU_NQN}', '${SIZE}', 7000000), ('${MENU_CBA}', '${SIZE}', 8000000);
  insert into weekly_menu_offerings (id, weekly_menu_id, product_variant_id) values
    ('${OFFER_NQN}', '${MENU_NQN}', '${VARIANT}'), ('${OFFER_CBA}', '${MENU_CBA}', '${VARIANT}');
`;

const contexto = { correlationId: 'c', requestId: 'r', source: 'test' };

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
  const service = new PostgresOperationsService(
    drizzle(client, { schema }) as unknown as Database,
    {
      geocode: () => Promise.resolve([]),
      key: 'x',
    },
  );
  const order = (await service.createOrder(
    {
      customerId: CUSTOMER,
      deliveryAddress: 'Mitre 100',
      deliveryAddressId: ADDRESS,
      deliveryDate: '2126-10-19',
      dietaryInstructions: [],
      initialStatus: 'CONFIRMED',
      items: [{ offeringId: OFFER_NQN, quantityUnits: 2 }],
      menuId: MENU_NQN,
      operatingSiteId: NQN,
      paymentExpectation: 'Efectivo',
      source: 'manual',
    },
    contexto,
  )) as { id: string; publicNumber: string };
  return { client, order, service };
}

async function orderRow(client: PGlite, id: string) {
  const { rows } = await client.query<{
    number: string;
    site: string;
    total: number;
    zone: string | null;
  }>(
    `select public_number as number, operating_site_id as site, total_minor as total,
       geographic_zone_id as zone from orders where id = '${id}'`,
  );
  return rows[0];
}

describe('mover un pedido a otra ciudad', () => {
  it('le da número de la ciudad destino y le concilia el precio', async () => {
    const { client, order, service } = await base();

    const moved = await service.moveOrderToSite(
      order.id,
      { targetSiteId: CBA, zoneId: ZONE_CBA },
      contexto,
    );

    expect(moved).toMatchObject({
      previousPublicNumber: order.publicNumber,
      previousTotalMinor: 14_000_000,
      totalMinor: 16_000_000,
    });
    expect(moved.publicNumber).toMatch(/^DES-/);
    expect(await orderRow(client, order.id)).toEqual({
      number: moved.publicNumber,
      site: CBA,
      total: 16_000_000,
      zone: ZONE_CBA,
    });
  });

  it('la vista previa calcula y no guarda nada', async () => {
    const { client, order, service } = await base();

    const preview = await service.moveOrderToSite(
      order.id,
      { targetSiteId: CBA, zoneId: ZONE_CBA },
      contexto,
      true,
    );

    expect(preview.totalMinor).toBe(16_000_000);
    expect((await orderRow(client, order.id))?.site).toBe(NQN);
  });

  it('avisa si la ciudad destino no ofrece la variedad', async () => {
    const { client, order, service } = await base();
    await client.exec(`update weekly_menu_offerings set active = false where id = '${OFFER_CBA}'`);

    await expect(
      service.moveOrderToSite(order.id, { targetSiteId: CBA, zoneId: ZONE_CBA }, contexto),
    ).rejects.toThrow(/no ofrece Keto 250/);
  });
});

describe('mover un cliente a otra ciudad', () => {
  it('cambia su ciudad, pasa sus domicilios a la destino y mueve sus pedidos abiertos', async () => {
    const { client, order, service } = await base();

    const result = await service.moveCustomerToSite(
      CUSTOMER,
      { fromSiteId: NQN, preferredZoneId: ZONE_CBA, targetSiteId: CBA },
      contexto,
    );

    expect(result.addresses).toBe(1);
    expect(result.orders).toHaveLength(1);
    const sites = await client.query<{ site: string }>(
      `select operating_site_id as site from customer_operating_sites where customer_id = '${CUSTOMER}'`,
    );
    expect(sites.rows).toEqual([{ site: CBA }]);
    const address = await client.query<{ lat: string | null; zone: string }>(
      `select geographic_zone_id as zone, latitude as lat from customer_addresses where id = '${ADDRESS}'`,
    );
    // La zona es de Córdoba y vuelve a ubicarse en el mapa.
    expect(address.rows).toEqual([{ lat: null, zone: ZONE_CBA }]);
    expect(await orderRow(client, order.id)).toMatchObject({ site: CBA, zone: ZONE_CBA });
  });

  it('no acepta una zona de otra ciudad', async () => {
    const { service } = await base();

    await expect(
      service.moveCustomerToSite(
        CUSTOMER,
        { fromSiteId: NQN, preferredZoneId: ZONE_NQN, targetSiteId: CBA },
        contexto,
      ),
    ).rejects.toThrow(/no es de la ciudad destino/);
  });
});

describe('zonas', () => {
  const ZONE_OLD = 'b0000000-0000-4000-8000-000000000003';

  it('cuenta las zonas de cada operación', async () => {
    const { client } = await base();
    const geography = new PostgresGeographyService(
      drizzle(client, { schema }) as unknown as Database,
    );

    const sites = await geography.listSites();
    expect(sites.find((site) => site.id === NQN)?.zoneCount).toBe(1);
    expect(sites.find((site) => site.id === CBA)?.zoneCount).toBe(1);
  });

  it('elimina una zona desactivada pasando sus domicilios y pedidos a otra', async () => {
    const { client, order } = await base();
    await client.exec(`
      insert into geographic_zones (id, operating_site_id, slug, display_name, active)
      values ('${ZONE_OLD}', '${NQN}', 'vieja', 'Vieja', false);
      update customer_addresses set geographic_zone_id = '${ZONE_OLD}' where id = '${ADDRESS}';
      update orders set geographic_zone_id = '${ZONE_OLD}' where id = '${order.id}';
    `);
    const geography = new PostgresGeographyService(
      drizzle(client, { schema }) as unknown as Database,
    );

    // Con cosas atadas, pide a dónde pasarlas.
    await expect(geography.deleteZone(ZONE_OLD, undefined, contexto)).rejects.toThrow(
      /elegí a qué zona pasarlos/,
    );
    // Y no acepta una zona de otra operación.
    await expect(geography.deleteZone(ZONE_OLD, ZONE_CBA, contexto)).rejects.toThrow(
      /misma operación/,
    );

    expect(await geography.deleteZone(ZONE_OLD, ZONE_NQN, contexto)).toEqual({
      movedAddresses: 1,
      movedOrders: 1,
    });
    const { rows } = await client.query<{ address: string; order: string; zones: number }>(
      `select (select geographic_zone_id from customer_addresses where id = '${ADDRESS}') as address,
              (select geographic_zone_id from orders where id = '${order.id}') as order,
              (select count(*)::int from geographic_zones where id = '${ZONE_OLD}') as zones`,
    );
    expect(rows[0]).toEqual({ address: ZONE_NQN, order: ZONE_NQN, zones: 0 });
  });

  it('no elimina una zona activa', async () => {
    const { client } = await base();
    const geography = new PostgresGeographyService(
      drizzle(client, { schema }) as unknown as Database,
    );

    await expect(geography.deleteZone(ZONE_NQN, undefined, contexto)).rejects.toThrow(
      /Desactivá la zona/,
    );
  });
});
