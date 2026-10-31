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
const OTHER_SITE = 'a0000000-0000-4000-8000-000000000010';
const NN = 'c0000000-0000-4000-8000-000000000001';
const ANA = 'c0000000-0000-4000-8000-000000000002';
const SIN_DOMICILIO = 'c0000000-0000-4000-8000-000000000003';
const CYCLE = 'd0000000-0000-4000-8000-000000000001';
const MENU = 'e0000000-0000-4000-8000-000000000001';
const FAMILY = 'f0000000-0000-4000-8000-000000000001';
const SIZE = 'f1000000-0000-4000-8000-000000000001';
const VARIANT = 'f2000000-0000-4000-8000-000000000001';
const OFFERING = 'f3000000-0000-4000-8000-000000000001';
const ZONE = 'b0000000-0000-4000-8000-000000000009';
const OTHER_ZONE = 'b0000000-0000-4000-8000-000000000010';
const NN_ADDRESS = 'b1000000-0000-4000-8000-000000000001';
const ANA_ADDRESS = 'b1000000-0000-4000-8000-000000000002';
const ANA_FAR = 'b1000000-0000-4000-8000-000000000003';

const seed = `
  insert into operating_sites (id, slug, display_name, order_prefix) values
    ('${SITE}', 'prueba-uno', 'Prueba Uno', 'PRU1'), ('${OTHER_SITE}', 'prueba-dos', 'Prueba Dos', 'PRU2');
  insert into geographic_zones (id, operating_site_id, slug, display_name) values
    ('${ZONE}', '${SITE}', 'centro', 'Centro'), ('${OTHER_ZONE}', '${OTHER_SITE}', 'palermo', 'Palermo');
  insert into customers (id, display_name) values
    ('${NN}', 'nn'), ('${ANA}', 'Ana Prueba'), ('${SIN_DOMICILIO}', 'Beto Prueba');
  insert into customer_addresses (id, customer_id, label, written_address, unit, geographic_zone_id, "primary") values
    ('${NN_ADDRESS}', '${NN}', 'Casa', 'nnnnn445', null, '${ZONE}', true),
    ('${ANA_ADDRESS}', '${ANA}', 'Casa', 'Mitre 100, Neuquén', '4° A', '${ZONE}', true),
    ('${ANA_FAR}', '${ANA}', 'Trabajo', 'Santa Fe 2000, CABA', null, '${OTHER_ZONE}', false);
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
  const service = new PostgresOperationsService(db, {
    geocode: () => Promise.resolve([]),
    key: 'x',
  });
  const order = (await service.createOrder(
    {
      customerId: NN,
      deliveryAddress: '',
      deliveryAddressId: NN_ADDRESS,
      deliveryDate: '2026-10-18',
      dietaryInstructions: [],
      items: [{ offeringId: OFFERING, quantityUnits: 1 }],
      menuId: MENU,
      operatingSiteId: SITE,
      paymentExpectation: 'Efectivo',
      source: 'manual',
    },
    contexto,
  )) as Pedido;
  return { client, order, service };
}

interface Pedido {
  customer: { displayName: string; id: string };
  deliveryAddress: string;
  deliveryAddressId: string | null;
  deliveryAddressLine2: string | null;
  id: string;
  items: unknown[];
  totalMinor: number;
}

const contexto = { correlationId: 'c', requestId: 'r', source: 'test' };

describe('cambiar el cliente de un pedido', () => {
  it('pasa al cliente nuevo con su domicilio principal y conserva platos y precio', async () => {
    const { client, order, service } = await base();

    const cambiado = (await service.updateOrder(
      order.id,
      { customerId: ANA },
      false,
      contexto,
    )) as Pedido;

    expect(cambiado.customer).toMatchObject({ displayName: 'Ana Prueba', id: ANA });
    expect(cambiado).toMatchObject({
      deliveryAddress: 'Mitre 100, Neuquén',
      deliveryAddressId: ANA_ADDRESS,
      deliveryAddressLine2: '4° A',
      totalMinor: order.totalMinor,
    });
    expect(cambiado.items).toHaveLength(order.items.length);

    // Queda la revisión con el pedido como estaba, y la auditoría con los dos clientes.
    const revisions = await client.query<{ snapshot: { customer: { id: string } } }>(
      `select snapshot from order_revisions where order_id = '${order.id}'`,
    );
    expect(revisions.rows[0]?.snapshot.customer.id).toBe(NN);
    const audit = await client.query<{
      after: { customerId: string };
      before: { customerId: string };
    }>(
      `select after, before from audit_events where entity_id = '${order.id}' and action = 'order.updated'`,
    );
    expect(audit.rows[0]).toMatchObject({ after: { customerId: ANA }, before: { customerId: NN } });
  });

  it('acepta un domicilio elegido del cliente nuevo, pero no uno de otra ciudad', async () => {
    const { order, service } = await base();

    await expect(
      service.updateOrder(
        order.id,
        { customerId: ANA, deliveryAddressId: ANA_FAR },
        false,
        contexto,
      ),
    ).rejects.toThrow(/otra ciudad/);
    // El domicilio del cliente viejo no vale para el nuevo.
    await expect(
      service.updateOrder(
        order.id,
        { customerId: ANA, deliveryAddressId: NN_ADDRESS },
        false,
        contexto,
      ),
    ).rejects.toThrow(/domicilio activo/);
  });

  it('sin domicilio del cliente nuevo pide la dirección; escrita, la usa', async () => {
    const { order, service } = await base();

    await expect(
      service.updateOrder(order.id, { customerId: SIN_DOMICILIO }, false, contexto),
    ).rejects.toThrow(/no tiene domicilio/);

    const cambiado = (await service.updateOrder(
      order.id,
      { customerId: SIN_DOMICILIO, deliveryAddress: 'Belgrano 50, Neuquén' },
      false,
      contexto,
    )) as Pedido;
    expect(cambiado.customer.id).toBe(SIN_DOMICILIO);
    expect(cambiado.deliveryAddress).toBe('Belgrano 50, Neuquén');
    // Nunca queda atado al domicilio del cliente anterior.
    expect(cambiado.deliveryAddressId).not.toBe(NN_ADDRESS);
  });
});
