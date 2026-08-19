import { asc, eq } from 'drizzle-orm';

import { maskSecret, encryptSecret } from '@verdeo/ai';
import { AuditService } from '@verdeo/audit';

import type { Database } from '../index.js';
import { aiProviderConfigs } from '../schema/index.js';
import { PostgresAuditSink } from './postgres-audit-sink.js';

export interface AIProviderConfigInput {
  adapterType: string;
  apiKey?: string | undefined;
  baseUrl: string;
  defaultModel: string;
  displayName: string;
  enabled: boolean;
  key: string;
}

export interface AIConfigurationContext {
  actorUserId: string;
  correlationId: string;
  requestId: string;
  source: string;
}

export class AIConfigurationUnavailableError extends Error {
  public constructor() {
    super('Configurá AI_CONFIG_ENCRYPTION_KEY en el servidor antes de guardar claves de IA.');
    this.name = 'AIConfigurationUnavailableError';
  }
}

export class PostgresAIConfigurationService {
  public constructor(
    private readonly database: Database,
    private readonly encryptionKey?: string,
  ) {}

  public async list() {
    const rows = await this.database
      .select({
        adapterType: aiProviderConfigs.adapterType,
        apiKeyLastFour: aiProviderConfigs.apiKeyLastFour,
        baseUrl: aiProviderConfigs.baseUrl,
        defaultModel: aiProviderConfigs.defaultModel,
        displayName: aiProviderConfigs.displayName,
        enabled: aiProviderConfigs.enabled,
        id: aiProviderConfigs.id,
        key: aiProviderConfigs.key,
        updatedAt: aiProviderConfigs.updatedAt,
      })
      .from(aiProviderConfigs)
      .orderBy(asc(aiProviderConfigs.displayName));

    return {
      encryptionConfigured: Boolean(this.encryptionKey),
      items: rows.map(({ apiKeyLastFour, ...row }) => ({
        ...row,
        apiKeyMask: maskSecret(apiKeyLastFour),
        keyConfigured: Boolean(apiKeyLastFour),
      })),
    };
  }

  public async upsert(input: AIProviderConfigInput, context: AIConfigurationContext) {
    return this.database.transaction(async (transaction) => {
      const [existing] = await transaction
        .select({
          apiKeyLastFour: aiProviderConfigs.apiKeyLastFour,
          encryptedApiKey: aiProviderConfigs.encryptedApiKey,
          id: aiProviderConfigs.id,
        })
        .from(aiProviderConfigs)
        .where(eq(aiProviderConfigs.key, input.key))
        .limit(1);

      if (input.apiKey && !this.encryptionKey) throw new AIConfigurationUnavailableError();
      const encryptedApiKey = input.apiKey
        ? encryptSecret(input.apiKey, this.encryptionKey as string)
        : existing?.encryptedApiKey;
      const apiKeyLastFour = input.apiKey ? input.apiKey.slice(-4) : existing?.apiKeyLastFour;
      if (input.enabled && !encryptedApiKey) throw new AIConfigurationUnavailableError();

      const [saved] = await transaction
        .insert(aiProviderConfigs)
        .values({
          adapterType: input.adapterType,
          apiKeyLastFour,
          baseUrl: input.baseUrl,
          defaultModel: input.defaultModel,
          displayName: input.displayName,
          enabled: input.enabled,
          encryptedApiKey,
          key: input.key,
        })
        .onConflictDoUpdate({
          set: {
            adapterType: input.adapterType,
            apiKeyLastFour,
            baseUrl: input.baseUrl,
            defaultModel: input.defaultModel,
            displayName: input.displayName,
            enabled: input.enabled,
            encryptedApiKey,
            updatedAt: new Date(),
          },
          target: aiProviderConfigs.key,
        })
        .returning({ id: aiProviderConfigs.id });
      if (!saved) throw new Error('AI provider configuration did not return a row');

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: existing ? 'ai.provider.updated' : 'ai.provider.created',
        actor: { type: 'user', userId: context.actorUserId },
        after: {
          adapterType: input.adapterType,
          enabled: input.enabled,
          keyConfigured: Boolean(encryptedApiKey),
        },
        correlationId: context.correlationId,
        entityId: saved.id,
        entityType: 'ai_provider_config',
        requestId: context.requestId,
        source: context.source,
      });
    });

    return this.list();
  }
}
