/**
 * El comando que borra los datos de prueba antes del arranque de producción. La lógica vive en
 * `purge-test-data.ts`.
 *
 * Primero en seco: muestra qué período se conserva, qué se borra y cómo quedan los números de
 * pedido, sin cambiar nada. Para borrar de verdad hay que pedirlo explícitamente con --confirmar.
 *
 *   pnpm db:purge-test-data --produccion --dry-run
 *   pnpm db:purge-test-data --produccion --confirmar
 */
import { createDatabase } from './index.js';
import { purgeTestData } from './purge-test-data.js';
import { requireDatabaseUrl } from './require-database-url.js';

const dryRun = process.argv.includes('--dry-run');
const confirmed = process.argv.includes('--confirmar');
if (!dryRun && !confirmed) {
  console.error(
    'Esto borra datos de producción. Miralo primero en seco con --dry-run, y para borrar de verdad agregá --confirmar.',
  );
  process.exit(1);
}

const databaseUrl = requireDatabaseUrl('db:purge-test-data');
const { client, db } = createDatabase(databaseUrl);

try {
  const summary = await purgeTestData(db, { dryRun });
  const list = (items: string[], max = 40) =>
    items.length === 0
      ? '  (ninguno)'
      : [
          ...items.slice(0, max).map((item) => `  ${item}`),
          ...(items.length > max ? [`  … y ${String(items.length - max)} más.`] : []),
        ].join('\n');

  console.log(
    `\nSe conserva el período en curso: ${summary.kept.alias} (abrió ${summary.kept.openAt.slice(0, 10)}).`,
  );
  console.log(
    `\nPeríodos de prueba que se borran (${String(summary.cycles.length)}):\n${list(summary.cycles)}`,
  );
  console.log(
    `\nCon ellos: ${String(summary.menus)} menús, ${String(summary.orders)} pedidos y ${String(summary.routes)} rutas.`,
  );
  console.log(
    `\nClientes ficticios que se borran (${String(summary.customers.length)}):\n${list(summary.customers)}`,
  );
  if (summary.keptOldCustomers.length > 0) {
    console.log(
      `\nCargados antes del período pero CONSERVADOS porque tienen pedidos en él (${String(summary.keptOldCustomers.length)}):\n${list(summary.keptOldCustomers)}`,
    );
  }
  const changed = summary.renumbered.filter((row) => row.from !== row.to);
  console.log(
    `\nPedidos del período en curso renumerados (${String(changed.length)} de ${String(summary.renumbered.length)}):\n${list(changed.map((row) => `${row.from} → ${row.to}`))}`,
  );
  console.log(
    dryRun
      ? '\n--dry-run: no se borró nada. Si está bien, corré lo mismo con --confirmar en lugar de --dry-run.'
      : '\nListo: se borraron los datos de prueba. Quedó registrado en la auditoría.',
  );
} finally {
  await client.end();
}
