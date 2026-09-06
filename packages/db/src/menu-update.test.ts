import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import { PostgresOperationsService } from './repositories/postgres-operations-service.js';
import type { Database } from './index.js';
import {
  customers,
  orderItems,
  orders,
  salesCycles,
  weeklyMenuItems,
  weeklyMenuOfferings,
  weeklyMenuPrices,
  weeklyMenus,
} from './schema/index.js';
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
const SITE_A = 'b0000000-0000-4000-8000-000000000201';
const SITE_B = 'b0000000-0000-4000-8000-000000000202';
const CUSTOMER_ID = 'b0000000-0000-4000-8000-000000000301';
const ORDER_ID = 'b0000000-0000-4000-8000-000000000401';

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function seeded(): Promise<{
  client: PGlite;
  db: Database;
  service: PostgresOperationsService;
}> {
  const { client, close: closeDatabase, db } = await migratedDatabase();
  close = closeDatabase;
  await client.exec(`
    insert into operating_sites (id, slug, display_name, order_prefix)
    values
      ('${SITE_A}', 'update-site-a', 'Sitio A', 'USA'),
      ('${SITE_B}', 'update-site-b', 'Sitio B', 'USB');
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

const fixedOffering = (familyName: string, sizeName = '250') => ({
  composable: false,
  dishes: ['A', 'B', 'C', 'D', 'E'],
  familyName,
  sizeName,
});

const menuInputBase = {
  alias: 'Semana 34',
  closeAt: '2026-08-26T22:00:00.000Z',
  openAt: '2026-08-20T12:00:00.000Z',
  partialKitchenCutoffAt: '2026-08-25T23:00:00.000Z',
  prices: [{ currency: 'ARS', mealsPerUnit: 5, sizeName: '250', unitPriceMinor: 25000 }],
};

/** Un pedido mínimo apuntando a una oferta, para ver si el vínculo sobrevive a una reedición. */
async function orderAgainst(db: Database, menuId: string, offeringId: string): Promise<void> {
  const [menu] = await db
    .select({ salesCycleId: weeklyMenus.salesCycleId })
    .from(weeklyMenus)
    .where(eq(weeklyMenus.id, menuId));
  if (!menu) throw new Error('El menú de la prueba no existe');

  await db.insert(customers).values({ displayName: 'Cliente de prueba', id: CUSTOMER_ID });
  await db.insert(orders).values({
    customerId: CUSTOMER_ID,
    deliveryAddressSnapshot: 'Una dirección',
    deliveryDate: '2026-08-26',
    id: ORDER_ID,
    operatingSiteId: SITE_A,
    paymentExpectation: 'transferencia',
    publicNumber: 'TST-00001',
    salesCycleId: menu.salesCycleId,
    source: 'manual',
    totalMinor: 25000,
    weeklyMenuId: menuId,
  });
  await db.insert(orderItems).values({
    offeringId,
    orderId: ORDER_ID,
    productNameSnapshot: 'Real',
    quantityUnits: 1,
    totalMinor: 25000,
    unitPriceMinor: 25000,
    variantSnapshot: '250',
  });
}

describe('updateMenu conserva los vínculos de los pedidos', () => {
  it('mantiene el id de una oferta que sigue en el menú', async () => {
    const { db, service } = await seeded();
    const menu = await service.createMenu(
      { ...menuInputBase, offerings: [fixedOffering('Real')] },
      CONTEXT,
    );

    const [before] = await db
      .select({ id: weeklyMenuOfferings.id })
      .from(weeklyMenuOfferings)
      .where(eq(weeklyMenuOfferings.weeklyMenuId, menu.id));
    if (!before) throw new Error('La oferta recién creada no aparece');
    await orderAgainst(db, menu.id, before.id);

    // Una corrección de carga cualquiera: cambian los platos, la variedad sigue siendo la misma.
    await service.updateMenu(
      menu.id,
      {
        ...menuInputBase,
        offerings: [{ ...fixedOffering('Real'), dishes: ['F', 'G', 'H', 'I', 'J'] }],
      },
      CONTEXT,
    );

    const [after] = await db
      .select({ id: weeklyMenuOfferings.id })
      .from(weeklyMenuOfferings)
      .where(eq(weeklyMenuOfferings.weeklyMenuId, menu.id));
    expect(after?.id).toBe(before.id);

    // Lo que importa: el pedido sigue sabiendo de qué oferta es.
    const [item] = await db
      .select({ offeringId: orderItems.offeringId })
      .from(orderItems)
      .where(eq(orderItems.orderId, ORDER_ID));
    expect(item?.offeringId).toBe(before.id);

    const dishes = await db
      .select({ dishName: weeklyMenuItems.dishName })
      .from(weeklyMenuItems)
      .where(eq(weeklyMenuItems.offeringId, before.id));
    expect(dishes.map((dish) => dish.dishName).sort()).toEqual(['F', 'G', 'H', 'I', 'J']);
  });

  it('borra sólo la variedad que el operador sacó del menú', async () => {
    const { db, service } = await seeded();
    const menu = await service.createMenu(
      { ...menuInputBase, offerings: [fixedOffering('Real'), fixedOffering('Vegetariano')] },
      CONTEXT,
    );
    const before = await db
      .select({ id: weeklyMenuOfferings.id, variantId: weeklyMenuOfferings.productVariantId })
      .from(weeklyMenuOfferings)
      .where(eq(weeklyMenuOfferings.weeklyMenuId, menu.id));
    expect(before).toHaveLength(2);

    await service.updateMenu(
      menu.id,
      { ...menuInputBase, offerings: [fixedOffering('Real')] },
      CONTEXT,
    );

    const after = await db
      .select({ id: weeklyMenuOfferings.id })
      .from(weeklyMenuOfferings)
      .where(eq(weeklyMenuOfferings.weeklyMenuId, menu.id));
    expect(after).toHaveLength(1);
    // La que quedó es la misma fila de antes, no una recreada.
    expect(before.map((row) => row.id)).toContain(after[0]?.id);
  });

  it('borra el precio de un tamaño que ya no se ofrece', async () => {
    const { db, service } = await seeded();
    const twoSizes = {
      ...menuInputBase,
      offerings: [fixedOffering('Real'), fixedOffering('Real', '400')],
      prices: [
        { currency: 'ARS', mealsPerUnit: 5, sizeName: '250', unitPriceMinor: 25000 },
        { currency: 'ARS', mealsPerUnit: 5, sizeName: '400', unitPriceMinor: 40000 },
      ],
    };
    const menu = await service.createMenu(twoSizes, CONTEXT);
    expect(
      await db.select().from(weeklyMenuPrices).where(eq(weeklyMenuPrices.weeklyMenuId, menu.id)),
    ).toHaveLength(2);

    await service.updateMenu(
      menu.id,
      { ...menuInputBase, offerings: [fixedOffering('Real')] },
      CONTEXT,
    );

    expect(
      await db.select().from(weeklyMenuPrices).where(eq(weeklyMenuPrices.weeklyMenuId, menu.id)),
    ).toHaveLength(1);
  });
});

describe('updateMenu y el ciclo compartido entre localidades', () => {
  it('deja cambiar nombre y fechas desde la semana general', async () => {
    const { db, service } = await seeded();
    const menu = await service.createMenu(
      { ...menuInputBase, offerings: [fixedOffering('Real')] },
      CONTEXT,
    );

    await service.updateMenu(
      menu.id,
      { ...menuInputBase, alias: 'Semana 35', offerings: [fixedOffering('Real')] },
      CONTEXT,
    );

    const [cycle] = await db
      .select({ alias: salesCycles.alias })
      .from(salesCycles)
      .innerJoin(weeklyMenus, eq(weeklyMenus.salesCycleId, salesCycles.id))
      .where(eq(weeklyMenus.id, menu.id));
    expect(cycle?.alias).toBe('Semana 35');
  });

  it('no deja que una localidad le cambie el nombre a la semana de todas', async () => {
    const { db, service } = await seeded();
    const master = await service.createMenu(
      { ...menuInputBase, offerings: [fixedOffering('Real')] },
      CONTEXT,
    );
    await service.distributeMenu(
      master.id,
      { mode: 'CREATE_MISSING', operatingSiteIds: [SITE_A, SITE_B] },
      CONTEXT,
    );
    const [regional] = await db
      .select({ id: weeklyMenus.id })
      .from(weeklyMenus)
      .where(eq(weeklyMenus.operatingSiteId, SITE_A));
    if (!regional) throw new Error('La revisión regional no se creó');

    await expect(
      service.updateMenu(
        regional.id,
        { ...menuInputBase, alias: 'Sólo para Sitio A', offerings: [fixedOffering('Real')] },
        CONTEXT,
      ),
    ).rejects.toThrow(/semana general/);

    // Y el nombre siguió siendo el de todos.
    const [cycle] = await db
      .select({ alias: salesCycles.alias })
      .from(salesCycles)
      .innerJoin(weeklyMenus, eq(weeklyMenus.salesCycleId, salesCycles.id))
      .where(eq(weeklyMenus.id, master.id));
    expect(cycle?.alias).toBe('Semana 34');
  });

  it('marca como personalizado lo que se edita en una localidad', async () => {
    const { db, service } = await seeded();
    const master = await service.createMenu(
      { ...menuInputBase, offerings: [fixedOffering('Real')] },
      CONTEXT,
    );
    await service.distributeMenu(
      master.id,
      { mode: 'CREATE_MISSING', operatingSiteIds: [SITE_A] },
      CONTEXT,
    );
    const [regional] = await db
      .select({ id: weeklyMenus.id })
      .from(weeklyMenus)
      .where(eq(weeklyMenus.operatingSiteId, SITE_A));
    if (!regional) throw new Error('La revisión regional no se creó');

    // Mismo ciclo, otro precio: es exactamente el caso que una distribución posterior no debe pisar.
    await service.updateMenu(
      regional.id,
      {
        ...menuInputBase,
        offerings: [fixedOffering('Real')],
        prices: [{ currency: 'ARS', mealsPerUnit: 5, sizeName: '250', unitPriceMinor: 31000 }],
      },
      CONTEXT,
    );

    const [price] = await db
      .select({ customized: weeklyMenuPrices.customized, value: weeklyMenuPrices.unitPriceMinor })
      .from(weeklyMenuPrices)
      .where(eq(weeklyMenuPrices.weeklyMenuId, regional.id));
    expect(price?.value).toBe(31000);
    expect(price?.customized).toBe(true);
  });
});
