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

describe('stock de períodos anteriores (lotes)', () => {
  async function cerrarConSobrante() {
    const { client, service } = await base();
    await client.exec(seedB);
    // El menú de A es de CABA: de ahí es lo que sobra si no se vendió nada.
    await client.exec(`update weekly_menus set operating_site_id = '${SITE}'`);
    // A cocinó 4 Keto 250 de más y no los vendió.
    await service.setProductionStock(
      CYCLE,
      [{ familyName: 'Keto', quantityUnits: 4, variantName: '250' }],
      contexto,
    );
    const closed = await service.setCycleClosed(CYCLE, true, contexto);
    const [lot] = await service.listStockLots({ onlyAvailable: true, operatingSiteId: SITE });
    return { client, closed, lot, service };
  }

  it('al cerrar A, lo que sobró queda solo como lote de A en su ciudad', async () => {
    const { closed, lot, service } = await cerrarConSobrante();
    expect(closed.stockLots).toEqual([
      { familyName: 'Keto', operatingSiteName: 'CABA', quantityUnits: 4, variantName: '250' },
    ]);
    // En A no queda nada disponible: salió como baja con ese motivo.
    const reportA = await service.surplusReport(CYCLE);
    expect(reportA.items.find((item) => item.familyName === 'Keto')?.disponible).toBe(0);
    expect(lot).toMatchObject({ available: 4, cycleAlias: 'Octubre 3', soldUnits: 0 });
  });

  it('se vende en B desde el lote: no se cocina, conserva el origen y no deja vender de más', async () => {
    const { lot, service } = await cerrarConSobrante();
    const order = await service.createOrder(
      {
        ...pedido('2126-10-26'),
        initialStatus: 'CONFIRMED' as const,
        items: [{ offeringId: OFFERING_B, quantityUnits: 3, stockLotId: lot?.id }],
        menuId: MENU_B,
        source: 'whatsapp',
      },
      contexto,
    );
    // El pedido conserva por dónde entró y la vianda dice de qué período es.
    expect(order).toMatchObject({ source: 'whatsapp' });
    expect(order.items[0]?.stockLot).toMatchObject({ cycleAlias: 'Octubre 3' });
    // Ya está cocinada: no suma a lo que hay que cocinar en B.
    expect((await service.kitchenSummary(CYCLE_B)).base).toEqual([]);
    await expect(
      service.createOrder(
        {
          ...pedido('2126-10-26'),
          items: [{ offeringId: OFFERING_B, quantityUnits: 2, stockLotId: lot?.id }],
          menuId: MENU_B,
        },
        contexto,
      ),
    ).rejects.toThrow(/queda 1/);
    const [after] = await service.listStockLots({ operatingSiteId: SITE });
    expect(after).toMatchObject({ available: 1, soldUnits: 3 });
  });

  it('un lote vencido (más de un mes) no se vende', async () => {
    const { client, lot, service } = await cerrarConSobrante();
    await client.exec(`update stock_lots set expires_at = '2020-01-01T00:00:00Z'`);
    expect(await service.listStockLots({ onlyAvailable: true, operatingSiteId: SITE })).toEqual([]);
    await expect(
      service.createOrder(
        {
          ...pedido('2126-10-26'),
          items: [{ offeringId: OFFERING_B, quantityUnits: 1, stockLotId: lot?.id }],
          menuId: MENU_B,
        },
        contexto,
      ),
    ).rejects.toThrow(/venció/);
  });

  it('se corrige: no menos de lo vendido, y se da de baja lo que queda', async () => {
    const { lot, service } = await cerrarConSobrante();
    await service.createOrder(
      {
        ...pedido('2126-10-26'),
        initialStatus: 'CONFIRMED' as const,
        items: [{ offeringId: OFFERING_B, quantityUnits: 2, stockLotId: lot?.id }],
        menuId: MENU_B,
      },
      contexto,
    );
    await expect(
      service.updateStockLot(lot?.id ?? '', { quantityUnits: 1 }, contexto),
    ).rejects.toThrow(/ya se vendieron 2/);
    await service.updateStockLot(lot?.id ?? '', { writeOffRemaining: true }, contexto);
    const [after] = await service.listStockLots({ operatingSiteId: SITE });
    expect(after).toMatchObject({ available: 0, soldUnits: 2, writtenOffUnits: 2 });
  });
});

