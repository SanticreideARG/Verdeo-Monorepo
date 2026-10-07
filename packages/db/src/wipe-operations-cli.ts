/**
 * El comando que vacía los datos de operación. La lógica vive en `wipe-operations.ts`.
 *
 * Imprime lo que hay, borra, e imprime lo que se fue. Con `--dry-run` sólo cuenta.
 *
 * Con `--solo-ultimo-periodo` conserva únicamente el período más reciente y borra los demás con sus
 * menús y precios. Sin esa bandera se conservan todos los períodos.
 *
 * Esto no se puede deshacer: el respaldo se baja antes desde el panel (`/app/respaldos`).
 */
import { asc, isNull, ne, sql } from 'drizzle-orm';

import { createDatabase } from './index.js';
import { requireDatabaseUrl } from './require-database-url.js';
import { deliveryRoutes, deliveryStops, salesCycles } from './schema/index.js';
import { countOperations, findLatestCycle, wipeOperations } from './wipe-operations.js';

const databaseUrl = requireDatabaseUrl('db:wipe-operations');
const seco = process.argv.includes('--dry-run');
const soloUltimo = process.argv.includes('--solo-ultimo-periodo');

const { client, db } = createDatabase(databaseUrl);

const dia = (fecha: Date) => fecha.toISOString().slice(0, 10);

try {
  const antes = await countOperations(db);
  console.log('Lo que hay ahora:');
  for (const [nombre, cantidad] of Object.entries(antes).sort()) {
    console.log(`  ${nombre.padEnd(16)} ${String(cantidad)}`);
  }

  /*
   * Qué períodos se quedan y cuáles se van, dicho antes de borrar.
   *
   * "El último" se resuelve por fecha de cierre, y una regla que se aplica sola sobre datos que no
   * se pueden recuperar se tiene que poder leer antes de ejecutarse. Si la semana que aparece acá no
   * es la que se quiere conservar, es el momento de cortar.
   */
  let conservar: string | undefined;
  if (soloUltimo) {
    const ultimo = await findLatestCycle(db);
    if (!ultimo) {
      console.log('\nNo hay ningún período cargado: --solo-ultimo-periodo no tiene qué conservar.');
    } else {
      conservar = ultimo.id;
      const aBorrar = await db
        .select({ alias: salesCycles.alias, closeAt: salesCycles.closeAt })
        .from(salesCycles)
        .where(ne(salesCycles.id, ultimo.id))
        .orderBy(asc(salesCycles.closeAt));
      console.log(`\nSe conserva el período: ${ultimo.alias} (cierra ${dia(ultimo.closeAt)})`);
      if (aBorrar.length === 0) {
        console.log('No hay otros períodos que borrar.');
      } else {
        console.log(`Se borran ${String(aBorrar.length)} período(s), con sus menús y precios:`);
        for (const periodo of aBorrar) {
          console.log(`  - ${periodo.alias} (cierra ${dia(periodo.closeAt)})`);
        }
      }
    }
  } else {
    console.log(
      '\nSe conservan todos los períodos. (Para quedarse sólo con el último: --solo-ultimo-periodo)',
    );
  }

  if (antes.clientes === 0 && antes.pedidos === 0 && conservar === undefined) {
    console.log('\nNo hay clientes ni pedidos. Nada que hacer.');
  } else if (seco) {
    console.log('\n--dry-run: no se borró nada.');
  } else {
    await wipeOperations(db, conservar ? { keepOnlyCycleId: conservar } : {});

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

    console.log(
      '\nListo. Quedaron intactos: ciudades, zonas, variedades y tamaños, métodos de pago,',
    );
    console.log('usuarios, roles, plantillas, ayuda y contenidos del sitio.');
  }
} finally {
  await client.end();
}
