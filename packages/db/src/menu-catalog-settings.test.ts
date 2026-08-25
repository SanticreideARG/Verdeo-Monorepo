import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import { PostgresOperationsService } from './repositories/postgres-operations-service.js';
import type { Database } from './index.js';
import {
  menuCatalogSettings,
  productFamilies,
  weeklyMenuItems,
  weeklyMenuOfferings,
  weeklyMenus,
} from './schema/index.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function migratedDatabase(): Promise<{
  client: PGlite;
  close: () => Promise<void>;
  db: Database;
}> {
  const client = new PGlite();
  await client.waitReady;

  for (const file of readdirSync(migrationsFolder)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    for (const statement of readFileSync(join(migrationsFolder, file), 'utf8')
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !/^(--[^\n]*\n?)*$/.test(part))) {
      await client.exec(statement);
    }
  }

  return {
    client,
    close: () => client.close(),
    db: drizzle(client, { schema }) as unknown as Database,
  };
}

const CONTEXT = { correlationId: 'test', requestId: 'test', source: 'test' };
const SITE_A = 'a0000000-0000-4000-8000-000000000101';
const SITE_B = 'a0000000-0000-4000-8000-000000000102';

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function seededService(): Promise<{
  client: PGlite;
  db: Database;
  service: PostgresOperationsService;
}> {
  const { client, close: closeDatabase, db } = await migratedDatabase();
  close = closeDatabase;
  return {
    client,
    db,
    service: new PostgresOperationsService(db, {
      key: 'test',
      resolve: () => Promise.resolve({ candidates: [], status: 'NO_MATCH' }),
    } as never),
  };
}

async function seededServiceWithSites(): Promise<{
  client: PGlite;
  db: Database;
  service: PostgresOperationsService;
}> {
  const seeded = await seededService();
  await seeded.client.exec(`
    insert into operating_sites (id, slug, display_name, order_prefix)
    values
      ('${SITE_A}', 'test-site-a', 'Sitio A', 'TSA'),
      ('${SITE_B}', 'test-site-b', 'Sitio B', 'TSB');
  `);
  return seeded;
}

const fixedOffering = (name: string) => ({
  composable: false,
  dishes: ['A', 'B', 'C', 'D', 'E'],
  familyName: name,
  sizeName: '250',
});

const composableOffering = (familyName = 'lo que sea') => ({
  composable: true,
  dishes: [],
  familyName,
  sizeName: '250',
});

const menuInputBase = {
  alias: 'Semana 34',
  closeAt: '2026-08-26T22:00:00.000Z',
  openAt: '2026-08-20T12:00:00.000Z',
  partialKitchenCutoffAt: '2026-08-25T23:00:00.000Z',
  prices: [{ currency: 'ARS', mealsPerUnit: 5, sizeName: '250', unitPriceMinor: 25000 }],
};

describe('per-site menu catalog settings', () => {
  it('defaults every active site to intuitivoEnabled: true with no row', async () => {
    const { service } = await seededServiceWithSites();

    // Migration 0009's backfill auto-creates a "neuquen" site on any clean database, so the list
    // legitimately has more than just the two seeded here — check the two under test, not the count.
    const list = await service.listMenuCatalogSettings();

    expect(list.find((row) => row.operatingSiteId === SITE_A)?.intuitivoEnabled).toBe(true);
    expect(list.find((row) => row.operatingSiteId === SITE_B)?.intuitivoEnabled).toBe(true);
  });

  it('toggles one site without affecting another', async () => {
    const { service } = await seededServiceWithSites();

    await service.setIntuitivoEnabled(SITE_A, false, CONTEXT);
    const list = await service.listMenuCatalogSettings();

    expect(list.find((row) => row.operatingSiteId === SITE_A)?.intuitivoEnabled).toBe(false);
    expect(list.find((row) => row.operatingSiteId === SITE_B)?.intuitivoEnabled).toBe(true);
  });

  it('updates the same row in place across repeated toggles for one site', async () => {
    const { db, service } = await seededServiceWithSites();

    await service.setIntuitivoEnabled(SITE_A, false, CONTEXT);
    await service.setIntuitivoEnabled(SITE_A, true, CONTEXT);

    const rows = await db.select().from(menuCatalogSettings);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.intuitivoEnabled).toBe(true);
  });

  it('rejects toggling an unknown site', async () => {
    const { service } = await seededServiceWithSites();

    await expect(
      service.setIntuitivoEnabled('00000000-0000-4000-8000-000000000000', false, CONTEXT),
    ).rejects.toThrow();
  });
});

