import { AuditService } from '@verdeo/audit';
import {
  AccessTokenService,
  PasswordCredentialService,
  SessionService,
  UserAdminService,
  UserDirectoryService,
  type AuthenticatedSession,
} from '@verdeo/auth';
import { parseServerEnv } from '@verdeo/config';
import {
  createDatabase,
  PostgresAccessTokenRepository,
  PostgresAuditSink,
  PostgresChatService,
  PostgresAIConfigurationService,
  PostgresAIPromptService,
  PostgresAITaskService,
  PostgresAuditQueryService,
  PostgresDeliveryService,
  PostgresGeographyService,
  PostgresPasswordCredentialRepository,
  PostgresOperationsService,
  PostgresOAuthIdentityRepository,
  PostgresPaymentsService,
  PostgresSessionRepository,
  PostgresCmsService,
  PostgresMessagingService,
  PostgresUserAdminRepository,
  PostgresUserDirectoryRepository,
} from '@verdeo/db';
import { LocationLinkGeocodingProvider } from '@verdeo/geocoding';
import { createLogger } from '@verdeo/observability';
import { NearestNeighborRouteOptimizer } from '@verdeo/routing';

import { createApp } from './app.js';
import { OpenAICompatibleProvider } from './integrations/ai-providers.js';
import { VercelBlobAvatarStorage } from './integrations/avatar-storage.js';
import { SupabaseAuthClient } from './integrations/supabase-auth.js';
import { MetaWhatsAppProvider } from './integrations/whatsapp-provider.js';

interface CreateApiRuntimeOptions {
  environment?: NodeJS.ProcessEnv;
  prettyLogs: boolean;
  version: string;
}

