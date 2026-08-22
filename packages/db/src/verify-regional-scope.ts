import postgres from 'postgres';

/**
 * Post-migration verification for 0008 and 0009, runnable without psql:
 *
 *   pnpm db:verify-scope
 *
 * Read-only. It inspects the database and never writes. Exits non-zero when a check fails, so it
 * can gate a release step. Neither migration has a down script, so a failure means restore the
 * snapshot rather than patch forward.
 */

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });

interface Check {
  /** A failing count is fatal unless the check is advisory. */
  advisory?: boolean;
  hint: string;
  label: string;
  run: () => Promise<{ count: number }[]>;
}

const checks: Check[] = [
  {
    hint: 'Cada variante debe referenciar un tamaño del catálogo.',
    label: 'variantes sin tamaño',
    run: () =>
      sql`select count(*)::int as count from product_variants where product_size_id is null`,
  },
  {
    hint: 'La zona es el ancla operativa de todo domicilio.',
    label: 'direcciones sin zona',
    run: () =>
      sql`select count(*)::int as count from customer_addresses where geographic_zone_id is null`,
  },
  {
    hint: 'Todo pedido pertenece a una operación.',
    label: 'pedidos sin operación',
    run: () => sql`select count(*)::int as count from orders where operating_site_id is null`,
  },
  {
    hint: 'La clave compuesta debería impedirlo; si aparece, el backfill quedó inconsistente.',
    label: 'pedidos cuya zona es de otra operación',
    run: () => sql`
      select count(*)::int as count
      from orders o
      join geographic_zones z on z.id = o.geographic_zone_id
      where z.operating_site_id <> o.operating_site_id
    `,
  },
  {
    hint: 'Sin contador, la operación no puede emitir números de pedido.',
    label: 'operaciones sin contador de pedidos',
    run: () => sql`
      select count(*)::int as count
      from operating_sites s
      where not exists (
        select 1 from operating_site_order_counters c where c.operating_site_id = s.id
      )
    `,
  },
  {
    hint: 'Un cliente sin membresía no aparece en ninguna ciudad.',
    label: 'clientes sin membresía',
    run: () => sql`
      select count(*)::int as count
      from customers c
      where not exists (select 1 from customer_operating_sites m where m.customer_id = c.id)
    `,
  },
  {
    advisory: true,
    hint: 'Sólo verán datos si tienen sites.access_all; si no, asignales una membresía.',
    label: 'usuarios activos sin membresía',
    run: () => sql`
      select count(*)::int as count
      from users u
      where u.status = 'active'
        and not exists (select 1 from user_operating_sites m where m.user_id = u.id)
    `,
  },
];

let failures = 0;
let warnings = 0;

console.log('\n== Columnas obligatorias ==\n');
for (const check of checks) {
  const [row] = await check.run();
  const count = row?.count ?? -1;
  if (count === 0) {
    console.log(`  PASS  ${check.label}: 0`);
    continue;
  }
  if (check.advisory) {
    warnings += 1;
    console.log(`  WARN  ${check.label}: ${count} — ${check.hint}`);
    continue;
  }
  failures += 1;
  console.log(`  FAIL  ${check.label}: ${count} — ${check.hint}`);
}

console.log('\n== Precios: cada fila es una excepción deliberada por variedad ==\n');
const overrides = await sql<
  { size: string; sizePrice: number | null; override: number; variety: string }[]
>`
  select f.display_name as variety,
         s.code as size,
         o.unit_price_minor as override,
         p.unit_price_minor as "sizePrice"
  from weekly_menu_offerings o
  join product_variants v on v.id = o.product_variant_id
  join product_families f on f.id = v.product_family_id
  join product_sizes s on s.id = v.product_size_id
  left join weekly_menu_prices p
         on p.weekly_menu_id = o.weekly_menu_id and p.product_size_id = v.product_size_id
  where o.unit_price_minor is not null
  order by f.display_name, s.code
`;
if (overrides.length === 0) {
  console.log('  Ninguna. Todas las variedades usan el precio de su tamaño.');
} else {
  for (const row of overrides) {
    console.log(
      `  ${row.variety} ${row.size}: override ${row.override} vs tamaño ${row.sizePrice ?? '—'}`,
    );
  }
  console.log(
    `\n  ${overrides.length} excepción(es). Revisalas antes de que queden como política permanente.`,
  );
}

console.log('\n== Variedad componible: se espera exactamente una ==\n');
const families = await sql<{ code: string; displayName: string; kind: string }[]>`
  select code, display_name as "displayName", kind from product_families order by kind desc, code
`;
for (const family of families) console.log(`  ${family.kind.padEnd(10)} ${family.displayName}`);
const composable = families.filter((family) => family.kind === 'COMPOSABLE').length;
if (families.length === 0) {
  // An installation that has never loaded a menu has no catalog to classify. The first menu the
  // operator creates carries the composition kind, so there is nothing to fix here.
  console.log('  Catálogo vacío: todavía no se cargó ningún menú.');
} else if (composable !== 1) {
  failures += 1;
  console.log(
    `\n  FAIL  hay ${composable} variedades componibles. Ajustá el kind a mano: 0008 reconoce` +
      ' la variedad existente por código una sola vez.',
  );
}

console.log('\n== Numeración regional ==\n');
const counters = await sql<
  { held: number; lastOrderNumber: number; prefix: string; site: string }[]
>`
  select s.display_name as site,
         s.order_prefix as prefix,
         c.last_order_number as "lastOrderNumber",
         (select count(*)::int from orders o where o.operating_site_id = s.id) as held
  from operating_site_order_counters c
  join operating_sites s on s.id = c.operating_site_id
  order by s.sort_order, s.display_name
`;
for (const counter of counters) {
  const aligned = counter.lastOrderNumber >= counter.held;
  if (!aligned) failures += 1;
  console.log(
    `  ${aligned ? 'PASS' : 'FAIL'}  ${counter.site} (${counter.prefix}): contador ` +
      `${counter.lastOrderNumber}, pedidos ${counter.held}` +
      `${aligned ? '' : ' — el próximo número chocaría con uno emitido'}`,
  );
}

console.log('\n== Pendiente del operador ==\n');
const parked = await sql<{ operation: string; toReclassify: number }[]>`
  select s.display_name as operation, count(a.id)::int as "toReclassify"
  from geographic_zones z
  join operating_sites s on s.id = z.operating_site_id
  left join customer_addresses a on a.geographic_zone_id = z.id
  where z.slug = 'sin-clasificar'
  group by s.display_name
`;
if (parked.length === 0) {
  console.log('  No hay zona de migración: nada que reclasificar.');
} else {
  for (const row of parked) {
    console.log(`  ${row.operation}: ${row.toReclassify} domicilio(s) en "Sin clasificar"`);
  }
}

await sql.end();

console.log(
  failures === 0
    ? `\n✅ Verificación superada${warnings > 0 ? ` (${warnings} aviso/s)` : ''}\n`
    : `\n❌ ${failures} verificación(es) fallida(s). No avances: restaurá el snapshot.\n`,
);
process.exit(failures === 0 ? 0 : 1);
