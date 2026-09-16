import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { PostgresBackupService } from './repositories/postgres-backup-service.js';
import type { Database } from './index.js';
import { geographicZones, operatingSites } from './schema/index.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function migratedDatabase(): Promise<{ close: () => Promise<void>; db: Database }> {
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

  return { close: () => client.close(), db: drizzle(client, { schema }) as unknown as Database };
}

const abiertas: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cerrar of abiertas.splice(0)) await cerrar();
});

async function baseConCiudad() {
  const { close, db } = await migratedDatabase();
  abiertas.push(close);
  // La migración 0009 ya siembra Neuquén: se usa esa en vez de crear otra, que chocaría por slug.
  const [ciudad] = await db.select().from(operatingSites).limit(1);
  await db
    .insert(geographicZones)
    .values({ displayName: 'Centro', operatingSiteId: ciudad!.id, slug: 'centro-test' });
  return { ciudad: ciudad!, db, servicio: new PostgresBackupService(db, 'test') };
}

describe('respaldo y restauración', () => {
  it('se lleva las ciudades y sus zonas, con el manifiesto', async () => {
    const { servicio } = await baseConCiudad();

    const paquete = await servicio.exportBackup({ parts: ['operacion'] });

    expect(paquete.data.operating_sites).toHaveLength(1);
    expect((paquete.data.geographic_zones as unknown[]).length).toBeGreaterThan(0);
    expect(paquete.manifest.counts.operating_sites).toBe(1);
    expect(paquete.manifest.parts).toEqual(['operacion']);
  });

  it('la simulación no escribe nada', async () => {
    const { db, servicio } = await baseConCiudad();
    const paquete = await servicio.exportBackup({ parts: ['operacion'] });
    // Una ciudad que está en el archivo y no en la base: la simulación tiene que contarla sin crearla.
    (paquete.data.operating_sites as Record<string, unknown>[]).push({
      ...(paquete.data.operating_sites as Record<string, unknown>[])[0],
      displayName: 'Mendoza',
      id: '90000000-0000-4000-8000-0000000000aa',
      orderPrefix: 'MZA',
      slug: 'mendoza',
    });

    const informe = await servicio.restoreBackup(paquete, { dryRun: true, mode: 'faltantes' });

    expect(informe.totalCrear).toBe(1);
    expect(await db.select().from(operatingSites)).toHaveLength(1);
  });

  it('"faltantes" crea lo que no está y no pisa lo que sí', async () => {
    const { ciudad, db, servicio } = await baseConCiudad();
    const paquete = await servicio.exportBackup({ parts: ['operacion'] });
    // El archivo trae la ciudad con otro nombre: en este modo no debe ganar.
    (paquete.data.operating_sites as Record<string, unknown>[])[0]!.displayName = 'Otro nombre';

    await servicio.restoreBackup(paquete, { dryRun: false, mode: 'faltantes' });

    const [enBase] = await db.select().from(operatingSites).where(eq(operatingSites.id, ciudad.id));
    expect(enBase?.displayName).toBe('Neuquén');
  });

  it('"reemplazar" deja la base como el archivo', async () => {
    const { ciudad, db, servicio } = await baseConCiudad();
    const paquete = await servicio.exportBackup({ parts: ['operacion'] });
    (paquete.data.operating_sites as Record<string, unknown>[])[0]!.displayName = 'Neuquén capital';

    const informe = await servicio.restoreBackup(paquete, { dryRun: false, mode: 'reemplazar' });

    const [enBase] = await db.select().from(operatingSites).where(eq(operatingSites.id, ciudad.id));
    expect(enBase?.displayName).toBe('Neuquén capital');
    expect(informe.totalActualizar).toBeGreaterThan(0);
  });

  it('no restaura un archivo de otro esquema', async () => {
    const { servicio } = await baseConCiudad();
    const paquete = await servicio.exportBackup({ parts: ['operacion'] });
    paquete.manifest.schemaVersion = '3 migraciones';

    // Un archivo de otra versión puede traer columnas que ya no existen, o no traer las nuevas: eso
    // no se arregla a mitad de camino, así que ni se empieza.
    await expect(
      servicio.restoreBackup(paquete, { dryRun: true, mode: 'faltantes' }),
    ).rejects.toThrow(/esquema|migraciones/i);
  });

  it('nunca borra lo que está en la base y no en el archivo', async () => {
    const { db, servicio } = await baseConCiudad();
    const paquete = await servicio.exportBackup({ parts: ['operacion'] });
    await db
      .insert(operatingSites)
      .values({ displayName: 'Córdoba', orderPrefix: 'CBA', slug: 'cordoba' });

    await servicio.restoreBackup(paquete, { dryRun: false, mode: 'reemplazar' });

    expect(await db.select().from(operatingSites)).toHaveLength(2);
  });
});
