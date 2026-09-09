/**
 * Carga pedidos de prueba sobre un período ya publicado.
 *
 * Usa `PostgresOperationsService.createOrder`, que es el mismo motor que llama la API cuando alguien
 * carga un pedido desde "Tomar y confirmar": las mismas validaciones, el mismo cálculo de precio y
 * el mismo registro de auditoría. No es literalmente el frontend —eso necesitaría una sesión, y una
 * contraseña— pero es el mismo camino por debajo de HTTP.
 *
 * Reglas de esta carga, pedidas explícitamente:
 * - una sola unidad por pedido;
 * - sin indicaciones alimentarias;
 * - sólo clientes que ya existen, cada uno con un pedido como mucho;
 * - entre 16 y 33 pedidos por ciudad.
 */
import { and, eq } from 'drizzle-orm';

import { createDatabase } from './index.js';
import { PostgresOperationsService } from './repositories/postgres-operations-service.js';
import { customerAddresses, customers, geographicZones, operatingSites } from './schema/index.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const CYCLE_ID = process.env.CYCLE_ID;
if (!CYCLE_ID) throw new Error('CYCLE_ID is required');

const MIN_ORDERS = 16;
const MAX_ORDERS = 33;

/** Determinista: dos corridas sobre los mismos datos eligen lo mismo, así se puede comparar. */
function seeded(index: number, salt: number): number {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43_758.545;
  return value - Math.floor(value);
}

const SOURCES = ['whatsapp', 'phone', 'instagram', 'referral'] as const;
const PAYMENTS = ['Efectivo', 'Transferencia'] as const;

const { client, db } = createDatabase(databaseUrl);
const operations = new PostgresOperationsService(db, {
  key: 'seed',
  resolve: () => Promise.resolve({ candidates: [], status: 'NO_MATCH' }),
} as never);
const context = { correlationId: 'seed', requestId: 'seed', source: 'seed' };

try {
  const sites = await db
    .select({ displayName: operatingSites.displayName, id: operatingSites.id })
    .from(operatingSites)
    .where(eq(operatingSites.active, true));

  /*
   * Publicar las revisiones que la distribución dejó en borrador.
   *
   * Distribuir crea la copia de cada ciudad en borrador, y un borrador no se puede vender: el
   * formulario sólo ofrece menús publicados. Sin esto no habría dónde cargar un pedido.
   */
  for (const menu of await operations.listMenus()) {
    if (menu.cycle.id === CYCLE_ID && menu.operatingSiteId && menu.status === 'DRAFT') {
      await operations.publishMenu(menu.id, context);
      console.log(`- publicada la revisión de ${menu.operatingSiteName ?? 'sin ciudad'}.`);
    }
  }

  const menus = await operations.listMenus();
  let created = 0;

  for (const [siteIndex, site] of sites.entries()) {
    const menu = menus.find(
      (candidate) =>
        candidate.cycle.id === CYCLE_ID &&
        candidate.operatingSiteId === site.id &&
        candidate.status === 'PUBLISHED',
    );
    if (!menu) {
      console.log(`- ${site.displayName}: sin menú publicado para este ciclo, se omite.`);
      continue;
    }

    /*
     * Clientes elegidos por la ZONA de su dirección, no por su ciudad asignada.
     *
     * La operación de un pedido se deriva de la zona de la dirección de entrega (ADR-031), así que
     * elegir por `customer_operating_sites` hacía que el servicio reasignara el pedido a otra
     * ciudad y los totales por ciudad no fueran los pedidos. Un cliente puede estar asignado a una
     * ciudad y tener la dirección en otra; manda la dirección.
     */
    const buyers = await db
      .selectDistinctOn([customers.id], {
        address: customerAddresses.writtenAddress,
        addressId: customerAddresses.id,
        id: customers.id,
        name: customers.displayName,
      })
      .from(customers)
      .innerJoin(
        customerAddresses,
        and(eq(customerAddresses.customerId, customers.id), eq(customerAddresses.active, true)),
      )
      .innerJoin(geographicZones, eq(geographicZones.id, customerAddresses.geographicZoneId))
      .where(and(eq(geographicZones.operatingSiteId, site.id), eq(customers.status, 'active')));

    const target = Math.min(
      buyers.length,
      MIN_ORDERS + Math.floor(seeded(siteIndex, 7) * (MAX_ORDERS - MIN_ORDERS + 1)),
    );

    const composable = menu.offerings.find((offering) => offering.composable);
    const fixed = menu.offerings.filter((offering) => !offering.composable);
    // Los platos publicados de la semana: un Intuitivo elige cinco de acá.
    const dishes = [...new Set(fixed.flatMap((offering) => offering.dishes))];

    let madeHere = 0;
    for (let index = 0; index < target; index += 1) {
      const buyer = buyers[index];
      if (!buyer) break;
      // Uno de cada cinco Intuitivo, para que la tabla de platos tenga algo que sumar.
      const useIntuitivo = composable !== undefined && index % 5 === 0 && dishes.length >= 5;
      const offering = useIntuitivo ? composable : fixed[index % Math.max(1, fixed.length)];
      if (!offering) break;

      const start = index % Math.max(1, dishes.length - 4);
      await operations.createOrder(
        {
          customerId: buyer.id,
          deliveryAddress: buyer.address,
          deliveryAddressId: buyer.addressId,
          deliveryDate: new Date(menu.cycle.closeAt).toISOString().slice(0, 10),
          // Sin indicaciones, como se pidió.
          dietaryInstructions: [],
          // Tres de cada cuatro confirmados: la cola de trabajo queda con algo que hacer y la
          // producción con demanda real que consolidar.
          initialStatus: index % 4 === 3 ? 'DRAFT' : 'CONFIRMED',
          items: [
            {
              offeringId: offering.id,
              quantityUnits: 1,
              ...(useIntuitivo ? { selectedDishNames: dishes.slice(start, start + 5) } : {}),
            },
          ],
          menuId: menu.id,
          operatingSiteId: site.id,
          paymentExpectation: PAYMENTS[index % PAYMENTS.length] as string,
          source: SOURCES[index % SOURCES.length] as string,
        },
        context,
      );
      madeHere += 1;
      created += 1;
    }
    console.log(
      `- ${site.displayName}: ${String(madeHere)} pedidos (de ${String(buyers.length)} clientes disponibles).`,
    );
  }

  console.log(`\nTotal: ${String(created)} pedidos creados.`);
} finally {
  await client.end();
}
