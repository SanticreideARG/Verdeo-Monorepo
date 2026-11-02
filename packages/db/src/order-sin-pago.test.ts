import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from './index.js';
import { PostgresOperationsService } from './repositories/postgres-operations-service.js';
import { PostgresPaymentsService } from './repositories/postgres-payments-service.js';
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

describe('el medio de pago Sin pago', () => {
  const total = async (client: PGlite, id: string) => {
    const { rows } = await client.query<{ item: number; total: number }>(
      `select o.total_minor as total, i.total_minor as item
       from orders o join order_items i on i.order_id = o.id where o.id = '${id}'`,
    );
    return rows[0];
  };

  const pedidoNuevo = (paymentExpectation: string, source = 'manual') => ({
    customerId: NN,
    deliveryAddress: '',
    deliveryAddressId: NN_ADDRESS,
    deliveryDate: '2026-10-18',
    dietaryInstructions: [],
    items: [{ offeringId: OFFERING, quantityUnits: 2 }],
    menuId: MENU,
    operatingSiteId: SITE,
    paymentExpectation,
    source,
  });

  it('al crear da $0 y se guarda por código, aunque llegue por el nombre', async () => {
    const { client, service } = await base();
    const creado = (await service.createOrder(pedidoNuevo('Sin pago'), contexto)) as unknown as {
      id: string;
      paymentExpectation: string;
      totalMinor: number;
    };
    expect(creado.paymentExpectation).toBe('sin_pago');
    expect(await total(client, creado.id)).toEqual({ item: 0, total: 0 });
  });

  it('reconoce el nombre aunque se lo hayan cambiado', async () => {
    const { client, service } = await base();
    await client.exec(`update payment_methods set display_name = 'Regalo' where code = 'sin_pago'`);
    const creado = (await service.createOrder(pedidoNuevo('regalo'), contexto)) as unknown as {
      paymentExpectation: string;
    };
    expect(creado.paymentExpectation).toBe('sin_pago');
  });

  it('un pedido de la web no puede venir sin pago', async () => {
    const { service } = await base();
    await expect(
      service.createOrder(pedidoNuevo('sin_pago', 'web') as never, contexto),
    ).rejects.toThrow('no está disponible');
  });

  it('entrar borra el cobro y lleva a 0; salir vuelve al precio del menú con los mismos renglones', async () => {
    const { client, order, service } = await base();
    await service.setOrderPaid(order.id, true, contexto as never);
    const antes = await client.query<{ id: string }>(
      `select id from order_items where order_id = '${order.id}'`,
    );
    expect(await total(client, order.id)).toEqual({ item: 7000000, total: 7000000 });

    await service.updateOrder(order.id, { paymentExpectation: 'Sin pago' }, false, contexto);
    expect(await total(client, order.id)).toEqual({ item: 0, total: 0 });
    const { rows } = await client.query<{ paid_at: string | null }>(
      `select paid_at from orders where id = '${order.id}'`,
    );
    expect(rows[0]?.paid_at).toBeNull();

    await service.updateOrder(order.id, { paymentExpectation: 'Efectivo' }, false, contexto);
    expect(await total(client, order.id)).toEqual({ item: 7000000, total: 7000000 });
    const despues = await client.query<{ id: string }>(
      `select id from order_items where order_id = '${order.id}'`,
    );
    expect(despues.rows).toEqual(antes.rows);
  });

  it('editar los platos de un pedido sin pago lo deja en $0', async () => {
    const { client, order, service } = await base();
    await service.updateOrder(order.id, { paymentExpectation: 'sin_pago' }, false, contexto);
    await service.updateOrder(
      order.id,
      { items: [{ offeringId: OFFERING, quantityUnits: 3 }] },
      true,
      contexto,
    );
    expect(await total(client, order.id)).toEqual({ item: 0, total: 0 });
  });

  it('no se puede marcar como cobrado', async () => {
    const { order, service } = await base();
    await service.updateOrder(order.id, { paymentExpectation: 'sin_pago' }, false, contexto);
    await expect(service.setOrderPaid(order.id, true, contexto as never)).rejects.toThrow(
      'no se cobra',
    );
  });

  it('en Ajustes no se borra ni se desactiva: sólo cambia el nombre', async () => {
    const { client } = await base();
    const db = drizzle(client, { schema }) as unknown as Database;
    const payments = new PostgresPaymentsService(db);
    await payments.updatePaymentMethods(
      [{ active: true, code: 'efectivo', displayName: 'Efectivo', isCash: true }],
      contexto,
    );
    await payments.updatePaymentMethods(
      [{ active: false, code: 'sin_pago', displayName: 'Cortesía', isCash: true }],
      contexto,
    );
    const { rows } = await client.query<{
      active: boolean;
      display_name: string;
      is_cash: boolean;
    }>(`select active, display_name, is_cash from payment_methods where code = 'sin_pago'`);
    expect(rows).toEqual([{ active: true, display_name: 'Cortesía', is_cash: false }]);
  });
});
