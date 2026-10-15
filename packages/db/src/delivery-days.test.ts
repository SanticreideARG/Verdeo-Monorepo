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

describe('días de reparto', () => {
  it('sin días configurados se reparte el día del cierre, como siempre', async () => {
    const { service } = await base();
    expect(await service.deliveryOptionsForMenu(MENU, SITE)).toEqual({
      defaultDate: '2026-10-18',
      options: [{ date: '2026-10-18', weekday: 0 }],
    });
    const order = (await service.createOrder(pedido('2026-10-25'), contexto)) as {
      deliveryDate: string;
    };
    expect(order.deliveryDate).toBe('2026-10-18');
  });

  it('con días configurados el pedido elige uno, y una fecha que no es de reparto va a la de siempre', async () => {
    const { client, service } = await base();
    // Sábado y domingo, el de siempre el domingo.
    await service.updateDeliverySettings(SITE, { defaultWeekday: 0, weekdays: [6, 0] }, contexto);

    expect(await service.deliveryOptionsForMenu(MENU, SITE)).toEqual({
      defaultDate: '2026-10-18',
      options: [
        { date: '2026-10-18', weekday: 0 },
        { date: '2026-10-24', weekday: 6 },
      ],
    });
    const sabado = (await service.createOrder(pedido('2026-10-24'), contexto)) as {
      deliveryDate: string;
    };
    expect(sabado.deliveryDate).toBe('2026-10-24');
    const otra = (await service.createOrder(pedido('2026-10-21'), contexto)) as {
      deliveryDate: string;
    };
    expect(otra.deliveryDate).toBe('2026-10-18');

    const { rows } = await client.query<{ action: string }>(`select action from audit_events`);
    expect(rows.map((row) => row.action)).toContain('delivery.settings_updated');
  });

  it('resume lo que hay que despachar en el día y dice cuál es el próximo', async () => {
    const { service } = await base();
    await service.updateDeliverySettings(SITE, { defaultWeekday: 0, weekdays: [6, 0] }, contexto);
    await service.createOrder(pedido('2026-10-18'), contexto);
    await service.createOrder(pedido('2026-10-18'), contexto);
    await service.createOrder(pedido('2026-10-24'), contexto);

    expect(await service.dispatchSummary('2026-10-18', SITE)).toMatchObject({
      date: '2026-10-18',
      drafts: 2,
      next: { date: '2026-10-24', total: 1 },
      total: 2,
      unlocated: 2,
      runs: [{ label: 'Domingo 18' }],
      unrouted: 2,
    });
    expect(await service.dispatchSummary('2026-10-17', SITE)).toMatchObject({
      next: { date: '2026-10-18', total: 2 },
      total: 0,
    });
  });
});
