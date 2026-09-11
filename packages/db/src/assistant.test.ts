import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import { PostgresAssistantService } from './repositories/postgres-assistant-service.js';
import type { Database } from './index.js';
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

const CONTEXT = { correlationId: 'test', requestId: 'test', source: 'test' };

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function service() {
  const { close: closeDatabase, db } = await migratedDatabase();
  close = closeDatabase;
  return new PostgresAssistantService(db);
}

interface Option {
  behaviour: string;
  key: string;
  label: string;
  needsCity: boolean;
}

describe('asistente de la landing', () => {
  it('arranca con las cinco opciones que se pidieron, ya publicadas', async () => {
    const assistant = await service();

    const flow = (await assistant.getPublishedFlow()) as { greeting: string; options: Option[] };

    /*
     * Se crean al leerlo por primera vez y no con una migración de datos: una migración que inserta
     * filas hay que repetirla a mano en cada entorno, y esto es configuración que tiene que existir
     * siempre. Ya publicadas, porque un asistente que arranca vacío no sirve para nada.
     */
    expect(flow.options.map((option) => option.key)).toEqual([
      'menus',
      'precios',
      'entrega',
      'pedir',
      'hablar',
    ]);
    expect(flow.greeting).toContain('Verdeo');
  });

  it('las tres respuestas que dependen de la ciudad la piden', async () => {
    const assistant = await service();

    const flow = (await assistant.getPublishedFlow()) as { options: Option[] };
    const needCity = flow.options.filter((option) => option.needsCity).map((o) => o.key);

    // El menú se distribuye por ciudad y el precio depende del tamaño y de la ciudad (ADR-030,
    // ADR-031): contestarlas sin preguntarla sería contestar cualquier cosa.
    expect(needCity).toEqual(['menus', 'precios', 'entrega']);
  });

  it('un borrador guardado no llega a la landing hasta que se publica', async () => {
    const assistant = await service();
    await assistant.saveDraft(
      { greeting: 'Nuevo saludo', options: [] },
      { ...CONTEXT, actorUserId: undefined },
    );

    const published = (await assistant.getPublishedFlow()) as { greeting: string };
    const editable = (await assistant.getEditableFlow()) as {
      greeting: string;
      unpublishedChanges: boolean;
    };

    // Es la razón de que haya revisiones: un árbol a medio armar no puede aparecer en la web.
    expect(published.greeting).not.toBe('Nuevo saludo');
    expect(editable.greeting).toBe('Nuevo saludo');
    expect(editable.unpublishedChanges).toBe(true);
  });

  it('publicar deja el borrador a la vista y limpia el aviso', async () => {
    const assistant = await service();
    await assistant.saveDraft({ greeting: 'Ya publicado', options: [] }, CONTEXT);

    await assistant.publish(CONTEXT);

    const published = (await assistant.getPublishedFlow()) as { greeting: string };
    const editable = (await assistant.getEditableFlow()) as { unpublishedChanges: boolean };
    expect(published.greeting).toBe('Ya publicado');
    expect(editable.unpublishedChanges).toBe(false);
  });

  it('cada guardado escribe una revisión en vez de pisar la anterior', async () => {
    const assistant = await service();

    await assistant.saveDraft({ greeting: 'Uno', options: [] }, CONTEXT);
    await assistant.saveDraft({ greeting: 'Dos', options: [] }, CONTEXT);

    // Sin esto no habría a dónde volver cuando alguien deja el árbol inconsistente.
    const editable = (await assistant.getEditableFlow()) as { revision: number };
    expect(editable.revision).toBe(3);
  });
});

describe('contador de toques', () => {
  it('suma sin guardar nada sobre quién tocó', async () => {
    const assistant = await service();

    await assistant.recordHit('precios');
    await assistant.recordHit('precios');
    await assistant.recordHit('menus');

    /*
     * Las conversaciones no se guardan, pero saber qué se pregunta no exige guardarlas: alcanza un
     * contador por opción. A las dos semanas dice qué le falta a la landing.
     */
    const stats = await assistant.getStats();
    expect(stats.items).toEqual([
      { hits: 2, optionKey: 'precios' },
      { hits: 1, optionKey: 'menus' },
    ]);
  });

  it('cuenta una opción que ya no está en el árbol', async () => {
    const assistant = await service();

    await assistant.recordHit('una-que-se-saco');

    // El árbol cambia; los toques que ya ocurrieron, no. Descartarlos escondería justamente el
    // dato de que alguien tocó algo que después se quitó.
    expect((await assistant.getStats()).items).toHaveLength(1);
  });
});
