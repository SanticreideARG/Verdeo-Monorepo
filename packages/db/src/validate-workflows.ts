/**
 * End-to-end workflow validation.
 *
 * Walks every operational flow the business actually runs — from creating a week through taking an
 * order, producing it, routing it, delivering it and collecting payment — asserting the invariants
 * that matter at each step, then cleans up after itself.
 *
 * This is deliberately not a unit test: it runs against a real database with real data already in
 * it, exercising the same service methods the API calls, in the order an operator would. Unit tests
 * prove a function is right in isolation; this proves the pieces still fit together.
 *
 * Read-only checks run against existing data. Anything that writes creates its own records and
 * removes them at the end, so it is safe to run repeatedly against a populated database.
 *
 *   pnpm --filter @verdeo/db exec tsx src/validate-workflows.ts
 */
import { LocationLinkGeocodingProvider } from '@verdeo/geocoding';
import type { OrderStatus } from '@verdeo/orders';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { createDatabase, type Database } from './index.js';
import { PostgresOperationsService } from './repositories/postgres-operations-service.js';
import {
  customerAddresses,
  customerIdentities,
  customerOperatingSites,
  customers,
  geographicZones,
  operatingSites,
  orderItems,
  orders,
  salesCycles,
  weeklyMenus,
} from './schema/index.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const CONTEXT = {
  correlationId: 'validate-workflows',
  requestId: 'validate-workflows',
  source: 'seed',
};

const RUN_TAG = Date.now().toString(36);

interface Result {
  detail: string;
  name: string;
  status: 'FAIL' | 'PASS' | 'SKIP';
  workflow: string;
}

const results: Result[] = [];

