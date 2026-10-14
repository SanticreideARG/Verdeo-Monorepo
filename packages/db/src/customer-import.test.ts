import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from './index.js';
import {
  PostgresOperationsService,
  type CustomerInput,
} from './repositories/postgres-operations-service.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const SITE = 'a0000000-0000-4000-8000-000000000009';
const ZONE = '0d000000-0000-4000-8000-000000000001';
const ARCHIVADO = 'c0000000-0000-4000-8000-000000000001';

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
  // Un cliente archivado que todavía tiene su WhatsApp activo: es lo que hacía fallar la
  // importación entera con un "ya existe" sin decir quién.
  await client.exec(`
    insert into operating_sites (id, slug, display_name, order_prefix)
    values ('${SITE}', 'caba', 'CABA', 'CABA');
    insert into geographic_zones (id, operating_site_id, slug, display_name)
    values ('${ZONE}', '${SITE}', 'general', 'Zona General');
    insert into customers (id, display_name, status) values ('${ARCHIVADO}', 'Ana Vieja', 'archived');
    insert into customer_identities (customer_id, type, value_display, value_normalized, "primary")
    values ('${ARCHIVADO}', 'whatsapp', '+54 9 11 5555-0101', '+5491155550101', true);
  `);
  close = () => client.close();
  const db = drizzle(client, { schema }) as unknown as Database;
  return {
    client,
    service: new PostgresOperationsService(db, {
      geocode: () => Promise.resolve([]),
      key: 'prueba',
    }),
  };
}

const contexto = { correlationId: 'c', requestId: 'r', source: 'test' };

function cliente(nombre: string, telefono: string, barrio?: string): CustomerInput {
  return {
    addresses: [
      {
        geocodingStatus: 'NEEDS_LOCATION',
        geographicZoneId: ZONE,
        label: 'Casa',
        primary: true,
        ...(barrio ? { sector: barrio } : {}),
        source: 'spreadsheet_import',
        writtenAddress: `Calle ${nombre} 100`,
      },
    ],
    displayName: nombre,
    identities: [
      {
        primary: true,
        source: 'spreadsheet_import',
        type: 'whatsapp',
        value: telefono,
        verified: false,
      },
    ],
    operatingSiteId: SITE,
    phone: telefono,
  };
}

describe('reconcileCustomerImport', () => {
  it('marca nuevo, existente (aunque esté archivado y escrito distinto) y repetido', async () => {
    const { service } = await base();

    const filas = await service.reconcileCustomerImport([
      cliente('Ana Nueva', '1155550101'),
      cliente('Beto', '+5491155550202'),
      cliente('Beto otra vez', '11 5555-0202'),
    ]);

    expect(filas[0]).toMatchObject({
      match: {
        customerId: ARCHIVADO,
        displayName: 'Ana Vieja',
        matchedBy: 'whatsapp',
        status: 'archived',
      },
      status: 'existing',
    });
    expect(filas[1]).toMatchObject({ match: null, status: 'new' });
    expect(filas[2]).toMatchObject({ repeatedOf: 1, status: 'repeated' });
  });
});

describe('barrios', () => {
  it('se crean al importar y "Núñez" y "nuñez" son el mismo barrio', async () => {
    const { client, service } = await base();

    await service.importCustomers(
      [cliente('Carla', '+5491155550303', 'Núñez'), cliente('Dora', '+5491155550404', ' nuñez ')],
      contexto,
    );

    const { rows } = await client.query<{ display_name: string; total: number }>(`
      select n.display_name, count(a.id)::int as total
      from neighborhoods n join customer_addresses a on a.neighborhood_id = n.id
      group by n.display_name`);
    expect(rows).toEqual([{ display_name: 'Núñez', total: 2 }]);
  });

  // Desde "Todas las ciudades" la planilla se rechazaba entera aunque la zona ya estaba elegida.
  it('sin ciudad elegida arriba, toma la ciudad de la zona del domicilio', async () => {
    const { client, service } = await base();
    const sinCiudad = { ...cliente('Fede', '+5491155550606'), operatingSiteId: null };

    await service.importCustomers([sinCiudad], contexto);

    const { rows } = await client.query<{ operating_site_id: string }>(
      `select operating_site_id from customer_operating_sites`,
    );
    expect(rows).toEqual([{ operating_site_id: SITE }]);
  });

  it('un domicilio sin barrio queda sin barrio', async () => {
    const { client, service } = await base();
    await service.importCustomers([cliente('Eva', '+5491155550505')], contexto);
    const { rows } = await client.query<{ neighborhood_id: string | null }>(
      `select neighborhood_id from customer_addresses`,
    );
    expect(rows[0]?.neighborhood_id).toBeNull();
  });
});
