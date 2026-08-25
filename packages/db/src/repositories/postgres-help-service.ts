import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';

import { AuditService } from '@verdeo/audit';

import type { Database } from '../index.js';
import { helpArticles } from '../schema/index.js';
import { PostgresAuditSink } from './postgres-audit-sink.js';

export class HelpArticleNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'HelpArticleNotFoundError';
  }
}

export interface HelpContext {
  actorUserId?: string | undefined;
  correlationId: string;
  requestId: string;
  source: string;
}

export interface HelpArticleInput {
  active: boolean;
  body: string;
  category: string;
  key: string;
  ordinal: number;
  requiredPermission?: string | null | undefined;
  title: string;
}

function auditActor(context: HelpContext) {
  return context.actorUserId
    ? ({ type: 'user' as const, userId: context.actorUserId } as const)
    : ({ type: 'system' as const } as const);
}

export class PostgresHelpService {
  public constructor(private readonly database: Database) {}

  // "Solo mostraremos los datos de ayuda relevantes para el usuario": a viewer sees an article
  // when it carries no permission gate at all, or when they hold the one it names — filtered in
  // SQL (not fetched-then-filtered) so a permission a viewer lacks never leaves the database.
  public async listVisible(permissions: readonly string[]) {
    return this.database
      .select()
      .from(helpArticles)
      .where(
        and(
          eq(helpArticles.active, true),
          or(
            isNull(helpArticles.requiredPermission),
            ...(permissions.length > 0
              ? [inArray(helpArticles.requiredPermission, [...permissions])]
              : []),
          ),
        ),
      )
      .orderBy(asc(helpArticles.category), asc(helpArticles.ordinal));
  }

  public async listAll() {
    return this.database
      .select()
      .from(helpArticles)
      .orderBy(asc(helpArticles.category), asc(helpArticles.ordinal));
  }

  public async createArticle(input: HelpArticleInput, context: HelpContext) {
    return this.database.transaction(async (transaction) => {
      const [article] = await transaction
        .insert(helpArticles)
        .values({
          active: input.active,
          body: input.body,
          category: input.category,
          key: input.key,
          ordinal: input.ordinal,
          requiredPermission: input.requiredPermission ?? null,
          title: input.title,
          updatedByUserId: context.actorUserId ?? null,
        })
        .returning();
      if (!article) throw new Error('Help article insert did not return a row');

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'help_article.created',
        actor: auditActor(context),
        after: { key: article.key, title: article.title },
        correlationId: context.correlationId,
        entityId: article.id,
        entityType: 'help_article',
        requestId: context.requestId,
        source: context.source,
      });

      return article;
    });
  }

  public async updateArticle(id: string, input: HelpArticleInput, context: HelpContext) {
    return this.database.transaction(async (transaction) => {
      const [existing] = await transaction
        .select()
        .from(helpArticles)
        .where(eq(helpArticles.id, id))
        .limit(1);
      if (!existing) throw new HelpArticleNotFoundError('Help article not found');

      const [article] = await transaction
        .update(helpArticles)
        .set({
          active: input.active,
          body: input.body,
          category: input.category,
          key: input.key,
          ordinal: input.ordinal,
          requiredPermission: input.requiredPermission ?? null,
          title: input.title,
          updatedAt: new Date(),
          updatedByUserId: context.actorUserId ?? null,
        })
        .where(eq(helpArticles.id, id))
        .returning();
      if (!article) throw new Error('Help article update did not return a row');

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'help_article.updated',
        actor: auditActor(context),
        after: { active: article.active, title: article.title },
        before: { active: existing.active, title: existing.title },
        correlationId: context.correlationId,
        entityId: article.id,
        entityType: 'help_article',
        requestId: context.requestId,
        source: context.source,
      });

      return article;
    });
  }

  public async deleteArticle(id: string, context: HelpContext) {
    return this.database.transaction(async (transaction) => {
      const [existing] = await transaction
        .select()
        .from(helpArticles)
        .where(eq(helpArticles.id, id))
        .limit(1);
      if (!existing) throw new HelpArticleNotFoundError('Help article not found');

      await transaction.delete(helpArticles).where(eq(helpArticles.id, id));

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'help_article.deleted',
        actor: auditActor(context),
        before: { key: existing.key, title: existing.title },
        correlationId: context.correlationId,
        entityId: id,
        entityType: 'help_article',
        requestId: context.requestId,
        source: context.source,
      });
    });
  }
}