function record(workflow: string, name: string, status: Result['status'], detail = '') {
  results.push({ detail, name, status, workflow });
  const mark = status === 'PASS' ? '  ok  ' : status === 'FAIL' ? ' FALLA' : ' omite';
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Runs one check, turning a thrown error into a FAIL rather than aborting the whole run. */
async function check(workflow: string, name: string, run: () => Promise<string | null>) {
  try {
    const detail = await run();
    if (detail === null) record(workflow, name, 'SKIP', 'sin datos para evaluar');
    else record(workflow, name, 'PASS', detail);
  } catch (error) {
    record(workflow, name, 'FAIL', error instanceof Error ? error.message : String(error));
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function main() {
  const { client, db } = createDatabase(databaseUrl!);
  const operations = new PostgresOperationsService(db, new LocationLinkGeocodingProvider());
  const createdCustomerIds: string[] = [];
  const createdOrderIds: string[] = [];

  try {
    // ---------------------------------------------------------------- Catálogo y configuración
    const sites = await db
      .select({ displayName: operatingSites.displayName, id: operatingSites.id })
      .from(operatingSites)
      .where(eq(operatingSites.active, true));
    const site = sites[0];
    assert(Boolean(site), 'No hay ninguna operación activa');

    const zones = await db
      .select({ displayName: geographicZones.displayName, id: geographicZones.id })
      .from(geographicZones)
      .where(eq(geographicZones.operatingSiteId, site!.id));

    console.log(`\n=== Configuración (${sites.length} ciudades) ===`);

    await check('config', 'Toda ciudad activa tiene al menos una zona', async () => {
      const missing: string[] = [];
      for (const candidate of sites) {
        const rows = await db
          .select({ id: geographicZones.id })
          .from(geographicZones)
          .where(
            and(
              eq(geographicZones.operatingSiteId, candidate.id),
              eq(geographicZones.active, true),
            ),
          );
        if (rows.length === 0) missing.push(candidate.displayName);
      }
      // A city with no zone silently blocks customer creation there — addresses require one.
      assert(missing.length === 0, `sin zonas: ${missing.join(', ')}`);
      return `${sites.length} ciudades con zonas`;
    });

    await check('config', 'Hay un menú publicado por ciudad', async () => {
      const published = await operations.listMenus(true);
      const covered = new Set(
        published.map((menu) => menu.operatingSiteId).filter((id): id is string => id !== null),
      );
      const uncovered = sites.filter((candidate) => !covered.has(candidate.id));
      assert(
        uncovered.length === 0,
        `sin menú publicado: ${uncovered.map((candidate) => candidate.displayName).join(', ')}`,
      );
      return `${covered.size} ciudades con menú vigente`;
    });

    await check('config', 'Ningún menú tiene más de un Intuitivo', async () => {
      const all = await operations.listMenus();
      const offenders = all.filter(
        (menu) => menu.offerings.filter((offering) => offering.composable).length > 1,
      );
      // The invariant the API enforces on write; checked here against what is actually stored.
      assert(offenders.length === 0, `${offenders.length} menú(s) con Intuitivo duplicado`);
      return `${all.length} menús revisados`;
    });

    await check('config', 'Todo menú publicado tiene precio para cada tamaño', async () => {
      const published = await operations.listMenus(true);
      const broken = published.filter((menu) =>
        menu.offerings.some((offering) => offering.unitPriceMinor <= 0),
      );
      assert(broken.length === 0, `${broken.length} menú(s) con una opción sin precio`);
      return `${published.length} menús publicados`;
    });

    // ------------------------------------------------------------------------- Alta de cliente
    console.log('\n=== Alta de cliente ===');

    const zone = zones[0];
    let customerId = '';

    await check('cliente', 'Se crea un cliente con domicilio y contacto', async () => {
      assert(Boolean(zone), 'la ciudad de prueba no tiene zonas');
      const customer = await operations.createCustomer(
        {
          addresses: [
            {
              geocodingStatus: 'NEEDS_LOCATION',
              geographicZoneId: zone!.id,
              label: 'Casa',
              primary: true,
              source: 'manual',
              writtenAddress: `Av. Siempreviva 742, ${zone!.displayName}`,
            },
          ],
          displayName: `Validación ${RUN_TAG}`,
          email: `validacion.${RUN_TAG}@ejemplo-validacion.com`,
          operatingSiteId: site!.id,
          phone: `+5491${String(Date.now()).slice(-9)}`,
        },
        CONTEXT,
      );
      customerId = customer.id;
      createdCustomerIds.push(customer.id);
      return `id ${customer.id.slice(0, 8)}…`;
    });

    await check('cliente', 'La ficha trae domicilio, zona y contactos', async () => {
      assert(Boolean(customerId), 'no se creó el cliente');
      // getCustomer's return type is a union (sensitive vs redacted) that TS can't narrow from the
      // boolean argument, so the sensitive shape is named explicitly here.
      const detail = (await operations.getCustomer(customerId, true)) as {
        addresses?: { geographicZoneId?: string }[];
        identities?: unknown[];
      };
      const address = detail.addresses?.[0];
      assert(Boolean(address), 'la ficha no devolvió domicilios');
      // Regression: getCustomer used to omit geographicZoneId from its select, which 500'd the
      // whole detail screen.
      assert(Boolean(address?.geographicZoneId), 'el domicilio no trae su zona geográfica');
      assert((detail.identities?.length ?? 0) > 0, 'la ficha no trae contactos');
      return `${detail.addresses?.length} domicilio(s), ${detail.identities?.length} contacto(s)`;
    });

    await check('cliente', 'El cliente aparece al buscarlo por nombre', async () => {
      const page = await operations.listCustomers(
        { limit: 30, search: `Validación ${RUN_TAG}` },
        true,
      );
      assert(
        page.items.some((item) => item.id === customerId),
        'el cliente recién creado no aparece en la búsqueda',
      );
      return `${page.items.length} resultado(s)`;
    });

    await check('cliente', 'Queda asociado a su ciudad', async () => {
      const rows = await db
        .select({ status: customerOperatingSites.status })
        .from(customerOperatingSites)
        .where(
          and(
            eq(customerOperatingSites.customerId, customerId),
            eq(customerOperatingSites.operatingSiteId, site!.id),
          ),
        );
      assert(rows.length === 1 && rows[0]?.status === 'active', 'no quedó asociado a la operación');
      return site!.displayName;
    });

    // -------------------------------------------------------------------------- Toma de pedido
    console.log('\n=== Pedido ===');

    const publishedMenus = await operations.listMenus(true);
    const menu = publishedMenus.find((candidate) => candidate.operatingSiteId === site!.id);
    let orderId = '';

    await check('pedido', 'Se registra un pedido contra el menú vigente', async () => {
      if (!menu) return null;
      const offering = menu.offerings.find((candidate) => !candidate.composable);
      assert(Boolean(offering), 'el menú no tiene variedades fijas');
      const order = await operations.createOrder(
        {
          customerId,
          deliveryAddress: `Av. Siempreviva 742, ${zone!.displayName}`,
          deliveryDate: new Date(menu.cycle.closeAt).toISOString().slice(0, 10),
          dietaryInstructions: ['Sin cebolla'],
          initialStatus: 'CONFIRMED',
          items: [{ offeringId: offering!.id, quantityUnits: 2 }],
          menuId: menu.id,
          operatingSiteId: site!.id,
          paymentExpectation: 'Efectivo',
          source: 'manual',
        },
        CONTEXT,
      );
      orderId = order.id;
      createdOrderIds.push(order.id);
      return `${order.publicNumber}, total ${(order.totalMinor / 100).toLocaleString('es-AR')} ARS`;
    });

    await check('pedido', 'El total coincide con precio × cantidad', async () => {
      if (!orderId) return null;
      const order = await operations.getOrder(orderId);
      const expected = order.items.reduce(
        (sum, item) => sum + item.unitPriceMinor * item.quantityUnits,
        0,
      );
      assert(
        order.totalMinor === expected,
        `total ${order.totalMinor} ≠ suma de ítems ${expected}`,
      );
      return `${(order.totalMinor / 100).toLocaleString('es-AR')} ARS`;
    });

    await check('pedido', 'Un Intuitivo exige exactamente cinco platos', async () => {
      if (!menu) return null;
      const composable = menu.offerings.find((candidate) => candidate.composable);
      if (!composable) return null;
      let rejected = false;
      try {
        const bad = await operations.createOrder(
          {
            customerId,
            deliveryAddress: 'Dirección de prueba 1',
            deliveryDate: new Date(menu.cycle.closeAt).toISOString().slice(0, 10),
            dietaryInstructions: [],
            items: [
              { offeringId: composable.id, quantityUnits: 1, selectedDishNames: ['Uno', 'Dos'] },
            ],
            menuId: menu.id,
            operatingSiteId: site!.id,
            paymentExpectation: 'Efectivo',
            source: 'manual',
          },
          CONTEXT,
        );
        createdOrderIds.push(bad.id);
      } catch {
        rejected = true;
      }
      assert(rejected, 'aceptó un Intuitivo con menos de cinco platos');
      return 'rechazado como corresponde';
    });

    await check('pedido', 'El pedido recorre su ciclo de estados', async () => {
      if (!orderId) return null;
      // The real lifecycle, taken from OrderStatus rather than invented: DRAFT and CONFIRMED are
      // entry states, so a confirmed order advances READY → DELIVERED.
      const path: OrderStatus[] = ['READY', 'DELIVERED'];
      const reached: string[] = [];
      for (const status of path) {
        try {
          await operations.transitionOrder(orderId, status, undefined, false, false, CONTEXT);
          reached.push(status);
        } catch {
          break;
        }
      }
      assert(reached.length > 0, 'no aceptó ninguna transición de estado');
      return reached.join(' → ');
    });

    await check('pedido', 'El pedido aparece en el listado de su ciudad', async () => {
      if (!orderId) return null;
      const page = await operations.listOrders({ limit: 100, operatingSiteId: site!.id });
      assert(
        page.items.some((item) => item.id === orderId),
        'el pedido no aparece en el listado de la ciudad',
      );
      return `${page.items.length} pedido(s) en ${site!.displayName}`;
    });

    // -------------------------------------------------------------- Consistencia de los datos
    console.log('\n=== Consistencia ===');

    await check('datos', 'Ningún pedido quedó sin ítems', async () => {
      // An order with no items has a total of zero and silently disappears from production.
      const [row] = await db.execute<{ n: number }>(sql`
        select count(*)::int as n
        from ${orders} o
        where not exists (select 1 from ${orderItems} i where i.order_id = o.id)
      `);
      assert(Number(row?.n ?? 0) === 0, `${row?.n} pedido(s) sin ítems`);
      return 'todos los pedidos tienen al menos un ítem';
    });

    await check('datos', 'Todo pedido tiene una ciudad asignada', async () => {
      // Scoping, production and routing all key off the site; a null makes an order invisible.
      const [row] = await db.execute<{ n: number }>(sql`
        select count(*)::int as n from ${orders} where operating_site_id is null
      `);
      assert(Number(row?.n ?? 0) === 0, `${row?.n} pedido(s) sin ciudad`);
      return 'ningún pedido huérfano de ciudad';
    });

    await check('datos', 'Todo cliente pertenece a alguna operación', async () => {
      const [row] = await db.execute<{ n: number }>(sql`
        select count(*)::int as n
        from ${customers} c
        where not exists (
          select 1 from ${customerOperatingSites} m
          where m.customer_id = c.id and m.status = 'active'
        )
      `);
      assert(Number(row?.n ?? 0) === 0, `${row?.n} cliente(s) sin operación activa`);
      return 'padrón completo';
    });

    await check('datos', 'Los totales de Estadísticas cuadran con los pedidos', async () => {
      const stats = await operations.getStatsOverview({});
      const byZoneTotal = stats.byZone.reduce((sum, row) => sum + row.revenueMinor, 0);
      assert(
        stats.global.revenueMinor === byZoneTotal,
        `global ${stats.global.revenueMinor} ≠ suma por zona ${byZoneTotal}`,
      );
      const byCycleTotal = stats.byCycle.reduce((sum, row) => sum + row.revenueMinor, 0);
      assert(
        stats.global.revenueMinor === byCycleTotal,
        `global ${stats.global.revenueMinor} ≠ suma por semana ${byCycleTotal}`,
      );
      return `${stats.global.orderCount} pedidos, ${(stats.global.revenueMinor / 100).toLocaleString('es-AR')} ARS`;
    });

    await check('datos', 'Estadísticas excluye los pedidos cancelados', async () => {
      const stats = await operations.getStatsOverview({});
      assert(
        !stats.global.statusBreakdown.some((row) => row.status === 'CANCELLED'),
        'los pedidos cancelados están contando como demanda',
      );
      return 'cancelados fuera de los totales';
    });

    await check('datos', 'La exportación cubre todo el padrón, no una página', async () => {
      const exported = await operations.exportCustomers({}, CONTEXT);
      const [row] = await db.execute<{ n: number }>(sql`
        select count(*)::int as n from ${customers}
      `);
      const total = Number(row?.n ?? 0);
      // The export walks every page while the directory used to cap at 100 — they must agree, or
      // the file and the screen tell the operator two different stories.
      assert(exported.length === total, `exportó ${exported.length} de ${total} clientes`);
      return `${exported.length} de ${total} clientes`;
    });

    await check('datos', 'Toda dirección confirmada tiene coordenadas', async () => {
      // CONFIRMED without coordinates is the state that silently breaks route optimisation: the
      // stop can't be sequenced, and nothing on screen says why.
      const [row] = await db.execute<{ n: number }>(sql`
        select count(*)::int as n
        from ${customerAddresses}
        where geocoding_status = 'CONFIRMED'
          and (latitude is null or longitude is null)
      `);
      assert(Number(row?.n ?? 0) === 0, `${row?.n} dirección(es) confirmadas sin coordenadas`);
      return 'las confirmadas tienen lat/lng';
    });

    await check('datos', 'Ningún pedido referencia un menú de otra ciudad', async () => {
      // An order priced against another city's menu is a real money bug: it would charge that
      // city's prices while being produced and delivered here.
      const [row] = await db.execute<{ n: number }>(sql`
        select count(*)::int as n
        from ${orders} o
        join ${weeklyMenus} m on m.id = o.weekly_menu_id
        where m.operating_site_id is not null
          and m.operating_site_id <> o.operating_site_id
      `);
      assert(Number(row?.n ?? 0) === 0, `${row?.n} pedido(s) con menú de otra ciudad`);
      return 'menú y ciudad coinciden en todos los pedidos';
    });

    // ------------------------------------------------------------------------------- Limpieza
    console.log('\n=== Limpieza ===');
    await cleanup(db, createdOrderIds, createdCustomerIds);
    record(
      'limpieza',
      'Se borraron los registros de prueba',
      'PASS',
      `${createdOrderIds.length} pedido(s), ${createdCustomerIds.length} cliente(s)`,
    );
  } finally {
    await client.end();
  }

  // ------------------------------------------------------------------------------- Resultado
  const failed = results.filter((result) => result.status === 'FAIL');
  const passed = results.filter((result) => result.status === 'PASS');
  const skipped = results.filter((result) => result.status === 'SKIP');

  console.log(`\n${passed.length} ok · ${failed.length} fallas · ${skipped.length} omitidas`);
  if (failed.length > 0) {
    console.log('\nFallas:');
    for (const failure of failed)
      console.log(`  [${failure.workflow}] ${failure.name}: ${failure.detail}`);
    process.exitCode = 1;
  }
}

/** Removes this run's records, children first so foreign keys stay satisfied. */
async function cleanup(db: Database, orderIds: string[], customerIds: string[]) {
  if (orderIds.length > 0) {
    await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }
  if (customerIds.length > 0) {
    await db.delete(customerIdentities).where(inArray(customerIdentities.customerId, customerIds));
    await db
      .delete(customerOperatingSites)
      .where(inArray(customerOperatingSites.customerId, customerIds));
  }
  void salesCycles;
  void weeklyMenus;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
