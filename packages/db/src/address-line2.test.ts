import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from './index.js';
import { PostgresOperationsService } from './repositories/postgres-operations-service.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const SITE = 'a0000000-0000-4000-8000-000000000009';
const CUSTOMER = 'c0000000-0000-4000-8000-000000000001';
const CYCLE = 'd0000000-0000-4000-8000-000000000001';
const MENU = 'e0000000-0000-4000-8000-000000000001';
const FAMILY = 'f0000000-0000-4000-8000-000000000001';
const SIZE = 'f1000000-0000-4000-8000-000000000001';
const VARIANT = 'f2000000-0000-4000-8000-000000000001';
const OFFERING = 'f3000000-0000-4000-8000-000000000001';

// El período cierra el domingo 18 de octubre de 2026 a las 23:15 en Argentina.
const seed = `
  insert into operating_sites (id, slug, display_name, order_prefix)
  values ('${SITE}', 'caba', 'CABA', 'CABA');
  insert into customers (id, display_name) values ('${CUSTOMER}', 'Ana Prueba');
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
  values ('${CYCLE}', 'Octubre 3', '2026-10-12T12:00:00Z', '2026-10-17T12:00:00Z',
          '2026-10-19T02:15:00Z');
  insert into weekly_menus (id, sales_cycle_id, status) values ('${MENU}', '${CYCLE}', 'PUBLISHED');
  insert into product_families (id, code, display_name, kind)
  values ('${FAMILY}', 'keto', 'Keto', 'FIXED');
  insert into product_families (code, display_name, kind) values ('intuitivo', 'Intuitivo', 'COMPOSABLE');
  insert into product_sizes (id, code, display_name) values ('${SIZE}', '250', '250');
  insert into product_variants (id, product_family_id, product_size_id, code, display_name)
  values ('${VARIANT}', '${FAMILY}', '${SIZE}', 'keto-250', '250');
  insert into weekly_menu_prices (weekly_menu_id, product_size_id, unit_price_minor)
  values ('${MENU}', '${SIZE}', 7000000);
  insert into weekly_menu_offerings (id, weekly_menu_id, product_variant_id)
  values ('${OFFERING}', '${MENU}', '${VARIANT}');
  insert into weekly_menu_items (offering_id, slot, dish_name) values
    ('${OFFERING}', 1, 'A'), ('${OFFERING}', 2, 'B'), ('${OFFERING}', 3, 'C'),
    ('${OFFERING}', 4, 'D'), ('${OFFERING}', 5, 'E');
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
    service: new PostgresOperationsService(db, { geocode: () => Promise.resolve([]), key: 'x' }),
  };
}

const ZONE = 'b0000000-0000-4000-8000-000000000009';
const ADDRESS = 'b1000000-0000-4000-8000-000000000001';

const contexto = { correlationId: 'c', requestId: 'r', source: 'test' };
const pedido = (deliveryDate: string) => ({
  customerId: CUSTOMER,
  deliveryAddress: 'Calle 1',
  deliveryDate,
  dietaryInstructions: [],
  items: [{ offeringId: OFFERING, quantityUnits: 1 }],
  menuId: MENU,
  operatingSiteId: SITE,
  paymentExpectation: 'Efectivo',
  source: 'manual',
});

describe('el domicilio en dos líneas', () => {
  it('guarda la línea 2 escrita en el pedido y la deja editar o borrar', async () => {
    const { service } = await base();
    const order = (await service.createOrder(
      { ...pedido('2026-10-18'), deliveryAddressLine2: '3° B, timbre 2, barrio Centro' },
      contexto,
    )) as { deliveryAddressLine2: string | null; id: string };
    expect(order.deliveryAddressLine2).toBe('3° B, timbre 2, barrio Centro');

    const edited = (await service.updateOrder(
      order.id,
      { deliveryAddressLine2: 'PB, portería' },
      false,
      contexto,
    )) as { deliveryAddressLine2: string | null };
    expect(edited.deliveryAddressLine2).toBe('PB, portería');

    const cleared = (await service.updateOrder(
      order.id,
      { deliveryAddressLine2: null },
      false,
      contexto,
    )) as { deliveryAddressLine2: string | null };
    expect(cleared.deliveryAddressLine2).toBeNull();
  });

  it('al elegir un domicilio, la línea 2 sale del domicilio si no se escribió otra', async () => {
    const { client, service } = await base();
    await client.exec(`
      insert into geographic_zones (id, operating_site_id, slug, display_name)
      values ('${ZONE}', '${SITE}', 'centro', 'Centro');
      insert into customer_addresses (id, customer_id, label, written_address, unit, geographic_zone_id)
      values ('${ADDRESS}', '${CUSTOMER}', 'Casa', 'Mitre 100, Neuquén', '4° A', '${ZONE}');
    `);

    const heredada = (await service.createOrder(
      { ...pedido('2026-10-18'), deliveryAddressId: ADDRESS },
      contexto,
    )) as { deliveryAddress: string; deliveryAddressLine2: string | null };
    expect(heredada).toMatchObject({
      deliveryAddress: 'Mitre 100, Neuquén',
      deliveryAddressLine2: '4° A',
    });

    const escrita = (await service.createOrder(
      { ...pedido('2026-10-18'), deliveryAddressId: ADDRESS, deliveryAddressLine2: 'Timbre 3' },
      contexto,
    )) as { deliveryAddressLine2: string | null };
    expect(escrita.deliveryAddressLine2).toBe('Timbre 3');
  });

  it('al buscar en el mapa se manda sólo la línea 1', async () => {
    const consultas: string[] = [];
    const { client } = await base();
    await client.exec(`
      insert into geographic_zones (id, operating_site_id, slug, display_name)
      values ('${ZONE}', '${SITE}', 'centro', 'Centro');
      insert into customer_addresses (id, customer_id, label, written_address, unit, geographic_zone_id)
      values ('${ADDRESS}', '${CUSTOMER}', 'Casa', 'Mitre 100, Neuquén', '4° A, barrio Centro', '${ZONE}');
    `);
    const db = drizzle(client, { schema }) as unknown as Database;
    const service = new PostgresOperationsService(db, {
      geocode: (query: Record<string, unknown>) => {
        consultas.push(JSON.stringify(query));
        return Promise.resolve([]);
      },
      key: 'x',
    } as never);

    await service.requestAddressGeocoding(CUSTOMER, ADDRESS, { idempotencyKey: 'k' }, contexto);

    expect(consultas.length).toBeGreaterThan(0);
    for (const consulta of consultas) {
      expect(consulta).toContain('Mitre 100');
      expect(consulta).not.toContain('4° A');
      expect(consulta).not.toContain('barrio');
    }
  });
});
