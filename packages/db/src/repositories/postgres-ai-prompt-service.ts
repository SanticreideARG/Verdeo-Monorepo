import { and, desc, eq } from 'drizzle-orm';

import { AuditService } from '@verdeo/audit';
import { AI_TASKS } from '@verdeo/ai';

import type { Database } from '../index.js';
import { aiPromptVersions, aiPrompts } from '../schema/index.js';
import { PostgresAuditSink } from './postgres-audit-sink.js';

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface AIPromptContext {
  actorUserId?: string | undefined;
  correlationId: string;
  requestId: string;
  source: string;
}

export class AIPromptNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AIPromptNotFoundError';
  }
}

export interface AIPromptVersionInput {
  maxTokens: number;
  preferredProviderKey?: string | null | undefined;
  systemPrompt: string;
  temperature: number;
}

/**
 * AI_CORE.md's Prompt Registry: "no hardcodear prompts de negocio en componentes", "versionado y
 * rollback obligatorio". Every save is a new immutable `ai_prompt_versions` row; `activate` — used
 * both for a fresh save and for rolling back — only moves `ai_prompts.activeVersionId`, so nothing
 * is ever edited in place and every version a task ever ran under stays inspectable.
 */
export class PostgresAIPromptService {
  public constructor(private readonly database: Database) {}

  public async listPrompts() {
    const rows = await this.database
      .select({
        activeVersionId: aiPrompts.activeVersionId,
        id: aiPrompts.id,
        taskKey: aiPrompts.taskKey,
      })
      .from(aiPrompts);
    const configured = new Map(rows.map((row) => [row.taskKey, row]));

    return AI_TASKS.map((task) => ({
      configured: configured.has(task.key),
      description: task.description,
      displayName: task.displayName,
      hasActiveVersion: Boolean(configured.get(task.key)?.activeVersionId),
      taskKey: task.key,
    }));
  }

  public async getPromptDetail(taskKey: string) {
    return this.loadPromptDetail(this.database, taskKey);
  }

  // Parameterized so `createVersion`/`activateVersion` can reload through their own open
  // transaction instead of `this.database` — issuing a fresh top-level query on that handle while
  // a transaction is still open on the same connection is a self-deadlock on PGlite (bit us once
  // already in postgres-cms-service.ts; same fix here).
  private async loadPromptDetail(database: Database | DatabaseTransaction, taskKey: string) {
    const [prompt] = await database
      .select()
      .from(aiPrompts)
      .where(eq(aiPrompts.taskKey, taskKey))
      .limit(1);
    const versions = prompt
      ? await database
          .select()
          .from(aiPromptVersions)
          .where(eq(aiPromptVersions.promptId, prompt.id))
          .orderBy(desc(aiPromptVersions.version))
      : [];

    return {
      activeVersionId: prompt?.activeVersionId ?? null,
      taskKey,
      versions,
    };
  }

  public async getActiveVersion(taskKey: string) {
    const [prompt] = await this.database
      .select({ activeVersionId: aiPrompts.activeVersionId })
      .from(aiPrompts)
      .where(eq(aiPrompts.taskKey, taskKey))
      .limit(1);
    if (!prompt?.activeVersionId) return null;

    const [version] = await this.database
      .select()
      .from(aiPromptVersions)
      .where(eq(aiPromptVersions.id, prompt.activeVersionId))
      .limit(1);
    return version ?? null;
  }

  public async createVersion(
    taskKey: string,
    input: AIPromptVersionInput,
    context: AIPromptContext,
  ) {
    return this.database.transaction(async (transaction) => {
      let [prompt] = await transaction
        .select({ id: aiPrompts.id })
        .from(aiPrompts)
        .where(eq(aiPrompts.taskKey, taskKey))
        .limit(1);
      if (!prompt) {
        const [created] = await transaction
          .insert(aiPrompts)
          .values({ taskKey })
          .returning({ id: aiPrompts.id });
        prompt = created;
      }
      if (!prompt) throw new Error('Prompt creation did not return a row');

      const [{ maxVersion } = { maxVersion: 0 }] = await transaction
        .select({
          maxVersion: aiPromptVersions.version,
        })
        .from(aiPromptVersions)
        .where(eq(aiPromptVersions.promptId, prompt.id))
        .orderBy(desc(aiPromptVersions.version))
        .limit(1);

      const [version] = await transaction
        .insert(aiPromptVersions)
        .values({
          createdByUserId: context.actorUserId ?? null,
          maxTokens: input.maxTokens,
          preferredProviderKey: input.preferredProviderKey ?? null,
          promptId: prompt.id,
          systemPrompt: input.systemPrompt,
          temperature: input.temperature,
          version: (maxVersion ?? 0) + 1,
        })
        .returning();
      if (!version) throw new Error('Prompt version creation did not return a row');

      await transaction
        .update(aiPrompts)
        .set({ activeVersionId: version.id, updatedAt: new Date() })
        .where(eq(aiPrompts.id, prompt.id));

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'ai.prompt_version_created',
        actor: context.actorUserId
          ? { type: 'user', userId: context.actorUserId }
          : { type: 'system' },
        after: { version: version.version },
        correlationId: context.correlationId,
        entityId: version.id,
        entityType: 'ai_prompt_version',
        requestId: context.requestId,
        source: context.source,
      });

      return this.loadPromptDetail(transaction, taskKey);
    });
  }

  public async activateVersion(taskKey: string, versionId: string, context: AIPromptContext) {
    return this.database.transaction(async (transaction) => {
      const [prompt] = await transaction
        .select({ id: aiPrompts.id })
        .from(aiPrompts)
        .where(eq(aiPrompts.taskKey, taskKey))
        .limit(1);
      if (!prompt) throw new AIPromptNotFoundError('Prompt not found');

      const [version] = await transaction
        .select({ id: aiPromptVersions.id })
        .from(aiPromptVersions)
        .where(and(eq(aiPromptVersions.id, versionId), eq(aiPromptVersions.promptId, prompt.id)))
        .limit(1);
      if (!version) throw new AIPromptNotFoundError('Version not found for this prompt');

      await transaction
        .update(aiPrompts)
        .set({ activeVersionId: version.id, updatedAt: new Date() })
        .where(eq(aiPrompts.id, prompt.id));

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'ai.prompt_version_activated',
        actor: context.actorUserId
          ? { type: 'user', userId: context.actorUserId }
          : { type: 'system' },
        after: { versionId },
        correlationId: context.correlationId,
        entityId: version.id,
        entityType: 'ai_prompt_version',
        requestId: context.requestId,
        source: context.source,
      });

      return this.loadPromptDetail(transaction, taskKey);
    });
  }
}
