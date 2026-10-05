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
const ZONE = '0d000000-0000-4000-8000-000000000001';
const CUSTOMER = 'c0000000-0000-4000-8000-000000000001';
const ADDRESS = '0c000000-0000-4000-8000-000000000001';
const CYCLE = 'd0000000-0000-4000-8000-000000000001';
const MENU = 'e0000000-0000-4000-8000-000000000001';
const ORDER = '0a000000-0000-4000-8000-000000000001';
const OTRO = '0a000000-0000-4000-8000-000000000002';
const ROUTE = '0b000000-0000-4000-8000-000000000011';
const COLLECTION = '0b000000-0000-4000-8000-000000000031';
const USER = 'f0000000-0000-4000-8000-000000000001';
const FAMILY = '0b000000-0000-4000-8000-000000000001';
const SIZE = '0e000000-0000-4000-8000-000000000001';
const VARIANT = '0f000000-0000-4000-8000-000000000001';

/*
 * El pedido de la semilla tiene algo en cada barrera `restrict` que lo bloquea —parada de reparto,
 * cobro, rendición del cobro— más lo que cuelga por `cascade`. Sin eso el test pasaría igual con un
 * orden de borrado equivocado, que es justo lo que tiene que detectar.
 *
 * `OTRO` existe para comprobar que el borrado es de uno y no de todos: un `delete` sin `where` sobre
 * cualquiera de las tablas hijas se llevaría puesto al vecino sin que nada lo note.
 */
const seed = `
  insert into operating_sites (id, slug, display_name, order_prefix, origin_latitude, origin_longitude)
  values ('${SITE}', 'cipolletti', 'Cipolletti', 'CIP', 0, 0);
  insert into geographic_zones (id, operating_site_id, slug, display_name)
  values ('${ZONE}', '${SITE}', 'centro', 'Centro');
  insert into users (id, display_name) values ('${USER}', 'Isabella');
  insert into customers (id, display_name) values ('${CUSTOMER}', 'Ana Gómez');
  insert into customer_addresses (id, customer_id, label, written_address, geographic_zone_id)
  values ('${ADDRESS}', '${CUSTOMER}', 'Casa', 'Calle 1', '${ZONE}');
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
  values ('${CYCLE}', 'Semana 34', '2026-08-20T12:00:00Z', '2026-08-25T23:00:00Z',
          '2026-08-26T22:00:00Z');
  insert into weekly_menus (id, sales_cycle_id, status) values ('${MENU}', '${CYCLE}', 'PUBLISHED');
  insert into orders (id, public_number, customer_id, sales_cycle_id, weekly_menu_id, source,
                      status, delivery_date, delivery_address_id, delivery_address_snapshot,
                      payment_expectation, total_minor, operating_site_id)
  values
    ('${ORDER}', 'CIP-00001', '${CUSTOMER}', '${CYCLE}', '${MENU}', 'web', 'DELIVERED',
     '2026-08-26', '${ADDRESS}', 'Calle 1', 'Efectivo', 25000, '${SITE}'),
    ('${OTRO}', 'CIP-00002', '${CUSTOMER}', '${CYCLE}', '${MENU}', 'web', 'CONFIRMED',
     '2026-08-26', '${ADDRESS}', 'Calle 1', 'Efectivo', 30000, '${SITE}');

  insert into product_families (id, code, display_name, kind)
  values ('${FAMILY}', 'keto', 'Menú Keto', 'FIXED');
  insert into product_sizes (id, code, display_name) values ('${SIZE}', '400', '400 g');
  insert into product_variants (id, product_family_id, product_size_id, code, display_name)
  values ('${VARIANT}', '${FAMILY}', '${SIZE}', 'keto-400', 'Keto 400');
  insert into order_items (order_id, product_variant_id, product_name_snapshot, variant_snapshot,
                           quantity_units, unit_price_minor, total_minor)
  values
    ('${ORDER}', '${VARIANT}', 'Menú Keto', '400', 1, 25000, 25000),
    ('${OTRO}', '${VARIANT}', 'Menú Keto', '400', 1, 30000, 30000);

  insert into delivery_routes (id, operating_site_id, delivery_date, status)
  values ('${ROUTE}', '${SITE}', '2026-08-26', 'published');
  insert into delivery_stops (route_id, order_id, sequence, status)
  values ('${ROUTE}', '${ORDER}', 1, 'delivered'), ('${ROUTE}', '${OTRO}', 2, 'pending');

  insert into cash_collections (id, order_id, amount_minor, method, collected_by_user_id)
  values ('${COLLECTION}', '${ORDER}', 25000, 'efectivo', '${USER}');
  insert into cash_settlements (collection_id, amount_minor, settled_by_user_id, received_by_user_id)
  values ('${COLLECTION}', 25000, '${USER}', '${USER}');

  insert into manual_notices (customer_id, order_id, body, status, template_key)
  values ('${CUSTOMER}', '${ORDER}', 'Hola Ana', 'sent', 'aviso-semanal');
`;

