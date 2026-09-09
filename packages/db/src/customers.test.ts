import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import {
  PostgresOperationsService,
  type CustomerInput,
} from './repositories/postgres-operations-service.js';
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

const CONTEXT = { correlationId: 'test', requestId: 'test', source: 'test' };
const SITE_A = 'a0000000-0000-4000-8000-000000000101';
const ZONE_A = 'a0000000-0000-4000-8000-000000000201';

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function seededService(): Promise<{
  client: PGlite;
  db: Database;
  service: PostgresOperationsService;
}> {
  const { client, close: closeDatabase, db } = await migratedDatabase();
  close = closeDatabase;
  await client.exec(`
    insert into operating_sites (id, slug, display_name, order_prefix)
    values ('${SITE_A}', 'test-site-a', 'Sitio A', 'TSA');
    insert into geographic_zones (id, operating_site_id, slug, display_name)
    values ('${ZONE_A}', '${SITE_A}', 'zona-a', 'Zona A');
  `);
  return {
    client,
    db,
    service: new PostgresOperationsService(db, {
      key: 'test',
      resolve: () => Promise.resolve({ candidates: [], status: 'NO_MATCH' }),
    } as never),
  };
}

// Regression coverage for a real production bug: getCustomer's address projection omitted
// geographicZoneId, a field CustomerDetailSchema requires as a non-nullable UUID (it mirrors the
// notNull DB column) — every customer with an address 500'd when its ficha was opened, because
// the API's CustomerDetailSchema.parse() threw on the missing field.
describe('getCustomer', () => {
  it('includes geographicZoneId on each address, matching the notNull DB column', async () => {
    const { service } = await seededService();

    const created = await service.createCustomer(
      {
        displayName: 'Cliente Con Domicilio',
        operatingSiteId: SITE_A,
        addresses: [
          {
            geographicZoneId: ZONE_A,
            label: 'Casa',
            primary: true,
            source: 'manual',
            writtenAddress: 'Calle Falsa 123',
          },
        ],
      } as unknown as CustomerInput,
      CONTEXT,
    );

    const detail = (await service.getCustomer(created.id, true)) as {
      addresses: { geographicZoneId: string }[];
    };

    expect(detail.addresses).toHaveLength(1);
    const [address] = detail.addresses;
    expect(address?.geographicZoneId).toBe(ZONE_A);
  });
});

describe('deleteCustomer', () => {
  it('borra de verdad al cliente que nunca compró, y se lleva sus domicilios', async () => {
    const { db, service } = await seededService();
    const created = await service.createCustomer(
      {
        addresses: [
          {
            geographicZoneId: ZONE_A,
            label: 'Casa',
            primary: true,
            source: 'manual',
            writtenAddress: 'Calle Falsa 123',
          },
        ],
        displayName: 'Duplicado Cargado Dos Veces',
        operatingSiteId: SITE_A,
      } as unknown as CustomerInput,
      CONTEXT,
    );

    const result = await service.deleteCustomer(created.id, CONTEXT);

    /*
     * Éste es el caso que motivó todo: un duplicado, una prueba, un contacto cargado dos veces.
     * Archivarlo sólo ensuciaría la lista para siempre con un registro que nunca compró nada.
     */
    expect(result).toEqual({ orderCount: 0, outcome: 'DELETED' });
    const rows = await db.select().from(schema.customers);
    expect(rows).toHaveLength(0);
    // Las direcciones se van con él por cascada; si quedaran, apuntarían a nadie.
    expect(await db.select().from(schema.customerAddresses)).toHaveLength(0);
  });

  it('archiva al cliente que tiene pedidos en vez de borrarlo', async () => {
    const { client, db, service } = await seededService();
    const created = await service.createCustomer(
      { displayName: 'Clienta Fiel', operatingSiteId: SITE_A },
      CONTEXT,
    );
    await client.exec(`
      insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
      values ('b0000000-0000-4000-8000-000000000001', 'Semana 36', '2026-09-01T12:00:00Z',
              '2026-09-05T23:00:00Z', '2026-09-06T22:00:00Z');
      insert into weekly_menus (id, sales_cycle_id, status)
      values ('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
              'PUBLISHED');
      insert into orders (id, public_number, customer_id, sales_cycle_id, weekly_menu_id, source,
                          status, delivery_date, delivery_address_snapshot, payment_expectation,
                          total_minor, operating_site_id)
      values ('b0000000-0000-4000-8000-000000000003', 'TSA-00001', '${created.id}',
              'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002',
              'web', 'DELIVERED', '2026-09-06', 'Calle 1', 'efectivo', 25000, '${SITE_A}');
    `);

    const result = await service.deleteCustomer(created.id, CONTEXT);

    /*
     * La clave foránea de `orders` es `restrict` justamente para que esto no sea una decisión:
     * borrarla destruiría el historial de venta y la trazabilidad de la auditoría. Se archiva.
     */
    expect(result).toEqual({ orderCount: 1, outcome: 'ARCHIVED' });
    const [row] = await db.select().from(schema.customers);
    expect(row?.status).toBe('archived');
    expect(await db.select().from(schema.orders)).toHaveLength(1);
  });

  it('deja el rastro en auditoría antes de borrar, no después', async () => {
    const { db, service } = await seededService();
    const created = await service.createCustomer(
      { displayName: 'Prueba Uno', operatingSiteId: SITE_A },
      CONTEXT,
    );

    await service.deleteCustomer(created.id, CONTEXT);

    // Si el evento se registrara después, la fila ya no estaría y no quedaría quién dice qué se
    // borró ni con qué nombre.
    const events = await db.select().from(schema.auditEvents);
    expect(events.some((event) => event.action === 'customer.deleted')).toBe(true);
  });

  it('no inventa un cliente que no existe', async () => {
    const { service } = await seededService();

    await expect(
      service.deleteCustomer('c0000000-0000-4000-8000-000000000999', CONTEXT),
    ).rejects.toThrow();
  });
});