export function createApiRuntime(options: CreateApiRuntimeOptions) {
  const environment = options.environment ?? process.env;
  const env = parseServerEnv(environment);
  const logger = createLogger({
    level: env.LOG_LEVEL,
    pretty: options.prettyLogs,
    service: 'verdeo-api',
  });
  const database = createDatabase(env.DATABASE_URL, {
    maxConnections: environment.VERCEL ? 1 : 5,
  });
  const sessionService = new SessionService(new PostgresSessionRepository(database.db));
  const passwordCredentials = new PasswordCredentialService(
    new PostgresPasswordCredentialRepository(database.db),
  );
  const userDirectory = new UserDirectoryService(new PostgresUserDirectoryRepository(database.db));
  const userAdmin = new UserAdminService(new PostgresUserAdminRepository(database.db));
  const cms = new PostgresCmsService(database.db);
  const whatsappProvider = new MetaWhatsAppProvider(
    env.WHATSAPP_APP_SECRET,
    env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  );
  const messaging = new PostgresMessagingService(database.db, whatsappProvider);
  const delivery = new PostgresDeliveryService(
    database.db,
    new NearestNeighborRouteOptimizer(),
    messaging,
  );
  const payments = new PostgresPaymentsService(database.db);
  const accessTokenService = new AccessTokenService(
    new PostgresAccessTokenRepository(database.db),
    sessionService,
  );
  const accessTokens = {
    issue: (
      input: {
        boundUserId?: string;
        kind: 'repartidor_access' | 'user_invite';
        label: string;
        operatingSiteId?: string;
        roleId?: string;
        ttlHours: number;
      },
      createdByUserId: string | undefined,
    ) => accessTokenService.issue({ ...input, createdByUserId }),
    list: (operatingSiteId: string | undefined) =>
      accessTokenService.list(operatingSiteId ? { operatingSiteId } : undefined),
    redeem: async (token: string, displayName: string | undefined) => {
      const result = await accessTokenService.redeem(
        token,
        { displayName },
        env.SESSION_TTL_HOURS * 60 * 60 * 1000,
      );
      return result.ok
        ? { ok: true as const, session: result.session }
        : { ok: false as const, reason: result.reason };
    },
    revoke: (id: string) => accessTokenService.revoke(id),
  };
  const operations = new PostgresOperationsService(
    database.db,
    new LocationLinkGeocodingProvider(),
  );
  const geography = new PostgresGeographyService(database.db);
  const chat = new PostgresChatService(database.db);
  const aiConfiguration = new PostgresAIConfigurationService(
    database.db,
    env.AI_CONFIG_ENCRYPTION_KEY,
  );
  const aiPrompts = new PostgresAIPromptService(database.db);
  const auditQuery = new PostgresAuditQueryService(database.db);
  const aiTasks = new PostgresAITaskService(
    database.db,
    aiPrompts,
    ({ apiKey, baseUrl, adapterType }) =>
      new OpenAICompatibleProvider(adapterType, apiKey, baseUrl),
    env.AI_CONFIG_ENCRYPTION_KEY,
  );
  const avatarStorage = env.VERDEO_READ_WRITE_TOKEN
    ? new VercelBlobAvatarStorage(env.VERDEO_READ_WRITE_TOKEN, env.VERDEO_STORE_ID)
    : undefined;
  const sessions = {
    authenticate: (token: string) => sessionService.authenticate(token),
    listForUser: (userId: string) => sessionService.listForUser(userId),
    revoke: async (session: AuthenticatedSession, requestId: string) => {
      await database.db.transaction(async (transaction) => {
        const transactionalSessions = new SessionService(
          new PostgresSessionRepository(transaction),
        );
        const audit = new AuditService(new PostgresAuditSink(transaction));

        const revoked = await transactionalSessions.revoke(session.sessionId);
        if (!revoked) return;

        await audit.record({
          action: 'session.logout',
          actor: { type: 'user', userId: session.userId },
          correlationId: requestId,
          entityId: session.sessionId,
          entityType: 'session',
          requestId,
          source: 'api',
        });
      });
    },
    revokeOwned: async (
      session: AuthenticatedSession,
      targetSessionId: string,
      requestId: string,
    ) =>
      database.db.transaction(async (transaction) => {
        const transactionalSessions = new SessionService(
          new PostgresSessionRepository(transaction),
        );
        const revoked = await transactionalSessions.revokeOwned(targetSessionId, session.userId);

        if (!revoked) return false;

        const audit = new AuditService(new PostgresAuditSink(transaction));
        await audit.record({
          action: 'session.revoked',
          actor: { type: 'user', userId: session.userId },
          correlationId: requestId,
          entityId: targetSessionId,
          entityType: 'session',
          requestId,
          source: 'api',
        });

        return true;
      }),
  };
  const credentials = {
    login: async (email: string, password: string, requestId: string) => {
      const userId = await passwordCredentials.authenticate(email, password);

      if (!userId) {
        const audit = new AuditService(new PostgresAuditSink(database.db));
        await audit.record({
          action: 'auth.login_failed',
          actor: { type: 'system' },
          correlationId: requestId,
          entityId: 'password',
          entityType: 'authentication',
          requestId,
          source: 'api',
        });
        return null;
      }

      return database.db.transaction(async (transaction) => {
        const transactionalSessions = new SessionService(
          new PostgresSessionRepository(transaction),
        );
        const createdSession = await transactionalSessions.create(
          userId,
          env.SESSION_TTL_HOURS * 60 * 60 * 1000,
        );
        const audit = new AuditService(new PostgresAuditSink(transaction));
        await audit.record({
          action: 'auth.login_succeeded',
          actor: { type: 'user', userId },
          correlationId: requestId,
          entityId: createdSession.sessionId,
          entityType: 'session',
          requestId,
          source: 'api',
        });

        return createdSession;
      });
    },
  };
  const supabaseAuth =
    env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY
      ? new SupabaseAuthClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY)
      : undefined;
  const oauth = supabaseAuth
    ? {
        exchange: async (accessToken: string, requestId: string) => {
          const identity = await supabaseAuth.verifyAccessToken(accessToken);

          if (!identity) {
            const audit = new AuditService(new PostgresAuditSink(database.db));
            await audit.record({
              action: 'auth.oauth_failed',
              actor: { type: 'system' },
              correlationId: requestId,
              entityId: 'supabase',
              entityType: 'authentication',
              metadata: { reason: 'invalid_or_unverified_identity' },
              requestId,
              source: 'api',
            });
            return null;
          }

          return database.db.transaction(async (transaction) => {
            const identities = new PostgresOAuthIdentityRepository(transaction);
            const resolvedIdentity = await identities.resolveOrLink({
              email: identity.email,
              provider: 'supabase',
              providerSubject: identity.providerSubject,
            });
            const audit = new AuditService(new PostgresAuditSink(transaction));

            if (!resolvedIdentity) {
              await audit.record({
                action: 'auth.oauth_failed',
                actor: { type: 'system' },
                correlationId: requestId,
                entityId: identity.providerSubject,
                entityType: 'authentication',
                metadata: { reason: 'user_not_provisioned_or_identity_conflict' },
                requestId,
                source: 'api',
              });
              return null;
            }

            if (resolvedIdentity.linked) {
              await audit.record({
                action: 'auth.identity_linked',
                actor: { type: 'user', userId: resolvedIdentity.userId },
                after: { provider: 'supabase' },
                correlationId: requestId,
                entityId: identity.providerSubject,
                entityType: 'auth_identity',
                requestId,
                source: 'api',
              });
            }

            const transactionalSessions = new SessionService(
              new PostgresSessionRepository(transaction),
            );
            const createdSession = await transactionalSessions.create(
              resolvedIdentity.userId,
              env.SESSION_TTL_HOURS * 60 * 60 * 1000,
            );
            await audit.record({
              action: 'auth.login_succeeded',
              actor: { type: 'user', userId: resolvedIdentity.userId },
              correlationId: requestId,
              entityId: createdSession.sessionId,
              entityType: 'session',
              metadata: { authenticationProvider: 'supabase' },
              requestId,
              source: 'api',
            });

            return createdSession;
          });
        },
      }
    : undefined;
  const app = createApp({
    aiConfiguration,
    aiPrompts,
    aiTasks,
    appOrigin: env.APP_URL,
    accessTokens,
    auditQuery,
    cms,
    ...(avatarStorage ? { avatarStorage } : {}),
    chat,
    chatRetentionDays: env.CHAT_RETENTION_DAYS,
    ...(env.CRON_SECRET ? { cronSecret: env.CRON_SECRET } : {}),
    cookieSameSite: env.SESSION_COOKIE_SAME_SITE,
    credentials,
    delivery,
    geography,
    logger,
    messaging,
    ...(oauth ? { oauth } : {}),
    operations,
    payments,
    sessions,
    secureCookies: env.NODE_ENV === 'production',
    userAdmin,
    users: userDirectory,
    version: options.version,
  });

  return { ...database, app, env, logger };
}
