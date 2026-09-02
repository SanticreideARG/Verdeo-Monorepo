/**
 * Load-test seed: fills the database to a realistic operating size — 50 customers and 40 orders in
 * every active geographic zone — and times the queries the dashboard actually runs against it.
 *
 * The point is not the rows, it's the timings printed at the end: with 30 orders every screen is
 * instant and nothing reveals a missing index or an N+1. This is what makes those visible before
 * real customers do.
 *
 * Addresses are fictional but coherent: real street names for the city each zone belongs to, so
 * geocoding and route screens get input shaped like the real thing rather than "Calle 123".
 *
 * NOT idempotent — each run adds another batch. Run with:
 *   pnpm --filter @verdeo/db exec tsx src/seed-load-test.ts
 */
import { LocationLinkGeocodingProvider } from '@verdeo/geocoding';
import { eq } from 'drizzle-orm';

import { createDatabase } from './index.js';
import { PostgresOperationsService } from './repositories/postgres-operations-service.js';
import { geographicZones, operatingSites } from './schema/index.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const CONTEXT = { correlationId: 'seed-load-test', requestId: 'seed-load-test', source: 'seed' };

const CUSTOMERS_PER_ZONE = 50;
const ORDERS_PER_ZONE = 40;

/**
 * Scopes this run's generated emails. Contact identities are globally unique, so without it a
 * second run collides with the first one's customers instead of adding to them — including after a
 * partial run that failed halfway.
 */
const RUN_TAG = Date.now().toString(36);

/** Numeric sibling of RUN_TAG: phone numbers are unique identities too, and must be digits. */
const RUN_PHONE_OFFSET = Date.now() % 40_000_000;

const FIRST_NAMES = [
  'Martín',
  'Sofía',
  'Lucas',
  'Camila',
  'Nicolás',
  'Valentina',
  'Tomás',
  'Julieta',
  'Agustín',
  'Florencia',
  'Federico',
  'Micaela',
  'Ignacio',
  'Rocío',
  'Franco',
  'Antonella',
  'Joaquín',
  'Paula',
  'Bruno',
  'Milagros',
  'Santiago',
  'Carla',
  'Ezequiel',
  'Victoria',
  'Gonzalo',
  'Daniela',
  'Matías',
  'Belén',
  'Emiliano',
  'Luciana',
  'Diego',
  'Agustina',
  'Facundo',
  'Malena',
  'Ramiro',
  'Catalina',
  'Julián',
  'Delfina',
  'Mariano',
  'Pilar',
  'Leandro',
  'Abril',
  'Nahuel',
  'Renata',
  'Sebastián',
  'Guadalupe',
  'Alejo',
  'Martina',
  'Iván',
  'Emilia',
];

const LAST_NAMES = [
  'González',
  'Rodríguez',
  'Fernández',
  'López',
  'Martínez',
  'Pérez',
  'Sánchez',
  'Romero',
  'Díaz',
  'Álvarez',
  'Torres',
  'Ruiz',
  'Flores',
  'Acosta',
  'Benítez',
  'Molina',
  'Suárez',
  'Ortiz',
  'Gómez',
  'Castro',
  'Ibáñez',
  'Vega',
  'Domínguez',
  'Rojas',
  'Aguirre',
  'Silva',
  'Peralta',
  'Correa',
  'Medina',
  'Bravo',
  'Villalba',
  'Cabrera',
  'Ferreyra',
  'Godoy',
  'Ledesma',
  'Maldonado',
  'Ojeda',
  'Quiroga',
  'Sosa',
  'Vera',
  'Arias',
  'Cardozo',
  'Duarte',
  'Escobar',
  'Figueroa',
  'Herrera',
  'Luna',
  'Miranda',
  'Navarro',
  'Paz',
];

/** Real streets per city, so addresses read like the operation's actual delivery area. */
const STREETS_BY_SITE: Record<string, string[]> = {
  'Buenos Aires': [
    'Av. Rivadavia',
    'Av. Corrientes',
    'Av. Santa Fe',
    'Av. Cabildo',
    'Av. Las Heras',
    'Av. Córdoba',
    'Thames',
    'Gurruchaga',
    'Honduras',
    'Malabia',
    'Av. Scalabrini Ortiz',
    'Bulnes',
    'Salguero',
    'Av. Juan B. Justo',
    'Nicaragua',
  ],
  Mendoza: [
    'Av. San Martín',
    'Av. Colón',
    'Av. Las Heras',
    'Av. España',
    'Sarmiento',
    'Belgrano',
    'Av. Emilio Civit',
    'Arístides Villanueva',
    'Av. Boulogne Sur Mer',
    'Chile',
    'Rioja',
    'Av. Godoy Cruz',
    'Patricias Mendocinas',
    'Montevideo',
    'Av. San Juan',
  ],
  Neuquén: [
    'Av. Argentina',
    'Av. Olascoaga',
    'Alderete',
    'Av. Roca',
    'Santa Fe',
    'Rivadavia',
    'Av. del Trabajador',
    'Belgrano',
    'Perito Moreno',
    'Av. Leloir',
    'Buenos Aires',
    'Tucumán',
    'Av. Antártida Argentina',
    'Diagonal 9 de Julio',
    'Elordi',
  ],
};

