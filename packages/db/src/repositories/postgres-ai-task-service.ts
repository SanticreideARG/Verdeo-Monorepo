import { createHash } from 'node:crypto';

import { desc, eq } from 'drizzle-orm';

import {
  decryptSecret,
  findTask,
  selectProvider,
  type AIProvider,
  type AITaskDefinition,
} from '@verdeo/ai';

import type { Database } from '../index.js';
import { aiExecutions, aiProviderConfigs } from '../schema/index.js';
import type { PostgresAIPromptService } from './postgres-ai-prompt-service.js';

export interface AITaskContext {
  actorUserId?: string | undefined;
  correlationId: string;
  requestId: string;
  source: string;
}

export class AITaskNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AITaskNotFoundError';
  }
}

export class AITaskNotConfiguredError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AITaskNotConfiguredError';
  }
}

export class AITaskValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AITaskValidationError';
  }
}

export type AIProviderFactory = (config: {
  adapterType: string;
  apiKey: string;
  baseUrl: string;
}) => AIProvider;

/**
 * The task runner AI_CORE.md's diagram describes: AITask → Prompt Registry → Model Router →
 * Provider Adapter → Validation → Audit. Human approval (the diagram's next step) and Level 2+
 * confirmation flows are UI concerns layered on top of what this returns, not built here.
 *
 * `providerFactory` is injected (adapter pattern, same as `PostgresDeliveryService`'s optimizer
 * and `PostgresMessagingService`'s WhatsApp provider) so this class never imports a concrete
 * HTTP-calling class — apps/api wires the real `OpenAICompatibleProvider` in at startup.
 */
export class PostgresAITaskService {
  public constructor(
    private readonly database: Database,
    private readonly promptService: PostgresAIPromptService,
    private readonly providerFactory: AIProviderFactory,
    private readonly encryptionKey: string | undefined,
  ) {}

  public async runTask(taskKey: string, variables: Record<string, string>, context: AITaskContext) {
    const task = findTask(taskKey);
    if (!task) throw new AITaskNotFoundError(`Unknown AI task: ${taskKey}`);

    const promptVersion = await this.promptService.getActiveVersion(taskKey);
    if (!promptVersion)
      throw new AITaskNotConfiguredError(
        'Esta tarea todavía no tiene un prompt activo configurado.',
      );

    const providerRows = await this.database
      .select({
        adapterType: aiProviderConfigs.adapterType,
        baseUrl: aiProviderConfigs.baseUrl,
        defaultModel: aiProviderConfigs.defaultModel,
        enabled: aiProviderConfigs.enabled,
        encryptedApiKey: aiProviderConfigs.encryptedApiKey,
        key: aiProviderConfigs.key,
      })
      .from(aiProviderConfigs);

    const selected = selectProvider(
      providerRows,
      task.requiredCapabilities,
      promptVersion.preferredProviderKey,
    );
    if (!selected.encryptedApiKey || !this.encryptionKey)
      throw new AITaskNotConfiguredError(
        `El proveedor "${selected.key}" no tiene una clave configurada.`,
      );

    const apiKey = decryptSecret(selected.encryptedApiKey, this.encryptionKey);
    const provider = this.providerFactory({
      adapterType: selected.adapterType,
      apiKey,
      baseUrl: selected.baseUrl,
    });

    const userPrompt = renderVariables(variables);
    const inputHash = createHash('sha256').update(userPrompt).digest('hex');
    const startedAt = Date.now();

    try {
      const result = await provider.generateText({
        maxTokens: promptVersion.maxTokens,
        model: selected.defaultModel,
        systemPrompt: promptVersion.systemPrompt,
        temperature: promptVersion.temperature,
        userPrompt,
      });
      const output = task.outputSchema ? parseStructuredOutput(task, result.text) : result.text;

      await this.database.insert(aiExecutions).values({
        actorUserId: context.actorUserId ?? null,
        inputHash,
        inputTokens: result.usage.inputTokens,
        latencyMs: Date.now() - startedAt,
        model: selected.defaultModel,
        outputText: result.text,
        outputTokens: result.usage.outputTokens,
        promptVersionId: promptVersion.id,
        providerKey: selected.key,
        status: 'completed',
        taskKey,
      });

      return {
        model: selected.defaultModel,
        output,
        promptVersion: promptVersion.version,
        providerKey: selected.key,
        usage: result.usage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido.';
      await this.database
        .insert(aiExecutions)
        .values({
          actorUserId: context.actorUserId ?? null,
          errorMessage,
          inputHash,
          latencyMs: Date.now() - startedAt,
          model: selected.defaultModel,
          promptVersionId: promptVersion.id,
          providerKey: selected.key,
          status: 'error',
          taskKey,
        })
        .catch(() => undefined);
      throw error;
    }
  }

  public async listExecutions(taskKey?: string) {
    return this.database
      .select()
      .from(aiExecutions)
      .where(taskKey ? eq(aiExecutions.taskKey, taskKey) : undefined)
      .orderBy(desc(aiExecutions.createdAt))
      .limit(50);
  }
}

function renderVariables(variables: Record<string, string>): string {
  return Object.entries(variables)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n\n');
}

function parseStructuredOutput(task: AITaskDefinition, text: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AITaskValidationError('El modelo no devolvió un JSON válido.');
  }
  const result = task.outputSchema?.safeParse(parsed);
  if (!result?.success)
    throw new AITaskValidationError('La respuesta del modelo no cumple el esquema esperado.');
  return result.data;
}
