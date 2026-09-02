/**
 * One-off end-to-end test seed: loads 10 fictional-but-coherent customers per active operating
 * site, publishes+distributes one weekly período (this week's dates) with the four named
 * varieties (Keto, Anti-Age, Vegetariano, Real) plus Intuitivo, and places one order per customer
 * (~20% using Intuitivo with real selected dishes). Requested explicitly to smoke-test the whole
 * workflow while still "en pruebas" (not in production yet).
 *
 * NOT idempotent by design — re-running creates a second batch (menu alias is timestamped so it
 * never collides with a prior run, but customers/orders are not deduplicated). Only meant to be
 * run once per test pass.
 *
 * Run with: pnpm --filter @verdeo/db exec tsx src/seed-e2e-test-data.ts
 */
import { LocationLinkGeocodingProvider } from '@verdeo/geocoding';
import { eq } from 'drizzle-orm';

import { createDatabase } from './index.js';
import { PostgresGeographyService } from './repositories/postgres-geography-service.js';
import { PostgresOperationsService } from './repositories/postgres-operations-service.js';
import { geographicZones, operatingSites } from './schema/index.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const CONTEXT = { correlationId: 'seed-e2e-test', requestId: 'seed-e2e-test', source: 'seed' };

// The sales_cycles check constraint requires openAt < partialKitchenCutoffAt < closeAt, all
// strictly in the future relative to "now" at insert time. Today (Sunday) is the last day of the
// calendar week, so "close/deliver during this week" in practice means "later today" — the
// closest future timestamp that still falls within the current week.
const NOW = new Date();
const OPEN_AT = NOW;
const CUTOFF_AT = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
const CLOSE_AT = new Date(NOW.getTime() + 4 * 60 * 60 * 1000);

const VARIETIES = [
  {
    description: 'Sin harinas ni cereales.',
    dishes: [
      'Lomo con salsa de castañas de cajú | puré de calabaza asada',
      'Suprema con crema de verdeo | salteado de vegetales',
      'Lasagna keto de verdes y muzza | bolognesa',
      'Goulash de cordero | revuelto de zapallitos',
      'Bondiola rellena de morrones, cherrys y roque | frittata verde',
    ],
    familyName: 'Menú Nuevo Keto',
  },
  {
    description: 'Ingredientes anti inflamatorios y anti oxidantes.',
    dishes: [
      'Agnollotis de muzzarella, albahaca y nueces | filetto',
      'Suprema al verdeo y leche de almendras | garbanzos al pesto',
      'Quesadillas vegetarianas con muzza y atún | fritatta verde',
      'Feijoada vegana con tofu',
      'Goulash de cordero | revuelto de zapallitos',
    ],
    familyName: 'Menú Anti-Age',
  },
  {
    description: 'Sin carnes. Con harina integral orgánica y queso.',
    dishes: [
      'Agnollotis de muzzarella, albahaca y nueces | filetto',
      'Feijoada vegana con tofu',
      'Quesadillas vegetarianas con roquefort y cebolla caramelizada | puré de calabaza asada',
      'Hamburguesas de porotos, quinoa y puré de zanahorias | salteado de zapallitos',
      'Gnoccis tradicionales | crema de champignones',
    ],
    familyName: 'Menú Vegetariano',
  },
  {
    description: 'Sin ultraprocesados ni procesados.',
    dishes: [
      'Lomo con salsa de castañas de cajú | puré de calabaza asada',
      'Bondiola rellena de morrón, cherrys y nueces | quinoa con vegetales',
      'Suprema al verdeo y leche de almendras | garbanzos al pesto',
      'Hamburguesas de porotos, quinoa y puré de zanahorias | salteado de zapallitos',
      'Lasagna keto de verdes y pollo | bolognesa',
    ],
    familyName: 'Menú Real',
  },
];

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
];

const STREETS = [
  'Av. Rivadavia',
  'Av. Corrientes',
  'San Martín',
  'Belgrano',
  'Mitre',
  'Sarmiento',
  'Av. Las Heras',
  'Independencia',
  'Alem',
  'Moreno',
];

