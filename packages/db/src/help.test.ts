import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import {
  HelpArticleNotFoundError,
  PostgresHelpService,
} from './repositories/postgres-help-service.js';
import type { Database } from './index.js';
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

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function seededService(): Promise<PostgresHelpService> {
  const { close: closeDatabase, db } = await migratedDatabase();
  close = closeDatabase;
  return new PostgresHelpService(db);
}

const context = { correlationId: 'corr-1', requestId: 'req-1', source: 'test' };

describe('help articles', () => {
  it('a viewer with no gated permission only sees ungated articles', async () => {
    const service = await seededService();
    await service.createArticle(
      {
        active: true,
        body: 'Para todos',
        category: 'General',
        key: 'general-1',
        ordinal: 0,
        requiredPermission: null,
        title: 'Artículo general',
      },
      context,
    );
    await service.createArticle(
      {
        active: true,
        body: 'Solo para cocina',
        category: 'Cocina',
        key: 'cocina-1',
        ordinal: 0,
        requiredPermission: 'production.read',
        title: 'Artículo de cocina',
      },
      context,
    );

    const visible = await service.listVisible([]);
    expect(visible.map((article) => article.key)).toEqual(['general-1']);
  });

  it('shows a gated article only to a viewer holding that permission', async () => {
    const service = await seededService();
    await service.createArticle(
      {
        active: true,
        body: 'Solo para cocina',
        category: 'Cocina',
        key: 'cocina-1',
        ordinal: 0,
        requiredPermission: 'production.read',
        title: 'Artículo de cocina',
      },
      context,
    );

    const withoutPermission = await service.listVisible(['orders.read']);
    expect(withoutPermission).toHaveLength(0);

    const withPermission = await service.listVisible(['orders.read', 'production.read']);
    expect(withPermission).toHaveLength(1);
  });

  it('hides an inactive article from listVisible but keeps it in listAll', async () => {
    const service = await seededService();
    const article = await service.createArticle(
      {
        active: false,
        body: 'Borrador',
        category: 'General',
        key: 'draft-1',
        ordinal: 0,
        requiredPermission: null,
        title: 'Borrador',
      },
      context,
    );

    expect(await service.listVisible([])).toHaveLength(0);
    const all = await service.listAll();
    expect(all.map((row) => row.id)).toContain(article.id);
  });

  it('updates and deletes an article', async () => {
    const service = await seededService();
    const article = await service.createArticle(
      {
        active: true,
        body: 'Original',
        category: 'General',
        key: 'edit-me',
        ordinal: 0,
        requiredPermission: null,
        title: 'Original',
      },
      context,
    );

    const updated = await service.updateArticle(
      article.id,
      {
        active: true,
        body: 'Actualizado',
        category: 'General',
        key: 'edit-me',
        ordinal: 0,
        requiredPermission: null,
        title: 'Actualizado',
      },
      context,
    );
    expect(updated.body).toBe('Actualizado');

    await service.deleteArticle(article.id, context);
    expect(await service.listAll()).toHaveLength(0);
  });

  it('404s updating or deleting an unknown article', async () => {
    const service = await seededService();
    await expect(
      service.updateArticle(
        '00000000-0000-4000-8000-000000000000',
        {
          active: true,
          body: 'x',
          category: 'x',
          key: 'x',
          ordinal: 0,
          requiredPermission: null,
          title: 'x',
        },
        context,
      ),
    ).rejects.toThrow(HelpArticleNotFoundError);
    await expect(
      service.deleteArticle('00000000-0000-4000-8000-000000000000', context),
    ).rejects.toThrow(HelpArticleNotFoundError);
  });
});
