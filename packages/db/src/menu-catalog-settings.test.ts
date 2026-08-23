import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import { PostgresOperationsService } from './repositories/postgres-operations-service.js';
import type { Database } from './index.js';
import { menuCatalogSettings, productFamilies, weeklyMenuItems } from './schema/index.js';
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

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function seededService(): Promise<{ db: Database; service: PostgresOperationsService }> {
  const { close: closeDatabase, db } = await migratedDatabase();
  close = closeDatabase;
  return {
    db,
    service: new PostgresOperationsService(db, {
      key: 'test',
      resolve: () => Promise.resolve({ candidates: [], status: 'NO_MATCH' }),
    } as never),
  };
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

describe('menu catalog settings', () => {
  it('defaults to intuitivoEnabled: true with no row', async () => {
    const { service } = await seededService();

    const settings = await service.getMenuCatalogSettings();

    expect(settings.intuitivoEnabled).toBe(true);
  });

  it('updates the same row in place across repeated toggles', async () => {
    const { db, service } = await seededService();

    await service.setIntuitivoEnabled(false, CONTEXT);
    expect((await service.getMenuCatalogSettings()).intuitivoEnabled).toBe(false);

    await service.setIntuitivoEnabled(true, CONTEXT);
    expect((await service.getMenuCatalogSettings()).intuitivoEnabled).toBe(true);

    const rows = await db.select().from(menuCatalogSettings);
    expect(rows).toHaveLength(1);
  });
});

describe('createMenu and the Intuitivo toggle', () => {
  it('rejects a composable offering when Intuitivo is disabled', async () => {
    const { service } = await seededService();
    await service.setIntuitivoEnabled(false, CONTEXT);

    await expect(
      service.createMenu(
        { ...menuInputBase, offerings: [fixedOffering('Real'), composableOffering()] },
        CONTEXT,
      ),
    ).rejects.toThrow(/deshabilitado en Ajustes/);
  });

  it('allows a composable offering when Intuitivo is enabled (default) and coerces its name', async () => {
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
      {
        ...menuInputBase,
        offerings: [fixedOffering('Real'), composableOffering('Intuitivo')],
      },
      CONTEXT,
    );

    // 5 items for the fixed "Real" offering, 0 for the composable one — never 10.
    const items = await db.select().from(weeklyMenuItems);
    expect(items).toHaveLength(5);
  });
});