describe('informe del período', () => {
  it('resume lo vendido, la plata por medio de pago, quién debe y el stock', async () => {
    const { client, service } = await base();
    await client.exec(seedB);
    const pagado = (await service.createOrder(
      { ...pedido('2026-10-18'), initialStatus: 'CONFIRMED' },
      contexto,
    )) as { id: string };
    await service.createOrder(
      { ...pedido('2026-10-18'), initialStatus: 'CONFIRMED', paymentExpectation: 'Transferencia' },
      contexto,
    );
    const cancelado = (await service.createOrder(pedido('2026-10-18'), contexto)) as {
      id: string;
    };
    await client.exec(`update orders set paid_at = now() where id = '${pagado.id}';
      update orders set status = 'CANCELLED' where id = '${cancelado.id}';`);
    await service.setProductionStock(
      CYCLE,
      [{ familyName: 'Keto', quantityUnits: 4, variantName: '250' }],
      contexto,
    );
    await service.setCycleClosed(CYCLE, true, contexto);

    const report = await service.cycleReport(CYCLE);

    expect(report.totals).toMatchObject({
      orderCount: 2,
      paidMinor: 7_000_000,
      pendingMinor: 7_000_000,
      totalMinor: 14_000_000,
    });
    expect(report.cancelled).toEqual({ count: 1, totalMinor: 7_000_000 });
    expect(report.receivables).toHaveLength(1);
    expect(report.receivables[0]?.orders[0]?.paymentExpectation).toBe('Transferencia');
    // El stock: 4 de la semana, que pasaron al período siguiente.
    expect(report.stock).toEqual([
      {
        carriedIn: 0,
        carriedOut: 4,
        familyName: 'Keto',
        planned: 4,
        sold: 0,
        variantName: '250',
        writtenOff: 0,
      },
    ]);
  });
});

describe('etiquetas impresas', () => {
  it('recuerda lo impreso y cuenta las veces', async () => {
    const { service } = await base();
    await service.recordPrintedLabels(
      CYCLE,
      [
        { key: 'menu:A-1:Keto:250:0', kind: 'menu' },
        { key: 'plato:KETO:Lomo:0', kind: 'plato' },
      ],
      contexto,
    );
    await service.recordPrintedLabels(
      CYCLE,
      [{ key: 'menu:A-1:Keto:250:0', kind: 'menu' }],
      contexto,
    );

    const printed = await service.listPrintedLabels(CYCLE);
    expect(
      printed
        .map(({ key, printCount }) => ({ key, printCount }))
        .sort((a, b) => a.key.localeCompare(b.key)),
    ).toEqual([
      { key: 'menu:A-1:Keto:250:0', printCount: 2 },
      { key: 'plato:KETO:Lomo:0', printCount: 1 },
    ]);
  });
});

