/**
 * El comando que vacía los datos de operación. La lógica vive en `wipe-operations.ts`.
 *
 * Imprime lo que hay, borra, e imprime lo que se fue. Con `--dry-run` sólo cuenta.
 *
 * Esto no se puede deshacer: el respaldo se baja antes desde el panel (`/app/respaldos`).
 */
import { isNull, sql } from 'drizzle-orm';

import { createDatabase } from './index.js';
import { requireDatabaseUrl } from './require-database-url.js';
import { deliveryRoutes, deliveryStops } from './schema/index.js';
import { countOperations, wipeOperations } from './wipe-operations.js';

const databaseUrl = requireDatabaseUrl('db:wipe-operations');
const seco = process.argv.includes('--dry-run');

const { client, db } = createDatabase(databaseUrl);

try {
  const antes = await countOperations(db);
  console.log('Lo que hay ahora:');
  for (const [nombre, cantidad] of Object.entries(antes).sort()) {
    console.log(`  ${nombre.padEnd(16)} ${String(cantidad)}`);
  }

  if (antes.clientes === 0 && antes.pedidos === 0) {
    console.log('\nNo hay clientes ni pedidos. Nada que hacer.');
  } else if (seco) {
    console.log('\n--dry-run: no se borró nada.');
  } else {
    await wipeOperations(db);

    const despues = await countOperations(db);
    console.log('\nBorrado:');
    for (const [nombre, cantidad] of Object.entries(antes).sort()) {
      const quedan = despues[nombre as keyof typeof despues];
      console.log(
        `  ${nombre.padEnd(16)} -${String(cantidad - quedan)}` +
          (quedan > 0 ? ` (quedan ${String(quedan)})` : ''),
      );
    }

    /*
     * Una ruta sin paradas no rompe nada, pero queda a la vista en Rutas como si fuera una hoja del
     * día. Se informa en vez de borrarse: una ruta es del período y no del cliente, y esto es una
     * limpieza de clientes.
     */
    const vacias = await db
      .select({ id: deliveryRoutes.id })
      .from(deliveryRoutes)
      .leftJoin(deliveryStops, sql`${deliveryStops.routeId} = ${deliveryRoutes.id}`)
      .where(isNull(deliveryStops.id));
    if (vacias.length > 0) {
      console.log(
        `\n${String(vacias.length)} hoja(s) de ruta quedaron sin paradas. No se borraron: una ruta` +
          ' es del período, no del cliente. Se eliminan desde la pantalla de Rutas.',
      );
    }

    console.log('\nListo. El catálogo quedó intacto: ciudades, zonas, menús, períodos, precios,');
    console.log('métodos de pago, usuarios, roles, plantillas, ayuda y contenidos del sitio.');
  }
} finally {
  await client.end();
}
