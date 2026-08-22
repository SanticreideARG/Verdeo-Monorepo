import { and, desc, eq, max } from 'drizzle-orm';

import { AuditService } from '@verdeo/audit';

import type { Database } from '../index.js';
import { mediaAssets, pageRevisions, pages, users } from '../schema/index.js';
import { PostgresAuditSink } from './postgres-audit-sink.js';

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface CmsContext {
  actorUserId?: string | undefined;
  correlationId: string;
  requestId: string;
  source: string;
}

export class CmsNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CmsNotFoundError';
  }
}

export class CmsConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CmsConflictError';
  }
}

const revisionColumns = {
  createdAt: pageRevisions.createdAt,
  id: pageRevisions.id,
  revision: pageRevisions.revision,
  sections: pageRevisions.sections,
};

export class PostgresCmsService {
  public constructor(private readonly database: Database) {}

  public async listPages() {
    const rows = await this.database
      .select({
        id: pages.id,
        publishedRevisionId: pages.publishedRevisionId,
        slug: pages.slug,
        title: pages.title,
      })
      .from(pages)
      .orderBy(pages.title);

    return Promise.all(
      rows.map(async (row) => {
        if (!row.publishedRevisionId) return { ...row, publishedAt: null };
        const [revision] = await this.database
          .select({ createdAt: pageRevisions.createdAt })
          .from(pageRevisions)
          .where(eq(pageRevisions.id, row.publishedRevisionId))
          .limit(1);
        return { ...row, publishedAt: revision?.createdAt ?? null };
      }),
    );
  }

  private async loadRevision(
    database: Database | DatabaseTransaction,
    revisionId: string,
  ): Promise<{
    createdAt: Date;
    createdByDisplayName: string | null;
    id: string;
    revision: number;
    sections: unknown[];
  } | null> {
    const [row] = await database
      .select({
        createdAt: pageRevisions.createdAt,
        createdByDisplayName: users.displayName,
        id: pageRevisions.id,
        revision: pageRevisions.revision,
        sections: pageRevisions.sections,
      })
      .from(pageRevisions)
      .leftJoin(users, eq(users.id, pageRevisions.createdByUserId))
      .where(eq(pageRevisions.id, revisionId))
      .limit(1);
    return row ?? null;
  }

  // Takes an explicit database handle so callers already inside a transaction (createPage, publish)
  // reload through that same transaction instead of a fresh query via `this.database` — issuing a
  // second query against the pool while a transaction is still open on the one connection PGlite
  // serializes through is a self-deadlock, not just wasted round-trips.
  private async loadPageDetail(database: Database | DatabaseTransaction, slug: string) {
    const [page] = await database.select().from(pages).where(eq(pages.slug, slug)).limit(1);
    if (!page) return null;

    const [latest] = await database
      .select(revisionColumns)
      .from(pageRevisions)
      .where(eq(pageRevisions.pageId, page.id))
      .orderBy(desc(pageRevisions.revision))
      .limit(1);
    if (!latest) throw new Error(`Page ${slug} has no revisions`);

    const draft = await this.loadRevision(database, latest.id);
    const published = page.publishedRevisionId
      ? await this.loadRevision(database, page.publishedRevisionId)
      : null;
    if (!draft) throw new Error(`Page ${slug} draft revision could not be reloaded`);

    return { draft, id: page.id, published, slug: page.slug, title: page.title };
  }

  public async getPageDetail(slug: string) {
    return this.loadPageDetail(this.database, slug);
  }

  public async getPublicPage(slug: string) {
    const [page] = await this.database
      .select({
        publishedRevisionId: pages.publishedRevisionId,
        slug: pages.slug,
        title: pages.title,
      })
      .from(pages)
      .where(eq(pages.slug, slug))
      .limit(1);
    if (!page?.publishedRevisionId) return null;

    const [revision] = await this.database
      .select({ sections: pageRevisions.sections })
      .from(pageRevisions)
      .where(eq(pageRevisions.id, page.publishedRevisionId))
      .limit(1);
    if (!revision) return null;

    return { sections: revision.sections, slug: page.slug, title: page.title };
  }