function personName(index: number): { firstName: string; lastName: string } {
  return {
    firstName: FIRST_NAMES[index % FIRST_NAMES.length]!,
    lastName: LAST_NAMES[(index * 7) % LAST_NAMES.length]!,
  };
}

function streetAddress(index: number): string {
  const street = STREETS[index % STREETS.length]!;
  const number = 100 + ((index * 137) % 4800);
  return `${street} ${number}`;
}

function phone(siteIndex: number, index: number): string {
  const areaCodes = ['11', '261', '299'];
  const base = 15_000_0000 + siteIndex * 1_000_0000 + index * 137;
  return `+549${areaCodes[siteIndex % areaCodes.length]}${String(base).slice(-8)}`;
}

async function main() {
  const { client, db } = createDatabase(databaseUrl!);
  const operations = new PostgresOperationsService(db, new LocationLinkGeocodingProvider());
  const geography = new PostgresGeographyService(db);

  try {
    const sites = await db
      .select({
        displayName: operatingSites.displayName,
        id: operatingSites.id,
        slug: operatingSites.slug,
      })
      .from(operatingSites)
      .where(eq(operatingSites.active, true));
    if (sites.length === 0) throw new Error('No active operating sites found');
    console.log(`Sitios activos: ${sites.map((s) => s.displayName).join(', ')}`);

    const zonesBySite = new Map<string, { id: string; displayName: string }[]>();
    for (const site of sites) {
      let zones = await db
        .select({ displayName: geographicZones.displayName, id: geographicZones.id })
        .from(geographicZones)
        .where(eq(geographicZones.operatingSiteId, site.id));
      // Buenos Aires had no geographic zones configured yet — this is a genuine data gap
      // blocking customer creation there (address.geographicZoneId is mandatory), not something
      // specific to this seed, so a minimal default zone is created to unblock it.
      if (zones.length === 0) {
        console.log(`Sitio ${site.displayName} sin zonas geográficas — creando una por defecto.`);
        const created = await geography.createZone(
          {
            active: true,
            displayName: 'Zona General',
            operatingSiteId: site.id,
            slug: 'zona-general',
            sortOrder: 0,
          },
          CONTEXT,
        );
        zones = [{ displayName: created.displayName, id: created.id }];
      }
      zonesBySite.set(site.id, zones);
    }

    // --- Período: open now, close/deliver later today (this week). ---
    const alias = `Semana de prueba E2E ${NOW.toISOString().slice(0, 16).replace('T', ' ')}`;

    const menu = await operations.createMenu(
      {
        alias,
        closeAt: CLOSE_AT.toISOString(),
        offerings: [
          ...VARIETIES.flatMap((variety) => [
            {
              description: variety.description,
              dishes: variety.dishes,
              familyName: variety.familyName,
              sizeName: '250',
            },
            {
              description: variety.description,
              dishes: variety.dishes,
              familyName: variety.familyName,
              sizeName: '400',
            },
          ]),
          {
            composable: true,
            description: null,
            dishes: [],
            familyName: 'Intuitivo',
            sizeName: '250',
          },
        ],
        openAt: OPEN_AT.toISOString(),
        partialKitchenCutoffAt: CUTOFF_AT.toISOString(),
        prices: [
          { currency: 'ARS', mealsPerUnit: 5, sizeName: '250', unitPriceMinor: 6_500_000 },
          { currency: 'ARS', mealsPerUnit: 5, sizeName: '400', unitPriceMinor: 8_000_000 },
        ],
      },
      CONTEXT,
    );
    console.log(`Menú maestro creado: ${menu.id} (${alias})`);

    await operations.publishMenu(menu.id, CONTEXT);
    console.log('Menú maestro publicado.');

    const distribution = await operations.distributeMenu(
      menu.id,
      { mode: 'CREATE_MISSING', operatingSiteIds: sites.map((s) => s.id) },
      CONTEXT,
    );
    console.log(`Distribuido a ${distribution.length} sitio(s).`);

    for (const result of distribution) {
      await operations.publishMenu(result.weeklyMenuId, CONTEXT);
    }
    console.log('Menús regionales publicados.');

    const regionalMenus = await operations.listMenus();
    const menuBySite = new Map(
      distribution.map((result) => [
        result.operatingSiteId,
        regionalMenus.find((m) => m.id === result.weeklyMenuId)!,
      ]),
    );

    // --- Customers + orders: 10 per site, 20% of the 30 total (6) using Intuitivo. ---
    let globalIndex = 0;
    const intuitivoIndexes = new Set([2, 7, 13, 18, 24, 29]); // 6 of 30, spread across sites
    const paymentMethods = ['Efectivo', 'Transferencia'];

    for (const [siteIndex, site] of sites.entries()) {
      const zones = zonesBySite.get(site.id)!;
      const regionalMenu = menuBySite.get(site.id);
      if (!regionalMenu) throw new Error(`No hay menú regional para ${site.displayName}`);

      const fixedOfferings = regionalMenu.offerings.filter((o) => !o.composable);
      const composableOffering = regionalMenu.offerings.find((o) => o.composable);
      const allDishes = [...new Set(fixedOfferings.flatMap((o) => o.dishes))];

      for (let i = 0; i < 10; i += 1, globalIndex += 1) {
        const { firstName, lastName } = personName(globalIndex);
        const zone = zones[globalIndex % zones.length]!;
        const address = streetAddress(globalIndex);

        const customer = await operations.createCustomer(
          {
            addresses: [
              {
                geocodingStatus: 'NEEDS_LOCATION',
                geographicZoneId: zone.id,
                label: 'Casa',
                primary: true,
                source: 'seed-e2e-test',
                writtenAddress: `${address}, ${zone.displayName}, ${site.displayName}`,
              },
            ],
            displayName: `${firstName} ${lastName}`,
            email: `${firstName}.${lastName}.${globalIndex}@ejemplo-e2e.com`
              .toLowerCase()
              .normalize('NFD')
              .replace(/[̀-ͯ]/g, ''),
            firstName,
            lastName,
            operatingSiteId: site.id,
            phone: phone(siteIndex, i),
          },
          CONTEXT,
        );

        const useIntuitivo = intuitivoIndexes.has(globalIndex) && composableOffering;
        const chosenOffering = useIntuitivo
          ? composableOffering
          : fixedOfferings[globalIndex % fixedOfferings.length]!;
        const selectedDishes = useIntuitivo
          ? [...allDishes].sort(() => 0.5 - Math.random()).slice(0, 5)
          : undefined;

        await operations.createOrder(
          {
            customerId: customer.id,
            deliveryAddress: `${address}, ${zone.displayName}, ${site.displayName}`,
            deliveryDate: CLOSE_AT.toISOString().slice(0, 10),
            dietaryInstructions: [],
            initialStatus: 'CONFIRMED',
            items: [
              {
                offeringId: chosenOffering.id,
                quantityUnits: 1,
                ...(selectedDishes ? { selectedDishNames: selectedDishes } : {}),
              },
            ],
            menuId: regionalMenu.id,
            operatingSiteId: site.id,
            paymentExpectation: paymentMethods[globalIndex % paymentMethods.length]!,
            // `orders.source` is a closed enum the contracts validate on read (OrderSummarySchema),
            // not a free-text provenance tag — writing anything else here makes GET /orders fail
            // validation for the whole page, not just the offending row.
            source: 'manual',
          },
          CONTEXT,
        );

        console.log(
          `  [${site.displayName}] ${firstName} ${lastName} → ${chosenOffering.familyName}${useIntuitivo ? ' (Intuitivo)' : ''}`,
        );
      }
    }

    console.log(`Listo: ${globalIndex} clientes y ${globalIndex} pedidos creados.`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