describe('createMenu (master, global — no per-site gate)', () => {
  it('allows a composable offering unconditionally and coerces its name', async () => {
    const { db, service } = await seededService();

    await service.createMenu(
      {
        ...menuInputBase,
        offerings: [fixedOffering('Real'), composableOffering('nombre inventado')],
      },
      CONTEXT,
    );

    const families = await db.select().from(productFamilies);
    const composableFamily = families.find((family) => family.kind === 'COMPOSABLE');
    expect(composableFamily?.displayName).toBe('Intuitivo');
  });

  it('stores no weekly_menu_items for the composable offering', async () => {
    const { db, service } = await seededService();

    await service.createMenu(
      { ...menuInputBase, offerings: [fixedOffering('Real'), composableOffering('Intuitivo')] },
      CONTEXT,
    );

    // 5 items for the fixed "Real" offering, 0 for the composable one — never 10.
    const items = await db.select().from(weeklyMenuItems);
    expect(items).toHaveLength(5);
  });

  it('stores an offering description, and leaves it null when omitted', async () => {
    const { db, service } = await seededService();

    await service.createMenu(
      {
        ...menuInputBase,
        offerings: [
          { ...fixedOffering('Con descripción'), description: 'Bajo en carbohidratos' },
          fixedOffering('Sin descripción'),
        ],
      },
      CONTEXT,
    );

    const offerings = await db.select().from(weeklyMenuOfferings);
    const withDescription = offerings.find((row) => row.description !== null);
    const withoutDescription = offerings.find((row) => row.description === null);
    expect(withDescription?.description).toBe('Bajo en carbohidratos');
    expect(withoutDescription?.description).toBeNull();
  });
});

describe('updateMenu', () => {
  it('replaces offerings, prices and cycle fields wholesale, keeping the same menu id', async () => {
    const { db, service } = await seededService();
    const created = await service.createMenu(
      { ...menuInputBase, offerings: [fixedOffering('Original')] },
      CONTEXT,
    );

    const updated = await service.updateMenu(
      created.id,
      {
        ...menuInputBase,
        alias: 'Semana 34 (corregida)',
        offerings: [{ ...fixedOffering('Corregida'), description: 'Ahora sí' }],
      },
      CONTEXT,
    );

    expect(updated.id).toBe(created.id);
    expect(updated.cycle.alias).toBe('Semana 34 (corregida)');
    expect(updated.offerings).toHaveLength(1);
    expect(updated.offerings[0]?.familyName).toBe('Corregida');
    expect(updated.offerings[0]?.description).toBe('Ahora sí');

    // The old "Original" offering (and its 5 dishes) is gone, not left behind alongside the new one.
    const offerings = await db
      .select()
      .from(weeklyMenuOfferings)
      .where(eq(weeklyMenuOfferings.weeklyMenuId, created.id));
    expect(offerings).toHaveLength(1);
    const items = await db.select().from(weeklyMenuItems);
    expect(items).toHaveLength(5);
  });

  it('rejects updating a menu that does not exist', async () => {
    const { service } = await seededService();
    await expect(
      service.updateMenu(
        '00000000-0000-4000-8000-000000000000',
        { ...menuInputBase, offerings: [fixedOffering('Real')] },
        CONTEXT,
      ),
    ).rejects.toThrow();
  });
});

describe('distributeMenu and the per-site Intuitivo toggle', () => {
  it('excludes the composable offering only for a site that disabled it', async () => {
    const { db, service } = await seededServiceWithSites();
    await service.setIntuitivoEnabled(SITE_A, false, CONTEXT);

    const master = await service.createMenu(
      { ...menuInputBase, offerings: [fixedOffering('Real'), composableOffering('Intuitivo')] },
      CONTEXT,
    );
    await service.distributeMenu(
      master.id,
      { mode: 'CREATE_MISSING', operatingSiteIds: [SITE_A, SITE_B] },
      CONTEXT,
    );

    const regionalMenus = await db
      .select({ id: weeklyMenus.id, operatingSiteId: weeklyMenus.operatingSiteId })
      .from(weeklyMenus);
    const menuA = regionalMenus.find((menu) => menu.operatingSiteId === SITE_A);
    const menuB = regionalMenus.find((menu) => menu.operatingSiteId === SITE_B);
    expect(menuA).toBeDefined();
    expect(menuB).toBeDefined();

    const offeringsA = await db
      .select()
      .from(weeklyMenuOfferings)
      .where(eq(weeklyMenuOfferings.weeklyMenuId, menuA!.id));
    const offeringsB = await db
      .select()
      .from(weeklyMenuOfferings)
      .where(eq(weeklyMenuOfferings.weeklyMenuId, menuB!.id));

    expect(offeringsA).toHaveLength(1); // only "Real" — Intuitivo excluded for site A
    expect(offeringsB).toHaveLength(2); // "Real" + Intuitivo — enabled by default for site B
  });

  it('copies the offering description from master onto a newly distributed regional menu', async () => {
    const { db, service } = await seededServiceWithSites();

    const master = await service.createMenu(
      {
        ...menuInputBase,
        offerings: [{ ...fixedOffering('Real'), description: 'Bajo en carbohidratos' }],
      },
      CONTEXT,
    );
    await service.distributeMenu(
      master.id,
      { mode: 'CREATE_MISSING', operatingSiteIds: [SITE_A] },
      CONTEXT,
    );

    const regional = await db
      .select({ id: weeklyMenus.id })
      .from(weeklyMenus)
      .where(eq(weeklyMenus.operatingSiteId, SITE_A));
    const regionalOfferings = await db
      .select()
      .from(weeklyMenuOfferings)
      .where(eq(weeklyMenuOfferings.weeklyMenuId, regional[0]!.id));
    expect(regionalOfferings[0]?.description).toBe('Bajo en carbohidratos');
  });
});
