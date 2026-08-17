import { cors } from 'hono/cors';
import { deleteCookie, getCookie } from 'hono/cookie';
import { Hono, type Context } from 'hono';

import type { AuthenticatedSession, SessionSummary, UserDirectoryPage } from '@verdeo/auth';
import {
  HealthResponseSchema,
  MeResponseSchema,
  SessionIdParamSchema,
  SessionListResponseSchema,
  UserListQuerySchema,
  UserListResponseSchema,
  type ApiErrorCode,
} from '@verdeo/contracts';
import { createRequestId, type Logger } from '@verdeo/observability';

import { requirePermission } from './middleware/authorization.js';

interface AppVariables {
  logger: Logger;
  requestId: string;
  session: AuthenticatedSession;
}

interface SessionAuthenticator {
  authenticate(token: string): Promise<AuthenticatedSession | null>;
  listForUser(userId: string): Promise<readonly SessionSummary[]>;
  revoke(session: AuthenticatedSession, requestId: string): Promise<void>;
  revokeOwned(
    session: AuthenticatedSession,
    targetSessionId: string,
    requestId: string,
  ): Promise<boolean>;
}

interface UserDirectory {
  list(afterId: string | undefined, limit: number): Promise<UserDirectoryPage>;
}

interface CreateAppOptions {
  appOrigin: string;
  logger: Logger;
  sessions: SessionAuthenticator;
  secureCookies: boolean;
  users: UserDirectory;
  version: string;
}

export const SESSION_COOKIE_NAME = 'verdeo_session';

function statusForCode(code: ApiErrorCode): 400 | 401 | 403 | 404 | 409 | 429 | 500 {
  const statuses: Record<ApiErrorCode, 400 | 401 | 403 | 404 | 409 | 429 | 500> = {
    BAD_REQUEST: 400,
    UNAUTHENTICATED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    RATE_LIMITED: 429,
    INTERNAL_ERROR: 500,
  };
  return statuses[code];
}

export function createApp(options: CreateAppOptions) {
  const app = new Hono<{ Variables: AppVariables }>();

  const requireAuthentication = async (
    context: Context<{ Variables: AppVariables }>,
    next: () => Promise<void>,
  ) => {
    const token = getCookie(context as Context, SESSION_COOKIE_NAME);
    const session = token ? await options.sessions.authenticate(token) : null;

    if (!session) {
      const code: ApiErrorCode = 'UNAUTHENTICATED';
      return context.json(
        {
          error: {
            code,
            message: 'Necesitás iniciar sesión.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    context.set('session', session);
    await next();
  };

  app.use('*', cors({ origin: options.appOrigin, credentials: true }));
  app.use('*', async (context, next) => {
    const startedAt = performance.now();
    const requestId = createRequestId(context.req.header('x-request-id'));
    const logger = options.logger.child({ requestId });

    context.set('requestId', requestId);
    context.set('logger', logger);
    context.header('x-request-id', requestId);

    await next();

    logger.info({
      duration: Math.round(performance.now() - startedAt),
      event: 'http.request.completed',
      method: context.req.method,
      path: context.req.path,
      status: context.res.status,
    });
  });

  app.get('/health', (context) => {
    const payload = HealthResponseSchema.parse({
      service: 'verdeo-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: options.version,
    });
    return context.json(payload);
  });

  app.get('/api/v1/config/public', (context) =>
    context.json({ locale: 'es-AR', productName: 'Verdeo SCA' }),
  );

  app.use('/api/v1/me', requireAuthentication);
  app.use('/api/v1/sessions', requireAuthentication);
  app.use('/api/v1/sessions/*', requireAuthentication);
  app.use('/api/v1/users', requireAuthentication, requirePermission('users.read'));

  app.get('/api/v1/me', (context) => {
    const session = context.get('session');
    const payload = MeResponseSchema.parse({
      permissions: [...session.permissions].sort(),
      session: {
        expiresAt: session.expiresAt.toISOString(),
        id: session.sessionId,
      },
      user: { id: session.userId },
    });

    return context.json(payload);
  });

  app.post('/api/v1/auth/logout', async (context) => {
    const token = getCookie(context as Context, SESSION_COOKIE_NAME);

    if (token) {
      const session = await options.sessions.authenticate(token);
      if (session) await options.sessions.revoke(session, context.get('requestId'));
    }

    deleteCookie(context, SESSION_COOKIE_NAME, {
      httpOnly: true,
      path: '/',
      sameSite: 'Lax',
      secure: options.secureCookies,
    });

    return context.body(null, 204);
  });

  app.get('/api/v1/sessions', async (context) => {
    const currentSession = context.get('session');
    const sessionRows = await options.sessions.listForUser(currentSession.userId);
    const payload = SessionListResponseSchema.parse({
      items: sessionRows.map((session) => ({
        createdAt: session.createdAt.toISOString(),
        current: session.id === currentSession.sessionId,
        expiresAt: session.expiresAt.toISOString(),
        id: session.id,
        lastSeenAt: session.lastSeenAt.toISOString(),
        revokedAt: session.revokedAt?.toISOString() ?? null,
      })),
    });

    return context.json(payload);
  });

  app.delete('/api/v1/sessions/:id', async (context) => {
    const params = SessionIdParamSchema.safeParse(context.req.param());
    if (!params.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: params.error.issues,
            message: 'El identificador de sesión no es válido.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    const currentSession = context.get('session');
    const revoked = await options.sessions.revokeOwned(
      currentSession,
      params.data.id,
      context.get('requestId'),
    );

    if (!revoked) {
      const code: ApiErrorCode = 'NOT_FOUND';
      return context.json(
        {
          error: {
            code,
            message: 'La sesión solicitada no existe.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    if (params.data.id === currentSession.sessionId) {
      deleteCookie(context, SESSION_COOKIE_NAME, {
        httpOnly: true,
        path: '/',
        sameSite: 'Lax',
        secure: options.secureCookies,
      });
    }

    return context.body(null, 204);
  });

  app.get('/api/v1/users', async (context) => {
    const query = UserListQuerySchema.safeParse(context.req.query());
    if (!query.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: query.error.issues,
            message: 'Los parámetros de paginación no son válidos.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    const page = await options.users.list(query.data.cursor, query.data.limit);
    const payload = UserListResponseSchema.parse({
      items: page.items.map((user) => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    });

    return context.json(payload);
  });

  app.notFound((context) => {
    const code: ApiErrorCode = 'NOT_FOUND';
    return context.json(
      {
        error: {
          code,
          message: 'El recurso solicitado no existe.',
          requestId: context.get('requestId'),
        },
      },
      statusForCode(code),
    );
  });

  app.onError((error, context) => {
    context.get('logger').error({ error, event: 'http.request.failed' });
    const code: ApiErrorCode = 'INTERNAL_ERROR';
    return context.json(
      {
        error: {
          code,
          message: 'Ocurrió un error inesperado.',
          requestId: context.get('requestId'),
        },
      },
      statusForCode(code),
    );
  });

  return app;
}
