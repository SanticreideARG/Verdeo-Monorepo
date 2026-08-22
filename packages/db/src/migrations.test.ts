import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Migrations are rehearsed against a real PostgreSQL engine (PGlite) rather than reviewed by eye.
 * A migration that only ever runs for the first time in Preview is an untested migration, and the
 * ones that backfill existing rows are exactly the ones that cannot be rolled back by a script.
 */

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

function migrationFiles(): string[] {
  return readdirSync(migrationsFolder)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

function statementsOf(file: string): string[] {
  return readFileSync(join(migrationsFolder, file), 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !/^(--[^\n]*\n?)*$/.test(statement));
}

async function applyMigrations(database: PGlite, files: readonly string[]): Promise<void> {
  for (const file of files) {
    for (const statement of statementsOf(file)) {
      try {
        await database.exec(statement);
      } catch (error) {
        throw new Error(`${file} failed on:\n${statement.slice(0, 300)}`, { cause: error });
      }
    }
  }
}

async function count(database: PGlite, sql: string): Promise<number> {
  const result = await database.query<{ n: number }>(sql);
  return result.rows[0]?.n ?? -1;
}

/** Rows that predate regional scope, per-size pricing and zoning. */
const preRegionalSeed = `
  insert into users (id, display_name, email_normalized, status)
  values ('11111111-1111-4111-8111-111111111111', 'Santiago', 'santi@example.com', 'active');

  insert into customers (id, display_name)
  values ('22222222-2222-4222-8222-222222222222', 'María Pérez');

  insert into customer_addresses (id, customer_id, label, written_address, city, operational_zone)
  values ('33333333-3333-4333-8333-333333333333',
          '22222222-2222-4222-8222-222222222222',
          'Casa', 'Av. Siempre Viva 742', 'Plottier', 'Centro');

  insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
  values ('44444444-4444-4444-8444-444444444444', 'Semana 34',
          '2026-08-20T12:00:00Z', '2026-08-25T23:00:00Z', '2026-08-26T22:00:00Z');

  insert into weekly_menus (id, sales_cycle_id, status)
  values ('55555555-5555-4555-8555-555555555555',
          '44444444-4444-4444-8444-444444444444', 'PUBLISHED');

  insert into product_families (id, code, display_name) values
    ('66666666-6666-4666-8666-000000000001', 'keto', 'Keto'),
    ('66666666-6666-4666-8666-000000000002', 'real', 'Real'),
    ('66666666-6666-4666-8666-000000000003', 'intuitivo', 'Intuitivo');

  insert into product_variants (id, product_family_id, code, display_name, meals_per_unit) values
    ('77777777-7777-4777-8777-000000000001', '66666666-6666-4666-8666-000000000001', '250', '250', 5),
    ('77777777-7777-4777-8777-000000000002', '66666666-6666-4666-8666-000000000001', '400', '400', 5),
    ('77777777-7777-4777-8777-000000000003', '66666666-6666-4666-8666-000000000002', '250', '250', 5),
    ('77777777-7777-4777-8777-000000000004', '66666666-6666-4666-8666-000000000003', '250', '250', 5);

  -- Real 250 deliberately diverges from the other 250s, which is the case the price backfill
  -- must preserve instead of flattening.
  insert into weekly_menu_offerings (id, weekly_menu_id, product_variant_id, unit_price_minor) values
    ('88888888-8888-4888-8888-000000000001', '55555555-5555-4555-8555-555555555555',
     '77777777-7777-4777-8777-000000000001', 25000),
    ('88888888-8888-4888-8888-000000000002', '55555555-5555-4555-8555-555555555555',
     '77777777-7777-4777-8777-000000000002', 38000),
    ('88888888-8888-4888-8888-000000000003', '55555555-5555-4555-8555-555555555555',
     '77777777-7777-4777-8777-000000000003', 27000),
    ('88888888-8888-4888-8888-000000000004', '55555555-5555-4555-8555-555555555555',
     '77777777-7777-4777-8777-000000000004', 25000);

  -- One order keeps its stored address, one lost it: both must land in an operation.
  insert into orders (customer_id, sales_cycle_id, weekly_menu_id, source, delivery_date,
                      delivery_address_id, delivery_address_snapshot, payment_expectation,
                      total_minor)
  values ('22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444',
          '55555555-5555-4555-8555-555555555555', 'manual', '2026-08-26',
          '33333333-3333-4333-8333-333333333333', 'Av. Siempre Viva 742', 'transferencia', 25000),
         ('22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444',
          '55555555-5555-4555-8555-555555555555', 'web', '2026-08-26',
          null, 'Retira en local', 'efectivo', 38000);
`;

let database: PGlite | null = null;

async function freshDatabase(): Promise<PGlite> {
  database = new PGlite();
  await database.waitReady;
  return database;
}

afterEach(async () => {
  await database?.close();
  database = null;
});

describe('database migrations', () => {
  it('reproduces a clean database from the repository alone', async () => {
    const target = await freshDatabase();

    await expect(applyMigrations(target, migrationFiles())).resolves.toBeUndefined();

    expect(
      await count(
        target,
        `select count(*)::int as n from information_schema.tables
         where table_schema = 'public' and table_name in
           ('orders', 'customers', 'operating_sites', 'geographic_zones',
            'product_sizes', 'weekly_menu_prices')`,
      ),
    ).toBe(6);
  });

  it('backfills existing rows into the regional and per-size model', async () => {
    const target = await freshDatabase();
    const files = migrationFiles();

    await applyMigrations(
      target,
      files.filter((name) => name < '0008'),
    );
    await target.exec(preRegionalSeed);
    await applyMigrations(
      target,
      files.filter((name) => name >= '0008'),
    );

    // Nothing may stay unassigned: these columns are mandatory from here on.
    expect(
      await count(
        target,
        'select count(*)::int as n from product_variants where product_size_id is null',
      ),
    ).toBe(0);
    expect(
      await count(
        target,
        'select count(*)::int as n from customer_addresses where geographic_zone_id is null',
      ),
    ).toBe(0);
    expect(
      await count(target, 'select count(*)::int as n from orders where operating_site_id is null'),
    ).toBe(0);

    const prices = await target.query<{ size: string; unitPriceMinor: number }>(
      `select s.code as size, p.unit_price_minor as "unitPriceMinor"
       from weekly_menu_prices p join product_sizes s on s.id = p.product_size_id
       order by s.code`,
    );
    expect(prices.rows).toEqual([
      { size: '250', unitPriceMinor: 25_000 },
      { size: '400', unitPriceMinor: 38_000 },
    ]);

    // The variety that priced differently survives as an explicit override, not as lost data.
    const overrides = await target.query<{ family: string; unitPriceMinor: number }>(
      `select f.display_name as family, o.unit_price_minor as "unitPriceMinor"
       from weekly_menu_offerings o
       join product_variants v on v.id = o.product_variant_id
       join product_families f on f.id = v.product_family_id
       where o.unit_price_minor is not null`,
    );
    expect(overrides.rows).toEqual([{ family: 'Real', unitPriceMinor: 27_000 }]);

    // The composable variety is recognised once, by code; from here the engine reads `kind`.
    const kinds = await target.query<{ code: string; kind: string }>(
      'select code, kind from product_families order by code',
    );
    expect(kinds.rows).toEqual([
      { code: 'intuitivo', kind: 'COMPOSABLE' },
      { code: 'keto', kind: 'FIXED' },
      { code: 'real', kind: 'FIXED' },
    ]);

    // Regional numbering resumes above the historical series instead of restarting at one.
    const counter = await target.query<{ orderPrefix: string; lastOrderNumber: number }>(
      `select s.order_prefix as "orderPrefix", c.last_order_number as "lastOrderNumber"
       from operating_site_order_counters c
       join operating_sites s on s.id = c.operating_site_id`,
    );
    expect(counter.rows).toEqual([{ lastOrderNumber: 2, orderPrefix: 'NQN' }]);

    // The order with a stored address inherits its zone; the one without keeps a null zone and
    // still belongs to the initial operation.
    const scoped = await target.query<{ site: string; zone: string | null }>(
      `select s.display_name as site, z.display_name as zone
       from orders o
       join operating_sites s on s.id = o.operating_site_id
       left join geographic_zones z on z.id = o.geographic_zone_id
       order by o.public_number`,
    );
    expect(scoped.rows).toEqual([
      { site: 'Neuquén', zone: 'Sin clasificar' },
      { site: 'Neuquén', zone: null },
    ]);

    // Existing users and customers keep exactly the reach they had before scoping existed.
    expect(await count(target, 'select count(*)::int as n from customer_operating_sites')).toBe(1);
    expect(await count(target, 'select count(*)::int as n from user_operating_sites')).toBe(1);
  });

  it('rejects a zone that belongs to a different operation than the order', async () => {
    const target = await freshDatabase();
    await applyMigrations(target, migrationFiles());

    await target.exec(`
      -- A clean database already has the initial operation that 0009 creates, so these are two
      -- further ones.
      insert into operating_sites (id, slug, display_name, order_prefix) values
        ('a0000000-0000-4000-8000-000000000001', 'cipolletti', 'Cipolletti', 'CIP'),
        ('a0000000-0000-4000-8000-000000000002', 'bariloche', 'Bariloche', 'BRC');
      insert into geographic_zones (id, operating_site_id, slug, display_name)
      values ('b0000000-0000-4000-8000-000000000001',
              'a0000000-0000-4000-8000-000000000001', 'centro', 'Centro');
      insert into customers (id, display_name)
      values ('c0000000-0000-4000-8000-000000000001', 'María Pérez');
      insert into sales_cycles (id, alias, open_at, partial_kitchen_cutoff_at, close_at)
      values ('d0000000-0000-4000-8000-000000000001', 'Semana 34',
              '2026-08-20T12:00:00Z', '2026-08-25T23:00:00Z', '2026-08-26T22:00:00Z');
      insert into weekly_menus (id, sales_cycle_id, status)
      values ('e0000000-0000-4000-8000-000000000001',
              'd0000000-0000-4000-8000-000000000001', 'PUBLISHED');
    `);

    // Centro belongs to Cipolletti, so an order claiming Bariloche must be refused by the database
    // itself rather than by an application check that a future caller could bypass (ADR-031).
    await expect(
      target.exec(`
        insert into orders (public_number, customer_id, sales_cycle_id, weekly_menu_id, source,
                            delivery_date, delivery_address_snapshot, payment_expectation,
                            total_minor, operating_site_id, geographic_zone_id)
        values ('BRC-00001', 'c0000000-0000-4000-8000-000000000001',
                'd0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
                'manual', '2026-08-26', 'Av. Siempre Viva 742', 'transferencia', 25000,
                'a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001');
      `),
    ).rejects.toThrow();
  });
});
