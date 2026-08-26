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