  public async createPage(input: { slug: string; title: string }, context: CmsContext) {
    return this.database
      .transaction(async (transaction) => {
        const [existing] = await transaction
          .select({ id: pages.id })
          .from(pages)
          .where(eq(pages.slug, input.slug))
          .limit(1);
        if (existing)
          throw new CmsConflictError(`Ya existe una página con el slug "${input.slug}"`);

        const [page] = await transaction
          .insert(pages)
          .values({ slug: input.slug, title: input.title })
          .returning();
        if (!page) throw new Error('Page insert returned no row');

        await transaction.insert(pageRevisions).values({
          createdByUserId: context.actorUserId ?? null,
          pageId: page.id,
          revision: 1,
          sections: [],
        });

        const audit = new AuditService(new PostgresAuditSink(transaction));
        await audit.record({
          action: 'cms.page_created',
          actor: context.actorUserId
            ? { type: 'user', userId: context.actorUserId }
            : { type: 'system' },
          after: { slug: page.slug, title: page.title },
          correlationId: context.correlationId,
          entityId: page.id,
          entityType: 'cms_page',
          requestId: context.requestId,
          source: context.source,
        });

        return this.loadPageDetail(transaction, input.slug);
      })
      .then((detail) => {
        if (!detail) throw new Error('Created page could not be reloaded');
        return detail;
      });
  }

  public async saveDraft(slug: string, sections: readonly unknown[], context: CmsContext) {
    return this.database.transaction(async (transaction) => {
      const [page] = await transaction
        .select({ id: pages.id })
        .from(pages)
        .where(eq(pages.slug, slug))
        .limit(1);
      if (!page) throw new CmsNotFoundError(`Page not found: ${slug}`);

      const [aggregate] = await transaction
        .select({ nextRevision: max(pageRevisions.revision) })
        .from(pageRevisions)
        .where(eq(pageRevisions.pageId, page.id));

      const [created] = await transaction
        .insert(pageRevisions)
        .values({
          createdByUserId: context.actorUserId ?? null,
          pageId: page.id,
          revision: (aggregate?.nextRevision ?? 0) + 1,
          sections: [...sections],
        })
        .returning(revisionColumns);
      if (!created) throw new Error('Revision insert returned no row');

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'cms.draft_saved',
        actor: context.actorUserId
          ? { type: 'user', userId: context.actorUserId }
          : { type: 'system' },
        after: { revision: created.revision, sectionCount: sections.length },
        correlationId: context.correlationId,
        entityId: page.id,
        entityType: 'cms_page',
        requestId: context.requestId,
        source: context.source,
      });

      return created;
    });
  }

  public async publish(slug: string, revisionId: string, context: CmsContext) {
    return this.database
      .transaction(async (transaction) => {
        const [page] = await transaction
          .select({ id: pages.id, publishedRevisionId: pages.publishedRevisionId })
          .from(pages)
          .where(eq(pages.slug, slug))
          .limit(1);
        if (!page) throw new CmsNotFoundError(`Page not found: ${slug}`);

        const [revision] = await transaction
          .select({ id: pageRevisions.id })
          .from(pageRevisions)
          .where(and(eq(pageRevisions.id, revisionId), eq(pageRevisions.pageId, page.id)))
          .limit(1);
        if (!revision) throw new CmsNotFoundError('Revision not found for this page');

        await transaction
          .update(pages)
          .set({ publishedRevisionId: revisionId, updatedAt: new Date() })
          .where(eq(pages.id, page.id));

        const audit = new AuditService(new PostgresAuditSink(transaction));
        await audit.record({
          action: 'cms.page_published',
          actor: context.actorUserId
            ? { type: 'user', userId: context.actorUserId }
            : { type: 'system' },
          after: { revisionId },
          before: { revisionId: page.publishedRevisionId },
          correlationId: context.correlationId,
          entityId: page.id,
          entityType: 'cms_page',
          requestId: context.requestId,
          source: context.source,
        });

        return this.loadPageDetail(transaction, slug);
      })
      .then((detail) => {
        if (!detail) throw new Error('Published page could not be reloaded');
        return detail;
      });
  }

  public async listRevisions(slug: string) {
    const [page] = await this.database
      .select({ id: pages.id })
      .from(pages)
      .where(eq(pages.slug, slug))
      .limit(1);
    if (!page) throw new CmsNotFoundError(`Page not found: ${slug}`);

    return this.database
      .select({
        createdAt: pageRevisions.createdAt,
        createdByDisplayName: users.displayName,
        id: pageRevisions.id,
        revision: pageRevisions.revision,
      })
      .from(pageRevisions)
      .leftJoin(users, eq(users.id, pageRevisions.createdByUserId))
      .where(eq(pageRevisions.pageId, page.id))
      .orderBy(desc(pageRevisions.revision));
  }

  public async recordMediaAsset(
    input: { contentType: string; label?: string | undefined; url: string },
    uploadedByUserId: string | undefined,
  ) {
    const [created] = await this.database
      .insert(mediaAssets)
      .values({
        contentType: input.contentType,
        label: input.label ?? null,
        uploadedByUserId: uploadedByUserId ?? null,
        url: input.url,
      })
      .returning();
    if (!created) throw new Error('Media asset insert returned no row');
    return created;
  }

  public async listMediaAssets() {
    return this.database.select().from(mediaAssets).orderBy(desc(mediaAssets.createdAt));
  }
}
