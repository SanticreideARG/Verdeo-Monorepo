import { and, eq, isNotNull, notExists, sql } from 'drizzle-orm';

import { parseCoordinatesFromLocationUrl } from '@verdeo/geocoding';

import type { Database } from './index.js';
import { customerAddresses, customers, geocodingRequests } from './schema/index.js';

/**
 * Los domicilios con coordenadas que nunca pasaron por el ubicador de direcciones.
 *
 * Toda ubicación que carga la aplicación —la que encuentra el buscador, la que se confirma a mano,
 * la de un enlace pegado— deja registrada su búsqueda en `geocoding_requests`. Un domicilio con
 * coordenadas y sin ninguna búsqueda las recibió por otro lado: la semilla de prueba de carga, que
 * pone un punto **al azar** alrededor del centro de la ciudad (algunos caen en el río) y lo marca
 * como confirmado. Para la hoja de ruta esos puntos son peores que no tener ninguno, porque parecen
 * buenos.
 */
export async function findUnverifiedLocations(db: Database) {
  return db
    .select({
      customerName: customers.displayName,
      id: customerAddresses.id,
      latitude: customerAddresses.latitude,
      locationUrl: customerAddresses.locationUrl,
      longitude: customerAddresses.longitude,
      writtenAddress: customerAddresses.writtenAddress,
    })
    .from(customerAddresses)
    .innerJoin(customers, eq(customers.id, customerAddresses.customerId))
    .where(
      and(
        isNotNull(customerAddresses.latitude),
        isNotNull(customerAddresses.longitude),
        notExists(
          db
            .select({ uno: sql`1` })
            .from(geocodingRequests)
            .where(eq(geocodingRequests.addressId, customerAddresses.id)),
        ),
      ),
    )
    .orderBy(customers.displayName);
}

/** Si el enlace guardado apunta a esas mismas coordenadas (lo que hace la semilla). */
function linkMatches(locationUrl: string | null, latitude: number, longitude: number): boolean {
  if (!locationUrl) return false;
  const parsed = parseCoordinatesFromLocationUrl(locationUrl);
  return (
    parsed !== null &&
    Math.abs(parsed.latitude - latitude) < 1e-5 &&
    Math.abs(parsed.longitude - longitude) < 1e-5
  );
}

/**
 * Les borra las coordenadas y los deja "sin ubicación", para que el ubicador los busque de verdad.
 *
 * También borra el enlace de mapa cuando apunta a las mismas coordenadas: si quedara, el ubicador
 * lo tomaría como una ubicación elegida a mano y volvería a poner el mismo punto falso. Un enlace
 * que apunta a otro lado no se toca.
 */
export async function resetUnverifiedLocations(db: Database): Promise<number> {
  const rows = await findUnverifiedLocations(db);
  for (const row of rows) {
    const clearLink = linkMatches(row.locationUrl, Number(row.latitude), Number(row.longitude));
    await db
      .update(customerAddresses)
      .set({
        geocodingStatus: 'NEEDS_LOCATION',
        latitude: null,
        ...(clearLink ? { locationUrl: null } : {}),
        longitude: null,
        updatedAt: new Date(),
      })
      .where(eq(customerAddresses.id, row.id));
  }
  return rows.length;
}
