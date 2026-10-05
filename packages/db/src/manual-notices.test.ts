import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import { PostgresOperationsService } from './repositories/postgres-operations-service.js';
import type { Database } from './index.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const SITE = 'a0000000-0000-4000-8000-000000000009';
const CUSTOMER_A = 'c0000000-0000-4000-8000-000000000001';
const CUSTOMER_B = 'c0000000-0000-4000-8000-000000000002';
const CYCLE = 'd0000000-0000-4000-8000-000000000001';
const MENU = 'e0000000-0000-4000-8000-000000000001';
const ADDRESS_A = '0c000000-0000-4000-8000-000000000001';
const ADDRESS_B = '0c000000-0000-4000-8000-000000000002';
const ZONE = '0d000000-0000-4000-8000-000000000001';
const ORDER_A = '0a000000-0000-4000-8000-000000000001';
const ORDER_B = '0a000000-0000-4000-8000-000000000002';
const ORDER_DRAFT = '0a000000-0000-4000-8000-000000000003';
const USER = 'f0000000-0000-4000-8000-000000000001';

const seed = `
  insert into operating_sites (id, slug, display_name, order_prefix, origin_latitude, origin_longitude)
  values ('${SITE}', 'cipolletti', 'Cipolletti', 'CIP', 0, 0);
  insert into geographic_zones (id, operating_site_id, slug, display_name)
  values ('${ZONE}', '${SITE}', 'centro', 'Centro');
  insert into users (id, display_name) values ('${USER}', 'Isabella');
  insert into customers (id, display_name) values
    ('${CUSTOMER_A}', 'Ana Gómez'),
    ('${CUSTOMER_B}', 'Bruno Díaz');
  insert into customer_identities (customer_id, type, value_normalized, value_display)
  values ('${CUSTOMER_A}', 'whatsapp', '5492995550101', '+54 9 299 555 0101');
  insert into customer_addresses (id, customer_id, label, written_address, geographic_zone_id,
                                  operational_zone, delivery_window)
  values
    ('${ADDRESS_A}', '${CUSTOMER_A}', 'Casa', 'Calle 1', '${ZONE}', 'Centro', 'de 18 a 20'),
    ('${ADDRESS_B}', '${CUSTOMER_B}', 'Casa', 'Calle 2', '${ZONE}', 'Centro', null);
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
  values ('${CYCLE}', 'Semana 34', '2026-08-20T12:00:00Z', '2026-08-25T23:00:00Z',
          '2026-08-26T22:00:00Z');
  insert into weekly_menus (id, sales_cycle_id, status)
  values ('${MENU}', '${CYCLE}', 'PUBLISHED');
  insert into orders (id, public_number, customer_id, sales_cycle_id, weekly_menu_id, source,
                      status, delivery_date, delivery_address_id, delivery_address_snapshot,
                      payment_expectation, total_minor, operating_site_id)
  values
    ('${ORDER_A}', 'CIP-00001', '${CUSTOMER_A}', '${CYCLE}', '${MENU}', 'web', 'CONFIRMED',
     '2026-08-26', '${ADDRESS_A}', 'Calle 1', 'Efectivo', 25000, '${SITE}'),
    ('${ORDER_B}', 'CIP-00002', '${CUSTOMER_B}', '${CYCLE}', '${MENU}', 'web', 'CONFIRMED',
     '2026-08-26', '${ADDRESS_B}', 'Calle 2', 'Transferencia', 30000, '${SITE}'),
    ('${ORDER_DRAFT}', 'CIP-00003', '${CUSTOMER_B}', '${CYCLE}', '${MENU}', 'web', 'DRAFT',
     '2026-08-26', '${ADDRESS_B}', 'Calle 2', 'Efectivo', 30000, '${SITE}');
  insert into message_templates (key, display_name, body, variables)
  values ('aviso-semanal', 'Aviso semanal',
          'Hola {{ cliente.nombre }}, tu pedido {{ pedido.numero }} llega {{ reparto.ventana }}.',
          '["cliente.nombre", "pedido.numero", "reparto.ventana"]'::jsonb);
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

async function service(): Promise<{ client: PGlite; operations: PostgresOperationsService }> {
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
  const operations = new PostgresOperationsService(
    drizzle(client, { schema }) as unknown as Database,
    {
      key: 'test',
      resolve: () => Promise.resolve({ candidates: [], status: 'NO_MATCH' }),
    } as never,
  );
  return { client, operations };
}

describe('cola de avisos', () => {
  it('resuelve el texto de cada pedido con los datos de ese pedido', async () => {
    const { operations } = await service();

    const queue = await operations.listManualNotices({
      cycleId: CYCLE,
      operatingSiteId: SITE,
      templateKey: 'aviso-semanal',
    });

    const ana = queue.items.find((item) => item.orderPublicNumber === 'CIP-00001');
    expect(ana?.body).toBe('Hola Ana Gómez, tu pedido CIP-00001 llega de 18 a 20.');
    expect(ana?.phone).toBe('+54 9 299 555 0101');
    expect(ana?.status).toBe('pending');
  });

  /*
   * Bruno no tiene ventana de entrega cargada. El renglón se arma igual, sin el `{{ … }}` escrito:
   * un mensaje con una variable sin reemplazar es peor que un mensaje que no menciona el horario.
   */
  it('no deja la variable escrita cuando el dato no está cargado', async () => {
    const { operations } = await service();

    const queue = await operations.listManualNotices({
      cycleId: CYCLE,
      operatingSiteId: SITE,
      templateKey: 'aviso-semanal',
    });

    const bruno = queue.items.find((item) => item.orderPublicNumber === 'CIP-00002');
    expect(bruno?.body).toBe('Hola Bruno Díaz, tu pedido CIP-00002 llega .');
    // Sin WhatsApp cargado: la pantalla ofrece copiar el texto en lugar de abrir el chat.
    expect(bruno?.phone).toBeNull();
  });

  /*
   * Un borrador no entra. Puede no existir mañana, y avisarle a alguien de un pedido que después no
   * se toma es peor que no avisarle nada.
   */
  it('deja afuera los borradores', async () => {
    const { operations } = await service();

    const queue = await operations.listManualNotices({
      cycleId: CYCLE,
      operatingSiteId: SITE,
      templateKey: 'aviso-semanal',
    });

    expect(queue.items.map((item) => item.orderPublicNumber).sort()).toEqual([
      'CIP-00001',
      'CIP-00002',
    ]);
  });

  it('marca un aviso como mandado y deja de contarlo como pendiente', async () => {
    const { operations } = await service();

    await operations.markManualNotice(
      { body: 'Hola Ana', orderId: ORDER_A, status: 'sent', templateKey: 'aviso-semanal' },
      CONTEXT,
    );
    const queue = await operations.listManualNotices({
      cycleId: CYCLE,
      operatingSiteId: SITE,
      templateKey: 'aviso-semanal',
    });

    const ana = queue.items.find((item) => item.orderId === ORDER_A);
    expect(ana?.status).toBe('sent');
    expect(ana?.sentByDisplayName).toBe('Isabella');
    expect(ana?.sentAt).not.toBeNull();
  });

  /*
   * Marcar dos veces reemplaza, no acumula. Dos filas para el mismo par pedido/plantilla obligarían
   * a la pantalla a decidir cuál vale, y la respuesta correcta —la última— es justo la que se puede
   * resolver acá una sola vez.
   */
  it('reemplaza el registro anterior al volver a marcar el mismo aviso', async () => {
    const { operations } = await service();

    await operations.markManualNotice(
      { body: 'Hola Ana', orderId: ORDER_A, status: 'skipped', templateKey: 'aviso-semanal' },
      CONTEXT,
    );
    await operations.markManualNotice(
      { body: 'Hola Ana', orderId: ORDER_A, status: 'sent', templateKey: 'aviso-semanal' },
      CONTEXT,
    );

    const queue = await operations.listManualNotices({
      cycleId: CYCLE,
      operatingSiteId: SITE,
      templateKey: 'aviso-semanal',
    });
    expect(queue.items.find((item) => item.orderId === ORDER_A)?.status).toBe('sent');
  });

  it('avisa cuando la plantilla elegida no existe', async () => {
    const { operations } = await service();

    await expect(
      operations.listManualNotices({ operatingSiteId: SITE, templateKey: 'no-existe' }),
    ).rejects.toThrow();
  });

  it('filtra por zona de reparto', async () => {
    const { operations } = await service();

    const centro = await operations.listManualNotices({
      cycleId: CYCLE,
      operatingSiteId: SITE,
      templateKey: 'aviso-semanal',
      zone: 'Centro',
    });
    const sur = await operations.listManualNotices({
      cycleId: CYCLE,
      operatingSiteId: SITE,
      templateKey: 'aviso-semanal',
      zone: 'Sur',
    });

    expect(centro.items).toHaveLength(2);
    expect(sur.items).toHaveLength(0);
  });

  it('guarda el texto tal como se mandó, y no una referencia a la plantilla', async () => {
    const { client, operations } = await service();

    await operations.markManualNotice(
      {
        body: 'Hola Bruno Díaz, tu pedido CIP-00002 llega el miércoles.',
        orderId: ORDER_B,
        status: 'sent',
        templateKey: 'aviso-semanal',
      },
      CONTEXT,
    );

    const guardado = await client.query<{ body: string; phone: string | null }>(
      'select body, phone from manual_notices where order_id = $1',
      [ORDER_B],
    );
    expect(guardado.rows[0]?.body).toBe('Hola Bruno Díaz, tu pedido CIP-00002 llega el miércoles.');
  });
});
