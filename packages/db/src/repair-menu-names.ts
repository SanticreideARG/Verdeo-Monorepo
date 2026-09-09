/**
 * Corrige la caja de los nombres de variedad ya cargados.
 *
 * A partir de ahora `writeMenuPricesAndOfferings` los normaliza al guardar, pero los menús que ya
 * están en la base siguen gritando: "MENÚ NUEVO KETO" en la web pública, en el formulario, en las
 * etiquetas y en la grilla de la semana. Esto los arregla de una vez, sin esperar a que alguien
 * vuelva a guardar cada menú.
 *
 * Toca `product_families.display_name` y `product_variants.display_name`, que son los nombres para
 * mostrar. **No toca los snapshots de los pedidos ya vendidos** (`order_items.product_name_snapshot`):
 * eso es lo que decía la etiqueta el día que se vendió, y reescribirlo sería falsear el historial.
 * Las estadísticas ya juntan las cajas al leer, así que el informe sale bien igual.
 *
 * Sólo cambia lo que está enteramente en mayúsculas, la misma regla conservadora que al guardar:
 * quien escribió "Menú KETO" a propósito lo conserva.
 *
 * Con `--dry-run` sólo informa. Es idempotente.
 */
import { sql } from 'drizzle-orm';

import { normalizeMenuName } from '@verdeo/orders';

import { createDatabase } from './index.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const dryRun = process.argv.includes('--dry-run');

const { client, db } = createDatabase(databaseUrl);

function rowsOf(result: unknown): Record<string, unknown>[] {
  return ((result as { rows?: Record<string, unknown>[] }).rows ?? result) as Record<
    string,
    unknown
  >[];
}

try {
  const cambios: { desde: string; hasta: string; id: string; tabla: string }[] = [];

  for (const tabla of ['product_families', 'product_variants']) {
    const filas = rowsOf(
      await db.execute(sql`select id, display_name from ${sql.identifier(tabla)}`),
    );
    for (const fila of filas) {
      const desde = String(fila.display_name);
      const hasta = normalizeMenuName(desde);
      if (hasta !== desde) cambios.push({ desde, hasta, id: String(fila.id), tabla });
    }
  }

  if (cambios.length === 0) {
    console.log('Ningún nombre para corregir.');
  } else {
    console.table(cambios.map(({ desde, hasta, tabla }) => ({ desde, hasta, tabla })));

    if (dryRun) {
      console.log(`\n--dry-run: no se cambió nada (${String(cambios.length)} nombres).`);
    } else {
      for (const cambio of cambios) {
        await db.execute(
          sql`update ${sql.identifier(cambio.tabla)}
              set display_name = ${cambio.hasta}, updated_at = now()
              where id = ${cambio.id}`,
        );
      }
      console.log(`\nNombres corregidos: ${String(cambios.length)}.`);
    }
  }
} finally {
  await client.end();
}
