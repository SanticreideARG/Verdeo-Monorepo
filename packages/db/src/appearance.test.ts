import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from './index.js';
import { PostgresAppearanceService } from './repositories/postgres-appearance-service.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const USER = 'e0000000-0000-4000-8000-000000000001';

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
});

async function seeded() {
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
  await client.exec(`
    insert into users (id, display_name, email_normalized)
    values ('${USER}', 'Isabella', 'isabella@ejemplo.com');
  `);
  return new PostgresAppearanceService(drizzle(client, { schema }) as unknown as Database);
}

describe('PostgresAppearanceService', () => {
  // Sin fila no hay error ni fila vacía escrita: nadie necesita sembrar nada para entrar.
  it('treats a user with no row as "everything by default"', async () => {
    const service = await seeded();

    expect(await service.get(USER)).toEqual({ fontKey: null, textScale: null, theme: null });
  });

  it('stores a preference and reads it back', async () => {
    const service = await seeded();

    await service.save(USER, { fontKey: 'legible', textScale: 'grande', theme: 'cacao' });

    expect(await service.get(USER)).toEqual({
      fontKey: 'legible',
      textScale: 'grande',
      theme: 'cacao',
    });
  });

  /** Elegir fuente no puede borrar el tema: cada control del panel manda sólo lo suyo. */
  it('keeps the fields it was not asked to change', async () => {
    const service = await seeded();
    await service.save(USER, { theme: 'marea' });

    await service.save(USER, { fontKey: 'mono' });

    expect(await service.get(USER)).toMatchObject({ fontKey: 'mono', theme: 'marea' });
  });

  // Null explícito es "volver al de por defecto", y es distinto de no mandar el campo.
  it('clears a field when it is explicitly set to null', async () => {
    const service = await seeded();
    await service.save(USER, { fontKey: 'serif', theme: 'arena' });

    await service.save(USER, { fontKey: null });

    expect(await service.get(USER)).toEqual({
      fontKey: null,
      textScale: null,
      theme: 'arena',
    });
  });
});
