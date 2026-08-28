import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from './index.js';
import {
  CmsConflictError,
  CmsNotFoundError,
  PostgresCmsService,
} from './repositories/postgres-cms-service.js';
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

async function service(): Promise<PostgresCmsService> {
  const { close: closeDatabase, db } = await migratedDatabase();
  close = closeDatabase;
  return new PostgresCmsService(db);
}

const context = { correlationId: 'corr-1', requestId: 'req-1', source: 'test' };
const heroSection = { headline: 'Comer rico y bien', id: 'sec-1', type: 'HERO' as const };

describe('cms: pages', () => {
  it('creates a page with an empty, unpublished first revision', async () => {
    const cms = await service();
    const detail = await cms.createPage({ slug: 'home', title: 'Inicio' }, context);
    expect(detail.slug).toBe('home');
    expect(detail.draft.revision).toBe(1);
    expect(detail.draft.sections).toEqual([]);
    expect(detail.published).toBeNull();
  });

  it('rejects a duplicate slug', async () => {
    const cms = await service();
    await cms.createPage({ slug: 'home', title: 'Inicio' }, context);
    await expect(cms.createPage({ slug: 'home', title: 'Otra' }, context)).rejects.toThrow(
      CmsConflictError,
    );
  });

  it('lists pages with their published status', async () => {
    const cms = await service();
    await cms.createPage({ slug: 'home', title: 'Inicio' }, context);
    const pages = await cms.listPages();
    expect(pages).toEqual([
      expect.objectContaining({ publishedAt: null, slug: 'home', title: 'Inicio' }),
    ]);
  });
});

describe('cms: drafts and publishing', () => {
  it('saving a draft creates a new revision without touching what is published', async () => {
    const cms = await service();
    await cms.createPage({ slug: 'home', title: 'Inicio' }, context);
    await cms.publish('home', (await cms.getPageDetail('home'))!.draft.id, context);

    await cms.saveDraft('home', [heroSection], context);
    const detail = await cms.getPageDetail('home');
    expect(detail?.draft.revision).toBe(2);
    expect(detail?.draft.sections).toEqual([heroSection]);
    // The published revision is still the empty one from revision 1.
    expect(detail?.published?.revision).toBe(1);
    expect(detail?.published?.sections).toEqual([]);
  });

  it('publishing moves the pointer without creating a new revision', async () => {
    const cms = await service();
    await cms.createPage({ slug: 'home', title: 'Inicio' }, context);
    const draft = await cms.saveDraft('home', [heroSection], context);

    const published = await cms.publish('home', draft.id, context);
    expect(published.published?.id).toBe(draft.id);
    expect(published.published?.sections).toEqual([heroSection]);

    const revisions = await cms.listRevisions('home');
    // revision 1 (empty, from createPage) + revision 2 (the draft) — publishing did not add a third.
    expect(revisions).toHaveLength(2);
  });

  it('reverting is just publishing an older revision', async () => {
    const cms = await service();
    await cms.createPage({ slug: 'home', title: 'Inicio' }, context);
    const first = await cms.getPageDetail('home');
    await cms.publish('home', first!.draft.id, context);
    const second = await cms.saveDraft('home', [heroSection], context);
    await cms.publish('home', second.id, context);

    const reverted = await cms.publish('home', first!.draft.id, context);
    expect(reverted.published?.sections).toEqual([]);
    // No new revision was created by reverting.
    expect(await cms.listRevisions('home')).toHaveLength(2);
  });

  it('rejects publishing a revision id from a different page', async () => {
    const cms = await service();
    await cms.createPage({ slug: 'home', title: 'Inicio' }, context);
    await cms.createPage({ slug: 'about', title: 'Nosotros' }, context);
    const aboutDetail = await cms.getPageDetail('about');

    await expect(cms.publish('home', aboutDetail!.draft.id, context)).rejects.toThrow(
      CmsNotFoundError,
    );
  });

  it('a page with no publish yet has no public page', async () => {
    const cms = await service();
    await cms.createPage({ slug: 'home', title: 'Inicio' }, context);
    await expect(cms.getPublicPage('home')).resolves.toBeNull();
  });

  it('the public page reflects only what was published', async () => {
    const cms = await service();
    await cms.createPage({ slug: 'home', title: 'Inicio' }, context);
    const draft = await cms.saveDraft('home', [heroSection], context);
    await cms.publish('home', draft.id, context);

    const publicPage = await cms.getPublicPage('home');
    expect(publicPage?.sections).toEqual([heroSection]);
  });

  // Regression for the "clonar verdeo.com.ar" home-page seed (seed-home-page.ts): HERO_ROTATOR
  // and CAROUSEL are new section types, and CONTACT/DELIVERY_ZONES gained new optional fields —
  // this proves the jsonb round-trip (write → publish → read back) preserves every field intact,
  // not just that the contract schema accepts the shape in isolation.
  it('round-trips HERO_ROTATOR, CAROUSEL, and the anchorId/regions/subheading additions', async () => {
    const cms = await service();
    await cms.createPage({ slug: 'home', title: 'Inicio' }, context);
    const clonedSections = [
      {
        anchorId: 'top',
        ctaHref: '/pedido',
        ctaLabel: 'Hacé tu pedido online',
        id: 'sec-hero-rotator',
        kicker: 'Bienvenido a nuestro mundo',
        type: 'HERO_ROTATOR',
        words: ['cuida tu salud', 'desde la alimentación', 'comidas saludables'],
      },
      {
        anchorId: 'section-nosotros',
        heading: 'Nosotros',
        id: 'sec-carousel',
        slides: [{ caption: 'Materia prima fresca y seleccionada', imageUrl: '' }],
        type: 'CAROUSEL',
      },
      {
        anchorId: 'section-precios',
        heading: 'Precios y pedido online',
        id: 'sec-zones',
        subheading: 'Elegí tu ciudad para ver los precios.',
        type: 'DELIVERY_ZONES',
      },
      {
        anchorId: 'section-contact',
        email: 'info@verdeo.com.ar',
        id: 'sec-contact',
        regions: [{ label: 'Ciudad de Neuquén y Plottier', whatsapp: '5492995493102' }],
        type: 'CONTACT',
      },
    ];

    const draft = await cms.saveDraft('home', clonedSections, context);
    await cms.publish('home', draft.id, context);

    const publicPage = await cms.getPublicPage('home');
    expect(publicPage?.sections).toEqual(clonedSections);
  });
});

describe('cms: media', () => {
  it('records and lists media assets', async () => {
    const cms = await service();
    await cms.recordMediaAsset(
      { contentType: 'image/png', label: 'Hero', url: 'https://blob.example/media/1.png' },
      undefined,
    );
    const items = await cms.listMediaAssets();
    expect(items).toHaveLength(1);
    expect(items[0]?.url).toBe('https://blob.example/media/1.png');
  });
});