const CONTEXT = {
  actorUserId: USER,
  correlationId: 'test',
  requestId: 'test',
  source: 'test',
};

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function sembrada(): Promise<{ client: PGlite; operations: PostgresOperationsService }> {
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
  return {
    client,
    operations: new PostgresOperationsService(
      drizzle(client, { schema }) as unknown as Database,
      {
        key: 'test',
        resolve: () => Promise.resolve({ candidates: [], status: 'NO_MATCH' }),
      } as never,
    ),
  };
}

async function cuantos(client: PGlite, sql: string): Promise<number> {
  const result = await client.query<{ n: number }>(sql);
  return result.rows[0]?.n ?? 0;
}

describe('eliminar un pedido definitivamente', () => {
  it('borra el pedido aunque tenga parada, cobro y rendición', async () => {
    const { client, operations } = await sembrada();

    const resultado = await operations.deleteOrder(ORDER, 'pedido de prueba', CONTEXT);

    expect(resultado).toEqual({ collectedMinor: 25000, publicNumber: 'CIP-00001' });
    expect(
      await cuantos(client, `select count(*)::int as n from orders where id = '${ORDER}'`),
    ).toBe(0);
  });

  /*
   * El vecino tiene parada, ítems y todo lo demás. Un `delete` sin `where` en cualquiera de las
   * tablas hijas se lo llevaría puesto sin que nada lo note hasta que alguien busque su pedido.
   */
  it('no toca los demás pedidos', async () => {
    const { client, operations } = await sembrada();

    await operations.deleteOrder(ORDER, 'pedido de prueba', CONTEXT);

    expect(
      await cuantos(client, `select count(*)::int as n from orders where id = '${OTRO}'`),
    ).toBe(1);
    expect(
      await cuantos(
        client,
        `select count(*)::int as n from delivery_stops where order_id = '${OTRO}'`,
      ),
    ).toBe(1);
    expect(
      await cuantos(
        client,
        `select count(*)::int as n from order_items where order_id = '${OTRO}'`,
      ),
    ).toBe(1);
  });

  it('se lleva lo que colgaba del pedido borrado', async () => {
    const { client, operations } = await sembrada();

    await operations.deleteOrder(ORDER, 'pedido de prueba', CONTEXT);

    for (const tabla of ['order_items', 'delivery_stops', 'cash_collections', 'manual_notices']) {
      expect(
        await cuantos(
          client,
          `select count(*)::int as n from ${tabla} where order_id = '${ORDER}'`,
        ),
      ).toBe(0);
    }
    expect(await cuantos(client, 'select count(*)::int as n from cash_settlements')).toBe(0);
  });

  /*
   * Lo único que queda para explicar qué pasó. Por eso lleva la foto en el cuerpo y no sólo el
   * `entityId`: después del borrado no hay fila a la que apuntar, y "se borró el pedido tal id" no
   * responde la única pregunta que alguien va a hacer, que es cuál era.
   */
  it('deja en la auditoría qué se borró, con cuánta plata y con qué motivo', async () => {
    const { client, operations } = await sembrada();

    await operations.deleteOrder(ORDER, 'quedó de las pruebas', CONTEXT);

    const evento = await client.query<{ before: string; metadata: string }>(
      `select before::text, metadata::text from audit_events where action = 'order.deleted'`,
    );
    const before = JSON.parse(evento.rows[0]?.before ?? '{}') as Record<string, unknown>;
    expect(before).toMatchObject({
      collectedMinor: 25000,
      customerDisplayName: 'Ana Gómez',
      publicNumber: 'CIP-00001',
      status: 'DELIVERED',
      totalMinor: 25000,
    });
    expect(evento.rows[0]?.metadata).toContain('quedó de las pruebas');
  });

  it('avisa cuando el pedido no existe', async () => {
    const { operations } = await sembrada();

    await expect(
      operations.deleteOrder('0a000000-0000-4000-8000-0000000000ff', 'no está', CONTEXT),
    ).rejects.toThrow();
  });
});
