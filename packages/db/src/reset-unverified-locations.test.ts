import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from './index.js';
import { findUnverifiedLocations, resetUnverifiedLocations } from './reset-unverified-locations.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const SITE = 'a0000000-0000-4000-8000-000000000009';
const ZONE = '0d000000-0000-4000-8000-000000000001';
const SEMILLA = 'c0000000-0000-4000-8000-000000000001';
const REAL = 'c0000000-0000-4000-8000-000000000002';
const DIR_SEMILLA = '0c000000-0000-4000-8000-000000000001';
const DIR_REAL = '0c000000-0000-4000-8000-000000000002';
const DIR_SIN = '0c000000-0000-4000-8000-000000000003';

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
  await client.exec(`
    insert into operating_sites (id, slug, display_name, order_prefix)
    values ('${SITE}', 'caba', 'CABA', 'CABA');
    insert into geographic_zones (id, operating_site_id, slug, display_name)
    values ('${ZONE}', '${SITE}', 'general', 'Zona General');
    insert into customers (id, display_name) values ('${SEMILLA}', 'Paula Castro'), ('${REAL}', 'Ana Real');
    -- La semilla: punto al azar, marcado confirmado, con un enlace armado con ese mismo punto.
    insert into customer_addresses (id, customer_id, label, written_address, geographic_zone_id,
      latitude, longitude, location_url, geocoding_status)
    values ('${DIR_SEMILLA}', '${SEMILLA}', 'Casa', 'Thames 2696, Zona General, Buenos Aires', '${ZONE}',
      -34.58, -58.34, 'https://www.google.com/maps/search/?api=1&query=-34.58,-58.34', 'CONFIRMED');
    -- Uno real: ubicado por el ubicador, con su búsqueda registrada.
    insert into customer_addresses (id, customer_id, label, written_address, geographic_zone_id,
      latitude, longitude, geocoding_status)
    values ('${DIR_REAL}', '${REAL}', 'Casa', 'Pasteur 974', '${ZONE}', -34.6, -58.4, 'CONFIRMED');
    insert into geocoding_requests (address_id, idempotency_key, provider_key, query_text, status)
    values ('${DIR_REAL}', 'k-1', 'google-maps', 'Pasteur 974', 'CONFIRMED');
    -- Uno sin ubicación: nada que tocar.
    insert into customer_addresses (id, customer_id, label, written_address, geographic_zone_id)
    values ('${DIR_SIN}', '${REAL}', 'Trabajo', 'Corrientes 1234', '${ZONE}');
  `);
  close = () => client.close();
  return { client, db: drizzle(client, { schema }) as unknown as Database };
}

describe('resetUnverifiedLocations', () => {
  it('encuentra sólo los domicilios con coordenadas que nunca pasaron por el ubicador', async () => {
    const { db } = await base();
    const filas = await findUnverifiedLocations(db);
    expect(filas.map((fila) => fila.id)).toEqual([DIR_SEMILLA]);
  });

  // Si el enlace quedara, el ubicador lo tomaría como elegido a mano y repetiría el punto falso.
  it('les borra las coordenadas y el enlace que apunta al mismo punto, y no toca los reales', async () => {
    const { client, db } = await base();

    expect(await resetUnverifiedLocations(db)).toBe(1);

    const { rows } = await client.query<{
      geocoding_status: string;
      id: string;
      latitude: string | null;
      location_url: string | null;
    }>(`select id, latitude, location_url, geocoding_status from customer_addresses order by id`);
    expect(rows.find((row) => row.id === DIR_SEMILLA)).toMatchObject({
      geocoding_status: 'NEEDS_LOCATION',
      latitude: null,
      location_url: null,
    });
    expect(Number(rows.find((row) => row.id === DIR_REAL)?.latitude)).toBeCloseTo(-34.6);
  });

  it('una segunda corrida no encuentra nada', async () => {
    const { db } = await base();
    await resetUnverifiedLocations(db);
    expect(await resetUnverifiedLocations(db)).toBe(0);
  });
});
