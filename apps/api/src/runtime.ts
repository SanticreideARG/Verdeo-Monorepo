import { AuditService } from '@verdeo/audit';
import { SessionService, type AuthenticatedSession } from '@verdeo/auth';
import { parseServerEnv } from '@verdeo/config';
import { createDatabase, PostgresAuditSink, PostgresSessionRepository } from '@verdeo/db';
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
  const sessions = {
    authenticate: (token: string) => sessionService.authenticate(token),
    revoke: async (session: AuthenticatedSession, requestId: string) => {
      await database.db.transaction(async (transaction) => {
        const transactionalSessions = new SessionService(
          new PostgresSessionRepository(transaction),
        );
        const audit = new AuditService(new PostgresAuditSink(transaction));

        await transactionalSessions.revoke(session.sessionId);
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
  };
  const app = createApp({
    appOrigin: env.APP_URL,
    logger,
    sessions,
    secureCookies: env.NODE_ENV === 'production',
    version: options.version,
  });

  return { ...database, app, env, logger };
}
