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

const CYCLE_B = 'd0000000-0000-4000-8000-000000000002';
const MENU_B = 'e0000000-0000-4000-8000-000000000002';
const OFFERING_B = 'f3000000-0000-4000-8000-000000000002';

// El período B, el siguiente, con el mismo Keto 250 en su menú.
const seedB = `
  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
  values ('${CYCLE_B}', 'Octubre 4', '2126-10-19T12:00:00Z', '2126-10-24T12:00:00Z',
          '2126-10-26T02:15:00Z');
  insert into weekly_menus (id, sales_cycle_id, status) values ('${MENU_B}', '${CYCLE_B}', 'PUBLISHED');
  insert into weekly_menu_prices (weekly_menu_id, product_size_id, unit_price_minor)
  values ('${MENU_B}', '${SIZE}', 7500000);
  insert into weekly_menu_offerings (id, weekly_menu_id, product_variant_id)
  values ('${OFFERING_B}', '${MENU_B}', '${VARIANT}');
`;

describe('sobrante del período anterior', () => {
  it('al cerrar A pasa a B: se vende en B, no se cocina, y A cierra en cero', async () => {
    const { client, service } = await base();
    await client.exec(seedB);
    // A cocinó 4 Keto 250 de más y no los vendió.
    await service.setProductionStock(
      CYCLE,
      [{ familyName: 'Keto', quantityUnits: 4, variantName: '250' }],
      contexto,
    );

    const closed = await service.setCycleClosed(CYCLE, true, contexto, true);
    expect(closed).toMatchObject({
      carriedUnits: 4,
      nextCycleAlias: 'Octubre 4',
      writtenOffUnits: 0,
    });

    // En A no queda nada disponible.
    const reportA = await service.surplusReport(CYCLE);
    expect(reportA.items.find((item) => item.familyName === 'Keto')?.disponible).toBe(0);

    // En B es sobrante: se ve, se puede vender, y no suma a lo que hay que cocinar.
    expect(await service.listCarryOver(CYCLE_B)).toEqual([
      { familyName: 'Keto', fromCycleAlias: 'Octubre 3', quantityUnits: 4, variantName: '250' },
    ]);
    expect((await service.kitchenSummary(CYCLE_B)).stock).toEqual([]);
    const reportB = await service.surplusReport(CYCLE_B);
    expect(reportB.items.find((item) => item.familyName === 'Keto')).toMatchObject({
      disponible: 4,
      sobrante: 4,
    });
    await service.createOrder(
      {
        ...pedido('2126-10-26'),
        // Confirmado: un borrador todavía no descuenta del stock.
        initialStatus: 'CONFIRMED' as const,
        items: [{ offeringId: OFFERING_B, quantityUnits: 3 }],
        menuId: MENU_B,
        source: 'opportunity_sale',
      },
      contexto,
    );
    await expect(
      service.createOrder(
        {
          ...pedido('2126-10-26'),
          items: [{ offeringId: OFFERING_B, quantityUnits: 2 }],
          menuId: MENU_B,
          source: 'opportunity_sale',
        },
        contexto,
      ),
    ).rejects.toThrow(/quedan 1/);
  });

  it('el stock propio de B y el sobrante se cargan por separado', async () => {
    const { client, service } = await base();
    await client.exec(seedB);
    await service.setCarryOver(
      CYCLE_B,
      [{ familyName: 'Keto', quantityUnits: 1, variantName: '250' }],
      contexto,
    );
    await service.setProductionStock(
      CYCLE_B,
      [{ familyName: 'Keto', quantityUnits: 2, variantName: '250' }],
      contexto,
    );

    // Guardar el stock propio no borra el sobrante, y la cocina sólo ve el propio.
    expect(await service.listCarryOver(CYCLE_B)).toHaveLength(1);
    expect((await service.kitchenSummary(CYCLE_B)).stock).toEqual([
      { familyName: 'Keto', quantityUnits: 2, variantName: '250' },
    ]);
  });

  it('sin período siguiente, avisa en vez de perder el sobrante', async () => {
    const { service } = await base();
    await service.setProductionStock(
      CYCLE,
      [{ familyName: 'Keto', quantityUnits: 4, variantName: '250' }],
      contexto,
    );

    await expect(service.setCycleClosed(CYCLE, true, contexto, true)).rejects.toThrow(
      /No hay un período siguiente/,
    );
  });
});
