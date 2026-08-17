import { AuditService } from '@verdeo/audit';
import { SessionService, UserDirectoryService, type AuthenticatedSession } from '@verdeo/auth';
import { parseServerEnv } from '@verdeo/config';
import {
  createDatabase,
  PostgresAuditSink,
  PostgresSessionRepository,
  PostgresUserDirectoryRepository,
} from '@verdeo/db';
import { createLogger } from '@verdeo/observability';

import { createApp } from './app.js';

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
  const userDirectory = new UserDirectoryService(new PostgresUserDirectoryRepository(database.db));
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
  const app = createApp({
    appOrigin: env.APP_URL,
    logger,
    sessions,
    secureCookies: env.NODE_ENV === 'production',
    users: userDirectory,
    version: options.version,
  });

  return { ...database, app, env, logger };
}
