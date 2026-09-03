import { asc, eq } from 'drizzle-orm';

import { decryptSecret, encryptSecret, maskSecret } from '@verdeo/ai';
import { AuditService } from '@verdeo/audit';

import type { Database } from '../index.js';
import { integrationCredentials } from '../schema/index.js';
import { PostgresAuditSink } from './postgres-audit-sink.js';

export interface IntegrationCredentialInput {
  /** Omitted means "keep the stored key" — the dashboard never round-trips the real value. */
  apiKey?: string | undefined;
  displayName: string;
  enabled: boolean;
  key: string;
  provider: string;
  /** Non-secret configuration; unlike the key, this does round-trip to the dashboard. */
  settings?: Record<string, string> | undefined;
}

export interface IntegrationCredentialContext {
  actorUserId: string;
  correlationId: string;
  requestId: string;
  source: string;
}

export class IntegrationCredentialUnavailableError extends Error {
  public constructor() {
    super(
      'Configurá AI_CONFIG_ENCRYPTION_KEY en el servidor antes de guardar claves de integración.',
    );
    this.name = 'IntegrationCredentialUnavailableError';
  }
}

/**
 * Third-party integration keys (maps/geocoding today). Same shape and same encryption as
 * PostgresAIConfigurationService — reading only ever yields a masked last-four, so a key that goes
 * in never comes back out through the API. `secretFor` is the one path that decrypts, and it is
 * for server-side adapters only, never for a route that returns to a browser.
 */
export class PostgresIntegrationCredentialsService {
  public constructor(
    private readonly database: Database,
    private readonly encryptionKey?: string,
  ) {}

  public async list() {
    const rows = await this.database
      .select({
        apiKeyLastFour: integrationCredentials.apiKeyLastFour,
        displayName: integrationCredentials.displayName,
        enabled: integrationCredentials.enabled,
        id: integrationCredentials.id,
        key: integrationCredentials.key,
        provider: integrationCredentials.provider,
        settings: integrationCredentials.settings,
        updatedAt: integrationCredentials.updatedAt,
      })
      .from(integrationCredentials)
      .orderBy(asc(integrationCredentials.displayName));

    return {
      encryptionConfigured: Boolean(this.encryptionKey),
      items: rows.map(({ apiKeyLastFour, settings, ...row }) => ({
        ...row,
        apiKeyMask: maskSecret(apiKeyLastFour),
        keyConfigured: Boolean(apiKeyLastFour),
        settings: settings ?? {},
      })),
    };
  }

  /** Server-side only: the decrypted key for an enabled integration, or null if none is usable. */
  public async secretFor(key: string): Promise<string | null> {
    if (!this.encryptionKey) return null;
    const [row] = await this.database
      .select({
        enabled: integrationCredentials.enabled,
        encryptedApiKey: integrationCredentials.encryptedApiKey,
      })
      .from(integrationCredentials)
      .where(eq(integrationCredentials.key, key))
      .limit(1);
    if (!row?.enabled || !row.encryptedApiKey) return null;
    return decryptSecret(row.encryptedApiKey, this.encryptionKey);
  }

  /**
   * Server-side only: key plus settings for an enabled integration, or null if it is unusable.
   * The email sender needs both at once — a key with no sender address cannot send anything.
   */
  public async configFor(
    key: string,
  ): Promise<{ apiKey: string; settings: Record<string, string> } | null> {
    if (!this.encryptionKey) return null;
    const [row] = await this.database
      .select({
        enabled: integrationCredentials.enabled,
        encryptedApiKey: integrationCredentials.encryptedApiKey,
        settings: integrationCredentials.settings,
      })
      .from(integrationCredentials)
      .where(eq(integrationCredentials.key, key))
      .limit(1);
    if (!row?.enabled || !row.encryptedApiKey) return null;
    return {
      apiKey: decryptSecret(row.encryptedApiKey, this.encryptionKey),
      settings: row.settings ?? {},
    };
  }

  public async upsert(input: IntegrationCredentialInput, context: IntegrationCredentialContext) {
    await this.database.transaction(async (transaction) => {
      const [existing] = await transaction
        .select({
          apiKeyLastFour: integrationCredentials.apiKeyLastFour,
          encryptedApiKey: integrationCredentials.encryptedApiKey,
          id: integrationCredentials.id,
          settings: integrationCredentials.settings,
        })
        .from(integrationCredentials)
        .where(eq(integrationCredentials.key, input.key))
        .limit(1);

      if (input.apiKey && !this.encryptionKey) throw new IntegrationCredentialUnavailableError();
      const encryptedApiKey = input.apiKey
        ? encryptSecret(input.apiKey, this.encryptionKey as string)
        : existing?.encryptedApiKey;
      const apiKeyLastFour = input.apiKey ? input.apiKey.slice(-4) : existing?.apiKeyLastFour;
      // Enabling without a stored key would leave the adapter silently unusable, so it is refused
      // here rather than failing later at the first geocoding call.
      if (input.enabled && !encryptedApiKey) throw new IntegrationCredentialUnavailableError();

      await transaction
        .insert(integrationCredentials)
        .values({
          apiKeyLastFour,
          displayName: input.displayName,
          enabled: input.enabled,
          encryptedApiKey,
          key: input.key,
          provider: input.provider,
          settings: input.settings ?? existing?.settings ?? {},
        })
        .onConflictDoUpdate({
          set: {
            apiKeyLastFour,
            displayName: input.displayName,
            enabled: input.enabled,
            encryptedApiKey,
            provider: input.provider,
            settings: input.settings ?? existing?.settings ?? {},
            updatedAt: new Date(),
          },
          target: integrationCredentials.key,
        });

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: existing ? 'integration.credential.updated' : 'integration.credential.created',
        actor: { type: 'user', userId: context.actorUserId },
        // Never the key itself, not even encrypted — only whether one is now on file.
        after: {
          enabled: input.enabled,
          keyConfigured: Boolean(encryptedApiKey),
          provider: input.provider,
        },
        correlationId: context.correlationId,
        entityId: input.key,
        entityType: 'integration_credential',
        requestId: context.requestId,
        source: context.source,
      });
    });

    return this.list();
  }
}
