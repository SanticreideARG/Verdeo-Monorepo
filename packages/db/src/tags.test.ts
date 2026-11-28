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

const CIPO = 'a0000000-0000-4000-8000-000000000009';
const CORDOBA = 'a0000000-0000-4000-8000-000000000010';
const CUSTOMER = 'c0000000-0000-4000-8000-000000000001';
const CYCLE = 'd0000000-0000-4000-8000-000000000001';
const MENU = 'e0000000-0000-4000-8000-000000000001';
const ORDER_CIPO = 'b0000000-0000-4000-8000-000000000001';
const ORDER_CORDOBA = 'b0000000-0000-4000-8000-000000000002';

const seed = `
  insert into operating_sites (id, slug, display_name, order_prefix)
  values ('${CIPO}', 'cipolletti', 'Cipolletti', 'CIP'), ('${CORDOBA}', 'cordoba', 'Córdoba', 'COR');
  insert into customers (id, display_name) values ('${CUSTOMER}', 'María Pérez');
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
  values ('${CYCLE}', 'Semana 1', '2126-01-01T12:00:00Z', '2126-01-06T23:00:00Z',
          '2126-01-07T22:00:00Z');
  insert into weekly_menus (id, sales_cycle_id, status) values ('${MENU}', '${CYCLE}', 'PUBLISHED');
  insert into orders (id, public_number, customer_id, sales_cycle_id, weekly_menu_id,
                      operating_site_id, delivery_date, delivery_address_snapshot, total_minor, source,
                      payment_expectation)
  values ('${ORDER_CIPO}', 'CIP-1', '${CUSTOMER}', '${CYCLE}', '${MENU}', '${CIPO}',
          '2126-01-08', 'Calle 1', 0, 'manual', 'Efectivo'),
         ('${ORDER_CORDOBA}', 'COR-1', '${CUSTOMER}', '${CYCLE}', '${MENU}', '${CORDOBA}',
          '2126-01-08', 'Calle 2', 0, 'manual', 'Efectivo');
`;

const CONTEXT = { correlationId: 'test', requestId: 'test', source: 'test' };

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function sembrada() {
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
  return new PostgresOperationsService(
    drizzle(client, { schema }) as unknown as Database,
    {
      key: 'test',
      resolve: () => Promise.resolve({ candidates: [], status: 'NO_MATCH' }),
    } as never,
  );
}

async function tagsOf(operations: PostgresOperationsService, orderId: string) {
  const order = await operations.getOrder(orderId);
  return order.tags.map((tag) => [tag.name, tag.fromCustomer]);
}

describe('tags personalizables', () => {
  it('la migración trae "Sin semillas"', async () => {
    const operations = await sembrada();
    expect((await operations.listTags()).map((tag) => tag.name)).toEqual(['Sin semillas']);
  });

  it('el tag del cliente marca sus pedidos; el del pedido, sólo ese', async () => {
    const operations = await sembrada();
    const [semillas] = await operations.listTags();
    const urgente = await operations.saveTag(
      null,
      { name: 'Urgente', appliesTo: 'ORDER' },
      CONTEXT,
    );

    await operations.setTags({ customerId: CUSTOMER }, [semillas!.id], CONTEXT);
    await operations.setTags({ orderId: ORDER_CIPO }, [urgente.id], CONTEXT);

    expect(await tagsOf(operations, ORDER_CIPO)).toEqual([
      ['Sin semillas', true],
      ['Urgente', false],
    ]);
    expect(await tagsOf(operations, ORDER_CORDOBA)).toEqual([['Sin semillas', true]]);

    // Sacárselo al cliente lo saca de todos sus pedidos.
    await operations.setTags({ customerId: CUSTOMER }, [], CONTEXT);
    expect(await tagsOf(operations, ORDER_CORDOBA)).toEqual([]);
  });

  it('un tag con ciudades sólo se ve y se pone en esas ciudades', async () => {
    const operations = await sembrada();
    const soloCipo = await operations.saveTag(null, { name: 'Sin TACC', siteIds: [CIPO] }, CONTEXT);
    await operations.setTags({ customerId: CUSTOMER }, [soloCipo.id], CONTEXT);

    expect(await tagsOf(operations, ORDER_CIPO)).toEqual([['Sin TACC', true]]);
    expect(await tagsOf(operations, ORDER_CORDOBA)).toEqual([]);
    await expect(
      operations.setTags({ orderId: ORDER_CORDOBA }, [soloCipo.id], CONTEXT),
    ).rejects.toThrow(/ciudad/);
  });

  it('respeta a qué se aplica y no deja repetir el nombre', async () => {
    const operations = await sembrada();
    const deCliente = await operations.saveTag(
      null,
      { name: 'Mayorista', appliesTo: 'CUSTOMER' },
      CONTEXT,
    );
    await expect(
      operations.setTags({ orderId: ORDER_CIPO }, [deCliente.id], CONTEXT),
    ).rejects.toThrow(/sólo a clientes/);
    await expect(operations.saveTag(null, { name: 'sin semillas' }, CONTEXT)).rejects.toThrow(
      /Ya hay un tag/,
    );
  });
});
