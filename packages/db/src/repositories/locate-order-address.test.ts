import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { GeocodingCandidate, GeocodingProvider } from '@verdeo/geocoding';

import type { Database } from '../index.js';
import * as schema from '../schema/index.js';
import { PostgresOperationsService } from './postgres-operations-service.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

const SITE = 'a0000000-0000-4000-8000-000000000009';
const ZONE = '0d000000-0000-4000-8000-000000000001';
const CUSTOMER = 'c0000000-0000-4000-8000-000000000001';
const CYCLE = 'd0000000-0000-4000-8000-000000000001';
const MENU = 'e0000000-0000-4000-8000-000000000001';
const ORDER = '0a000000-0000-4000-8000-000000000001';

// El origen de la ciudad es Villa Crespo; el pedido, también.
const seed = `
  insert into operating_sites (id, slug, display_name, order_prefix, origin_latitude, origin_longitude)
  values ('${SITE}', 'caba', 'CABA', 'CABA', -34.5997, -58.4398);
  insert into geographic_zones (id, operating_site_id, slug, display_name)
  values ('${ZONE}', '${SITE}', 'caba', 'CABA');
  insert into customers (id, display_name) values ('${CUSTOMER}', 'Marta Mera');
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
  values ('${CYCLE}', 'Semana 41', '2026-10-01T12:00:00Z', '2026-10-05T23:00:00Z', '2026-10-06T22:00:00Z');
  insert into weekly_menus (id, sales_cycle_id, status) values ('${MENU}', '${CYCLE}', 'PUBLISHED');
  insert into orders (id, public_number, customer_id, sales_cycle_id, weekly_menu_id, source,
                      status, delivery_date, delivery_address_snapshot, payment_expectation,
                      total_minor, operating_site_id)
  values ('${ORDER}', 'CABA-00001', '${CUSTOMER}', '${CYCLE}', '${MENU}', 'email', 'CONFIRMED',
          '2026-10-10', 'Julián Álvarez 1010. 6 ° A, Villa Crespo', 'Efectivo', 8500000, '${SITE}');
`;

let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
});

async function base(provider: GeocodingProvider) {
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
  return { client, db, service: new PostgresOperationsService(db, provider) };
}

const proveedor = (candidates: GeocodingCandidate[]): GeocodingProvider => ({
  geocode: () => Promise.resolve(candidates),
  key: 'prueba',
});

const candidato = (
  latitude: number,
  longitude: number,
  confidence: number,
): GeocodingCandidate => ({
  confidence,
  formattedAddress: 'Julián Álvarez 1010, C1414 CABA',
  latitude,
  longitude,
  providerCandidateId: 'place-1',
});

const contexto = {
  actorUserId: null,
  correlationId: 'c',
  requestId: 'r',
  source: 'test',
} as never;
const reglas = { radiusKm: 40, threshold: 0.9 };

describe('locateOrderAddress', () => {
  it('crea el domicilio del pedido, lo ubica y lo deja confirmado cuando el resultado es seguro', async () => {
    const { client, service } = await base(proveedor([candidato(-34.5998, -58.44, 1)]));

    const result = await service.locateOrderAddress(ORDER, reglas, contexto);

    expect(result.status).toBe('located');
    const { rows } = await client.query<{ latitude: string; geocoding_status: string; id: string }>(
      `select a.id, a.latitude, a.geocoding_status from customer_addresses a`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.geocoding_status).toBe('CONFIRMED');
    const order = await client.query<{ delivery_address_id: string }>(
      `select delivery_address_id from orders where id = '${ORDER}'`,
    );
    // Sin esto el pedido nunca entra en una ruta: createRoute une las paradas por este campo.
    expect(order.rows[0]?.delivery_address_id).toBe(rows[0]?.id);
  });

  // La "San Martín 500" de otra provincia con la confianza al máximo.
  it('no acepta sola un punto seguro pero fuera de la ciudad', async () => {
    const { client, service } = await base(proveedor([candidato(-31.42, -64.18, 1)]));

    const result = await service.locateOrderAddress(ORDER, reglas, contexto);

    expect(result.status).toBe('review');
    expect(result.reason).toContain('lejos');
    const { rows } = await client.query<{ latitude: string | null }>(
      `select latitude from customer_addresses`,
    );
    expect(rows[0]?.latitude).toBeNull();
  });

  it('con poca confianza deja candidatos para revisar', async () => {
    const { service } = await base(proveedor([candidato(-34.5998, -58.44, 0.5)]));

    const result = await service.locateOrderAddress(ORDER, reglas, contexto);

    expect(result.status).toBe('review');
    expect(result.candidates).toHaveLength(1);
  });

  it('avisa cuando no encuentra la dirección', async () => {
    const { service } = await base(proveedor([]));
    expect((await service.locateOrderAddress(ORDER, reglas, contexto)).status).toBe('no_match');
  });

  // Nunca se pisa una ubicación que ya está.
  it('no hace nada si el domicilio ya tiene coordenadas', async () => {
    const { client, service } = await base(proveedor([candidato(-34.5998, -58.44, 1)]));
    await service.locateOrderAddress(ORDER, reglas, contexto);
    await client.exec(`update customer_addresses set latitude = -34.1, longitude = -58.1`);

    const again = await service.locateOrderAddress(ORDER, reglas, contexto);

    expect(again.status).toBe('already_located');
    const { rows } = await client.query<{ latitude: string }>(
      `select latitude from customer_addresses`,
    );
    expect(Number(rows[0]?.latitude)).toBeCloseTo(-34.1);
  });

  it('con más de una zona y sin zona en el pedido pide que se asigne', async () => {
    const { client, service } = await base(proveedor([candidato(-34.5998, -58.44, 1)]));
    await client.exec(
      `insert into geographic_zones (operating_site_id, slug, display_name) values ('${SITE}', 'norte', 'Norte')`,
    );

    const result = await service.locateOrderAddress(ORDER, reglas, contexto);

    expect(result.status).toBe('needs_zone');
    expect((await client.query(`select 1 from customer_addresses`)).rows).toHaveLength(0);
  });
});

