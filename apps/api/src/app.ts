import { cors } from 'hono/cors';
import { Hono } from 'hono';

import { HealthResponseSchema, type ApiErrorCode } from '@verdeo/contracts';
import { createRequestId, type Logger } from '@verdeo/observability';

interface AppVariables {
  logger: Logger;
  requestId: string;
}

interface CreateAppOptions {
  appOrigin: string;
  logger: Logger;
  version: string;
}

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

  app.get('/api/v1/me', (context) => {
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