describe('cancelado después de cocinarse: pasa a stock', () => {
  const INT_VARIANT = 'f2000000-0000-4000-8000-000000000009';
  const INT_A = 'f3000000-0000-4000-8000-000000000008';
  const INT_B = 'f3000000-0000-4000-8000-000000000009';
  // El Intuitivo 250 en los menús de A y de B.
  const seedIntuitivo = `
    insert into product_variants (id, product_family_id, product_size_id, code, display_name)
    values ('${INT_VARIANT}', (select id from product_families where code = 'intuitivo'),
            '${SIZE}', 'intuitivo-250', '250');
    insert into weekly_menu_offerings (id, weekly_menu_id, product_variant_id)
    values ('${INT_A}', '${MENU}', '${INT_VARIANT}'), ('${INT_B}', '${MENU_B}', '${INT_VARIANT}');
  `;

  async function conB() {
    const { client, service } = await base();
    await client.exec(seedB);
    await client.exec(seedIntuitivo);
    await client.exec(`update weekly_menus set operating_site_id = '${SITE}'`);
    return { client, service };
  }

  const cancelar = (service: PostgresOperationsService, orderId: string, toStock: boolean) =>
    service.transitionOrder(orderId, 'CANCELLED', 'No lo quiso', false, true, contexto, {
      toStock,
    });

  it('lo fijo se suma al lote de su variedad y no sobra dos veces en el período', async () => {
    const { service } = await conB();
    const order = await service.createOrder(
      {
        ...pedido('2026-10-19'),
        initialStatus: 'CONFIRMED' as const,
        items: [{ offeringId: OFFERING, quantityUnits: 2 }],
      },
      contexto,
    );
    await cancelar(service, order.id, true);
    const [lot] = await service.listStockLots({ operatingSiteId: SITE });
    expect(lot).toMatchObject({
      available: 2,
      cycleAlias: 'Octubre 3',
      dishes: [],
      familyName: 'Keto',
    });
    // En el período no aparece como sobrante: ya está en el lote.
    const report = await service.surplusReport(CYCLE);
    expect(report.items.find((item) => item.familyName === 'Keto')?.disponible ?? 0).toBe(0);
    // Al cerrar con 4 más de sobrante, se suman al mismo lote.
    await service.setProductionStock(
      CYCLE,
      [{ familyName: 'Keto', quantityUnits: 4, variantName: '250' }],
      contexto,
    );
    await service.setCycleClosed(CYCLE, true, contexto);
    const lots = await service.listStockLots({ operatingSiteId: SITE });
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ available: 6 });
  });

  it('sin la casilla, no pasa nada al stock', async () => {
    const { service } = await conB();
    const order = await service.createOrder(
      { ...pedido('2026-10-19'), initialStatus: 'CONFIRMED' as const },
      contexto,
    );
    await cancelar(service, order.id, false);
    expect(await service.listStockLots({ operatingSiteId: SITE })).toEqual([]);
  });

  it('el Intuitivo abre su lote con sus platos y se vende en B con esos platos', async () => {
    const { service } = await conB();
    const order = await service.createOrder(
      {
        ...pedido('2026-10-19'),
        initialStatus: 'CONFIRMED' as const,
        items: [
          {
            offeringId: INT_A,
            quantityUnits: 1,
            selectedDishes: ['A', 'B', 'C', 'D', 'E', 'A'].map((dishName) => ({
              dishName,
              familyName: 'Keto',
            })),
          },
        ],
      },
      contexto,
    );
    await cancelar(service, order.id, true);
    const [lot] = await service.listStockLots({ onlyAvailable: true, operatingSiteId: SITE });
    expect(lot?.familyName).toBe('Intuitivo');
    expect(lot?.dishes.map((dish) => dish.dishName)).toEqual(['A', 'B', 'C', 'D', 'E', 'A']);
    expect(lot?.dishes[1]).toMatchObject({ familyName: 'Keto', slot: 2 });

    // B no tiene esos platos en su menú: igual se vende, con los platos del lote.
    const sold = await service.createOrder(
      {
        ...pedido('2126-10-26'),
        items: [{ offeringId: INT_B, quantityUnits: 1, stockLotId: lot?.id }],
        menuId: MENU_B,
      },
      contexto,
    );
    expect(sold.items[0]?.stockLot).toMatchObject({ cycleAlias: 'Octubre 3' });
    expect(sold.items[0]?.dishSelections).toEqual(['A', 'B', 'C', 'D', 'E', 'A']);
    // No se cocina en B.
    expect((await service.kitchenSummary(CYCLE_B)).base).toEqual([]);
    // Ya no queda: no se vende dos veces.
    await expect(
      service.createOrder(
        {
          ...pedido('2126-10-26'),
          items: [{ offeringId: INT_B, quantityUnits: 1, stockLotId: lot?.id }],
          menuId: MENU_B,
        },
        contexto,
      ),
    ).rejects.toThrow(/ya se vendió/);
    // Y el pedido original ya no se puede reactivar.
    await expect(
      service.transitionOrder(order.id, 'CONFIRMED', 'Lo quiso', true, true, contexto),
    ).rejects.toThrow(/ya se vendió/);
  });

  it('reactivar un pedido que pasó a stock saca sus viandas del lote', async () => {
    const { service } = await conB();
    const order = await service.createOrder(
      {
        ...pedido('2026-10-19'),
        initialStatus: 'CONFIRMED' as const,
        items: [{ offeringId: OFFERING, quantityUnits: 2 }],
      },
      contexto,
    );
    await cancelar(service, order.id, true);
    await service.transitionOrder(order.id, 'CONFIRMED', 'Lo quiso', true, true, contexto);
    const [lot] = await service.listStockLots({ operatingSiteId: SITE });
    expect(lot).toMatchObject({ available: 0, quantityUnits: 0 });
  });
});

describe('Intuitivo de un período anterior cargado a mano', () => {
  const lote = {
    dishes: [
      { dishName: 'A', familyName: 'Keto', slot: 1 },
      { dishName: 'C', familyName: 'Keto', slot: 3 },
    ],
    name: 'Intuitivo sin lácteos',
    operatingSiteId: SITE,
    quantityUnits: 2,
    salesCycleId: CYCLE,
    variantName: '250',
  };

  it('queda como stock con su nombre y sus platos, y vence un mes después de cargarlo', async () => {
    const { service } = await base();

    await service.createIntuitivoLot(lote, contexto);

    const [lot] = await service.listStockLots({ operatingSiteId: SITE });
    expect(lot).toMatchObject({
      available: 2,
      cycleAlias: 'Octubre 3',
      dishes: lote.dishes,
      expired: false,
      familyName: 'Intuitivo',
      notes: 'Intuitivo sin lácteos',
      variantName: '250',
    });
    expect(new Date(lot?.expiresAt ?? 0).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  });

  it('no acepta un plato que no estaba en el menú de ese período', async () => {
    const { service } = await base();

    await expect(
      service.createIntuitivoLot(
        { ...lote, dishes: [{ dishName: 'Z', familyName: 'Keto', slot: null }] },
        contexto,
      ),
    ).rejects.toThrow('no está en el menú');
  });

  it('no acepta un período de hace más de cuatro meses', async () => {
    const { client, service } = await base();
    const viejo = 'd0000000-0000-4000-8000-000000000099';
    const desde = new Date();
    desde.setMonth(desde.getMonth() - 5);
    const dia = (n: number) => new Date(desde.getTime() + n * 86_400_000).toISOString();
    await client.exec(`
      insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
      values ('${viejo}', 'Viejo', '${desde.toISOString()}', '${dia(5)}', '${dia(6)}');
    `);

    await expect(
      service.createIntuitivoLot({ ...lote, salesCycleId: viejo }, contexto),
    ).rejects.toThrow('últimos 4 meses');
  });
});
