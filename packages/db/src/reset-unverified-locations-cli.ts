/**
 * El comando que borra las coordenadas que nunca pasaron por el ubicador (las de la semilla de
 * prueba, puestas al azar). La lógica vive en `reset-unverified-locations.ts`.
 *
 * Con `--dry-run` sólo muestra cuáles tocaría. Después, "Ubicar los pedidos" en Rutas los busca de
 * verdad.
 *
 *   pnpm db:reset-unverified-locations --produccion --dry-run
 *   pnpm db:reset-unverified-locations --produccion
 */
import { createDatabase } from './index.js';
import { requireDatabaseUrl } from './require-database-url.js';
import { findUnverifiedLocations, resetUnverifiedLocations } from './reset-unverified-locations.js';

const databaseUrl = requireDatabaseUrl('db:reset-unverified-locations');
const seco = process.argv.includes('--dry-run');
const { client, db } = createDatabase(databaseUrl);

try {
  const filas = await findUnverifiedLocations(db);
  console.log(
    `${String(filas.length)} domicilios con coordenadas que nunca pasaron por el ubicador:`,
  );
  for (const fila of filas.slice(0, 40)) {
    console.log(`  ${fila.customerName.padEnd(28)} ${fila.writtenAddress}`);
  }
  if (filas.length > 40) console.log(`  … y ${String(filas.length - 40)} más.`);

  if (seco) {
    console.log('\n--dry-run: no se borró nada.');
  } else if (filas.length > 0) {
    const borrados = await resetUnverifiedLocations(db);
    console.log(
      `\nListo: ${String(borrados)} domicilios quedaron "sin ubicación". Ubicalos desde Rutas.`,
    );
  }
} finally {
  await client.end();
}