const FALLBACK_STREETS = ['San Martín', 'Belgrano', 'Mitre', 'Sarmiento', 'Rivadavia'];

/** Approximate city centres, so seeded coordinates land in the right place on a map. */
const CENTRES: Record<string, { latitude: number; longitude: number }> = {
  'Buenos Aires': { latitude: -34.6037, longitude: -58.3816 },
  Mendoza: { latitude: -32.8895, longitude: -68.8458 },
  Neuquén: { latitude: -38.9516, longitude: -68.0591 },
};

const AREA_CODES: Record<string, string> = {
  'Buenos Aires': '11',
  Mendoza: '261',
  Neuquén: '299',
};

const DIETARY = [
  [],
  ['Sin cebolla'],
  ['Sin sal agregada'],
  ['Sin picante'],
  ['Sin lácteos'],
  ['Sin cebolla', 'Sin morrón'],
];

/** Deterministic pseudo-random, so a rerun produces the same spread and results stay comparable. */
function seeded(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

function timed<T>(label: string, run: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const started = process.hrtime.bigint();
  return run().then((value) => ({
    ms: Number(process.hrtime.bigint() - started) / 1_000_000,
    value,
  }));
}

async function main() {
  const { client, db } = createDatabase(databaseUrl!);
  const operations = new PostgresOperationsService(db, new LocationLinkGeocodingProvider());

  try {
    const sites = await db
      .select({ displayName: operatingSites.displayName, id: operatingSites.id })
      .from(operatingSites)
      .where(eq(operatingSites.active, true));

    const zones: { id: string; name: string; siteId: string; siteName: string }[] = [];
    for (const site of sites) {
      const rows = await db
        .select({ displayName: geographicZones.displayName, id: geographicZones.id })
        .from(geographicZones)
        .where(eq(geographicZones.operatingSiteId, site.id));
      for (const zone of rows) {
        if (zone.id) {
          zones.push({
            id: zone.id,
            name: zone.displayName,
            siteId: site.id,
            siteName: site.displayName,
          });
        }
      }
    }
    if (zones.length === 0) throw new Error('No active geographic zones found');
    console.log(
      `Zonas: ${zones.length} · objetivo ${CUSTOMERS_PER_ZONE} clientes y ${ORDERS_PER_ZONE} pedidos por zona\n`,
    );

    // Orders reference a published menu per site; without one there is nothing to order.
    const menus = await operations.listMenus(true);
    const menuBySite = new Map<string, (typeof menus)[number]>();
    for (const menu of menus) {
      if (menu.operatingSiteId && !menuBySite.has(menu.operatingSiteId)) {
        menuBySite.set(menu.operatingSiteId, menu);
      }
    }

    let created = 0;
    let orders = 0;
    let index = 1_000; // Offset so names don't collide with the earlier E2E batch.
    const startedAll = process.hrtime.bigint();

    for (const zone of zones) {
      const streets = STREETS_BY_SITE[zone.siteName] ?? FALLBACK_STREETS;
      const centre = CENTRES[zone.siteName];
      const areaCode = AREA_CODES[zone.siteName] ?? '11';
      const menu = menuBySite.get(zone.siteId);
      const zoneStarted = process.hrtime.bigint();
      const customerIds: { address: string; id: string }[] = [];

      for (let i = 0; i < CUSTOMERS_PER_ZONE; i += 1, index += 1) {
        const firstName = FIRST_NAMES[index % FIRST_NAMES.length]!;
        const lastName = LAST_NAMES[(index * 7) % LAST_NAMES.length]!;
        const street = streets[index % streets.length]!;
        const number = 100 + Math.floor(seeded(index, 1) * 4_800);
        const written = `${street} ${number}, ${zone.name}, ${zone.siteName}`;
        // Scattered within roughly ±0.05° of the centre — a few kilometres, so routes have a real
        // spread to sequence instead of every stop sitting on the same point.
        const latitude = centre ? centre.latitude + (seeded(index, 2) - 0.5) * 0.1 : undefined;
        const longitude = centre ? centre.longitude + (seeded(index, 3) - 0.5) * 0.1 : undefined;

        const customer = await operations.createCustomer(
          {
            addresses: [
              {
                geocodingStatus: latitude ? 'CONFIRMED' : 'NEEDS_LOCATION',
                geographicZoneId: zone.id,
                label: 'Casa',
                ...(latitude !== undefined ? { latitude } : {}),
                ...(longitude !== undefined ? { longitude } : {}),
                ...(latitude !== undefined
                  ? {
                      locationUrl: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
                    }
                  : {}),
                primary: true,
                source: 'manual',
                writtenAddress: written,
              },
            ],
            displayName: `${firstName} ${lastName}`,
            email: `${firstName}.${lastName}.${index}.${RUN_TAG}@ejemplo-carga.com`
              .toLowerCase()
              .normalize('NFD')
              .replace(/[̀-ͯ]/g, ''),
            firstName,
            lastName,
            operatingSiteId: zone.siteId,
            phone: `+549${areaCode}${String(50_000_000 + RUN_PHONE_OFFSET + index * 137).slice(-8)}`,
          },
          CONTEXT,
        );
        customerIds.push({ address: written, id: customer.id });
        created += 1;
      }

      if (menu) {
        const offerings = menu.offerings;
        const composable = offerings.find((offering) => offering.composable);
        const fixed = offerings.filter((offering) => !offering.composable);
        const allDishes = [...new Set(fixed.flatMap((offering) => offering.dishes))];

        for (let i = 0; i < ORDERS_PER_ZONE; i += 1) {
          const buyer = customerIds[i % customerIds.length]!;
          // ~20% Intuitivo, matching the real mix.
          const useIntuitivo = composable && i % 5 === 0;
          const offering = useIntuitivo ? composable : fixed[i % Math.max(1, fixed.length)];
          if (!offering) break;

          await operations.createOrder(
            {
              customerId: buyer.id,
              deliveryAddress: buyer.address,
              // The service returns cycle dates as Date objects, not the ISO strings the
              // contract layer later serializes them into.
              deliveryDate: new Date(menu.cycle.closeAt).toISOString().slice(0, 10),
              dietaryInstructions: DIETARY[i % DIETARY.length]!,
              initialStatus: i % 3 === 0 ? 'DRAFT' : 'CONFIRMED',
              items: [
                {
                  offeringId: offering.id,
                  // A realistic spread of 1-3 units rather than always one.
                  quantityUnits: 1 + Math.floor(seeded(i, 4) * 3),
                  ...(useIntuitivo
                    ? { selectedDishNames: allDishes.slice(i % 3, (i % 3) + 5) }
                    : {}),
                },
              ],
              menuId: menu.id,
              operatingSiteId: zone.siteId,
              paymentExpectation: i % 2 === 0 ? 'Efectivo' : 'Transferencia',
              source: 'manual',
            },
            CONTEXT,
          );
          orders += 1;
        }
      }

      // hrtime is nanoseconds; dividing by 1e6 gives milliseconds.
      const zoneMs = Number(process.hrtime.bigint() - zoneStarted) / 1_000_000;
      console.log(
        `  ${zone.siteName} / ${zone.name}: ${CUSTOMERS_PER_ZONE} clientes` +
          `${menu ? `, ${ORDERS_PER_ZONE} pedidos` : ' (sin menú publicado, sin pedidos)'}` +
          ` — ${(zoneMs / 1_000).toFixed(1)}s`,
      );
    }

    const totalMs = Number(process.hrtime.bigint() - startedAll) / 1_000_000;
    console.log(
      `\nCargados ${created} clientes y ${orders} pedidos en ${(totalMs / 1_000).toFixed(1)}s\n`,
    );

    // --- The actual measurement: how the dashboard's own queries behave at this size. ---
    console.log('Tiempos de las consultas del dashboard:');
    const listCustomers = await timed('clientes', () =>
      operations.listCustomers({ limit: 100 }, true),
    );
    console.log(`  listCustomers(100)          ${listCustomers.ms.toFixed(0).padStart(6)} ms`);

    const searchCustomers = await timed('búsqueda', () =>
      operations.listCustomers({ limit: 30, search: 'Gonz' }, true),
    );
    console.log(`  listCustomers(search)       ${searchCustomers.ms.toFixed(0).padStart(6)} ms`);

    const listOrders = await timed('pedidos', () => operations.listOrders({ limit: 100 }));
    console.log(`  listOrders(100)             ${listOrders.ms.toFixed(0).padStart(6)} ms`);

    const stats = await timed('stats', () => operations.getStatsOverview({}));
    console.log(`  getStatsOverview(todo)      ${stats.ms.toFixed(0).padStart(6)} ms`);

    const windowed = await timed('stats-window', () =>
      operations.getStatsOverview({ from: '2026-08-01', to: '2026-09-30' }),
    );
    console.log(`  getStatsOverview(ventana)   ${windowed.ms.toFixed(0).padStart(6)} ms`);

    const exported = await timed('export', () => operations.exportCustomers({}, CONTEXT));
    console.log(
      `  exportCustomers(todos)      ${exported.ms.toFixed(0).padStart(6)} ms  (${exported.value.length} filas)`,
    );

    const totals = await timed('totales', async () => ({
      customers: (await operations.listCustomers({ limit: 1 }, false)).items.length,
      stats: stats.value.global,
    }));
    console.log(
      `\nTotal en base: ${totals.value.stats.orderCount} pedidos · ` +
        `${totals.value.stats.customerCount} clientes con pedidos · ` +
        `${(totals.value.stats.revenueMinor / 100).toLocaleString('es-AR')} ARS facturados`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
