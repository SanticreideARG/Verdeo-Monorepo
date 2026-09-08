import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import { PostgresOperationsService } from './repositories/postgres-operations-service.js';
import type { Database } from './index.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const CONTEXT = { correlationId: 'test', requestId: 'test', source: 'test' };

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function service(): Promise<PostgresOperationsService> {
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
  close = () => client.close();
  return new PostgresOperationsService(
    drizzle(client, { schema }) as unknown as Database,
    {
      key: 'test',
      resolve: () => Promise.resolve({ candidates: [], status: 'NO_MATCH' }),
    } as never,
  );
}

describe('ajustes de etiquetas', () => {
  it('devuelve los campos como lista al guardar, igual que al leer', async () => {
    const operations = await service();

    const saved = await operations.setLabelSettings(
      { fields: ['tamano', 'variedad'], labelsPerPage: 12 },
      CONTEXT,
    );

    /*
     * `fields` se guarda como texto separado por comas. Devolver la fila cruda hacía fallar el
     * parseo de la respuesta *después* de haber guardado: el cambio quedaba aplicado y la pantalla
     * mostraba "Ocurrió un error inesperado", así que parecía no haber guardado nada.
     */
    expect(saved.fields).toEqual(['tamano', 'variedad']);
    expect((await operations.getLabelSettings()).fields).toEqual(['tamano', 'variedad']);
  });

  it('conserva lo que no viene en el pedido', async () => {
    const operations = await service();
    await operations.setLabelSettings(
      { fields: ['zona'], fontScale: 150, labelsPerPage: 8, uppercaseName: true },
      CONTEXT,
    );

    // La subida del fondo manda sólo la imagen: no puede borrar el resto de la configuración.
    const after = await operations.setLabelSettings(
      { backgroundImageUrl: 'https://ejemplo.test/fondo.png', labelsPerPage: 8 },
      CONTEXT,
    );

    expect(after.backgroundImageUrl).toBe('https://ejemplo.test/fondo.png');
    expect(after.fields).toEqual(['zona']);
    expect(after.fontScale).toBe(150);
    expect(after.uppercaseName).toBe(true);
  });

  it('ignora un campo guardado que ya no existe en el catálogo', async () => {
    const operations = await service();
    await operations.setLabelSettings({ fields: ['tamano'], labelsPerPage: 8 }, CONTEXT);

    // Un catálogo que cambió no puede romper la impresión.
    const saved = await operations.setLabelSettings(
      { fields: ['tamano', 'inventado'], labelsPerPage: 8 },
      CONTEXT,
    );

    expect(saved.fields).toEqual(['tamano']);
  });

  it('acepta una elección vacía: sólo el nombre', async () => {
    const operations = await service();

    const saved = await operations.setLabelSettings({ fields: [], labelsPerPage: 8 }, CONTEXT);

    // Vacío es una elección válida, no "usá los de por defecto".
    expect(saved.fields).toEqual([]);
  });
});