describe('unlocatedOrders', () => {
  it('lista los pedidos del día sin ubicación y deja de listarlos al ubicarlos', async () => {
    const { service } = await base(proveedor([candidato(-34.5998, -58.44, 1)]));

    const before = await service.unlocatedOrders(SITE, '2026-10-10');
    expect(before.map((row) => row.publicNumber)).toEqual(['CABA-00001']);
    expect(before[0]?.hasAddress).toBe(false);

    await service.locateOrderAddress(ORDER, reglas, contexto);

    expect(await service.unlocatedOrders(SITE, '2026-10-10')).toHaveLength(0);
  });
});

describe('ajustes de ubicación por ciudad', () => {
  const ajustes = {
    autoAccept: true,
    cityContext: 'Villa Crespo, CABA, Argentina',
    confidenceThresholdPercent: 90,
    radiusKm: 60,
    useAi: true,
  };

  it('sin ajustes guardados valen los de por defecto', async () => {
    const { service } = await base(proveedor([]));
    expect(await service.getGeocodingSettings(SITE)).toEqual({
      autoAccept: true,
      cityContext: null,
      confidenceThresholdPercent: 90,
      radiusKm: 60,
      useAi: true,
    });
  });

  it('guarda los ajustes de la ciudad y deja registro de quién los cambió', async () => {
    const { client, service } = await base(proveedor([]));

    const guardados = await service.updateGeocodingSettings(
      SITE,
      { ...ajustes, cityContext: '  Villa Crespo, CABA, Argentina ', radiusKm: 25 },
      contexto,
    );

    expect(guardados).toMatchObject({ cityContext: 'Villa Crespo, CABA, Argentina', radiusKm: 25 });
    const audit = await client.query(
      `select 1 from audit_events where action = 'geocoding.settings_updated'`,
    );
    expect(audit.rows).toHaveLength(1);
  });

  it('con la aceptación automática apagada deja todo para revisar aunque sea seguro', async () => {
    const { service } = await base(proveedor([candidato(-34.5998, -58.44, 1)]));
    await service.updateGeocodingSettings(SITE, { ...ajustes, autoAccept: false }, contexto);

    const result = await service.locateOrderAddress(ORDER, reglas, contexto);

    expect(result.status).toBe('review');
    expect(result.candidates).toHaveLength(1);
  });

  it('respeta el umbral y el radio de la ciudad en lugar de los de por defecto', async () => {
    const { service } = await base(proveedor([candidato(-34.5998, -58.44, 0.95)]));
    await service.updateGeocodingSettings(
      SITE,
      { ...ajustes, confidenceThresholdPercent: 99 },
      contexto,
    );

    expect((await service.locateOrderAddress(ORDER, reglas, contexto)).status).toBe('review');
  });

  it('cuenta las solicitudes de los últimos días por resultado', async () => {
    const { service } = await base(proveedor([candidato(-34.5998, -58.44, 1)]));
    await service.locateOrderAddress(ORDER, reglas, contexto);

    const metricas = await service.geocodingMetrics(SITE, 30);

    expect(metricas.requests).toMatchObject({ confirmed: 1, total: 1 });
    expect(metricas.ai.calls).toBe(0);
  });
});

describe('ciudad sin punto de origen', () => {
  const sinOrigen = async (provider: GeocodingProvider) => {
    const ctx = await base(provider);
    await ctx.client.exec(
      `update operating_sites set origin_latitude = null, origin_longitude = null`,
    );
    return ctx;
  };

  // Sin origen ni direcciones confirmadas no hay contra qué comparar: la primera la confirma una persona.
  it('deja la primera dirección para revisar a mano', async () => {
    const { service } = await sinOrigen(proveedor([candidato(-34.5998, -58.44, 1)]));

    const result = await service.locateOrderAddress(ORDER, reglas, contexto);

    expect(result.status).toBe('review');
    expect(result.reason).toContain('primeras direcciones');
  });

  it('usa de referencia las direcciones ya confirmadas y acepta la que cae cerca', async () => {
    const { client, service } = await sinOrigen(proveedor([candidato(-34.5998, -58.44, 1)]));
    await client.exec(
      `insert into customer_addresses (customer_id, label, written_address, geographic_zone_id, latitude, longitude, geocoding_status)
       values ('${CUSTOMER}', 'Casa', 'Otra 1', '${ZONE}', -34.61, -58.43, 'CONFIRMED')`,
    );

    const result = await service.locateOrderAddress(ORDER, reglas, contexto);

    expect(result.status).toBe('located');
  });

  it('descarta lo que cae lejos de las direcciones confirmadas', async () => {
    const { client, service } = await sinOrigen(proveedor([candidato(-31.42, -64.18, 1)]));
    await client.exec(
      `insert into customer_addresses (customer_id, label, written_address, geographic_zone_id, latitude, longitude, geocoding_status)
       values ('${CUSTOMER}', 'Casa', 'Otra 1', '${ZONE}', -34.61, -58.43, 'CONFIRMED')`,
    );

    const result = await service.locateOrderAddress(ORDER, reglas, contexto);

    expect(result.status).toBe('review');
    expect(result.reason).toContain('lejos');
  });
});
