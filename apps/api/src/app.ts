import { cors } from 'hono/cors';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { Hono, type Context } from 'hono';

import type { AuthenticatedSession, SessionSummary, UserDirectoryPage } from '@verdeo/auth';
import {
  AIProviderConfigListResponseSchema,
  AIProviderConfigUpsertRequestSchema,
  HealthResponseSchema,
  CustomerCreateRequestSchema,
  CustomerListResponseSchema,
  CycleIdParamSchema,
  IdParamSchema,
  KitchenSummaryResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  MenuCreateRequestSchema,
  MenuListResponseSchema,
  MeResponseSchema,
  OrderCreateRequestSchema,
  OrderListResponseSchema,
  OrderSchema,
  OrderTransitionRequestSchema,
  PublicOrderCreateRequestSchema,
  SessionIdParamSchema,
  SessionListResponseSchema,
  UserListQuerySchema,
  UserListResponseSchema,
  type ApiErrorCode,
  type AIProviderConfigUpsertRequest,
  type CustomerCreateRequest,
  type MenuCreateRequest,
  type OrderCreateRequest,
  type OrderTransitionRequest,
  type PublicOrderCreateRequest,
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

interface LoginResult {
  expiresAt: Date;
  sessionId: string;
  token: string;
}

interface CredentialLogin {
  login(email: string, password: string, requestId: string): Promise<LoginResult | null>;
}

interface OperationsEngine {
  createCustomer(input: CustomerCreateRequest, context: OperationsContext): Promise<unknown>;
  createMenu(input: MenuCreateRequest, context: OperationsContext): Promise<unknown>;
  createOrder(input: OrderCreateRequest, context: OperationsContext): Promise<unknown>;
  createPublicOrder(input: PublicOrderCreateRequest, context: OperationsContext): Promise<unknown>;
  currentPublishedMenu(): Promise<unknown>;
  kitchenSummary(cycleId: string): Promise<unknown>;
  listCustomers(includeSensitive: boolean): Promise<unknown>;
  listMenus(onlyPublished?: boolean): Promise<unknown>;
  listOrders(): Promise<unknown>;
  publishMenu(menuId: string, context: OperationsContext): Promise<unknown>;
  transitionOrder(
    orderId: string,
    status: OrderTransitionRequest['status'],
    reason: string | undefined,
    confirmedReversal: boolean,
    context: OperationsContext,
  ): Promise<unknown>;
}

interface OperationsContext {
  actorUserId?: string;
  correlationId: string;
  requestId: string;
  source: string;
}

interface AIConfigurationEngine {
  list(): Promise<unknown>;
  upsert(input: AIProviderConfigUpsertRequest, context: AIConfigurationContext): Promise<unknown>;
}

interface AIConfigurationContext {
  actorUserId: string;
  correlationId: string;
  requestId: string;
  source: string;
}

interface CreateAppOptions {
  aiConfiguration?: AIConfigurationEngine;
  appOrigin: string;
  cookieSameSite: 'Lax' | 'None';
  credentials: CredentialLogin;
  logger: Logger;
  operations?: OperationsEngine;
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
  const operations = options.operations;

  const requireOperations = () => {
    if (!operations) throw new Error('Operations engine is not configured');
    return operations;
  };

  const operationsContext = (context: Context<{ Variables: AppVariables }>): OperationsContext => ({
    actorUserId: context.get('session')?.userId,
    correlationId: context.get('requestId'),
    requestId: context.get('requestId'),
    source: 'api',
  });

  const contractValue = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;

  const forbidden = (context: Context<{ Variables: AppVariables }>) => {
    const code: ApiErrorCode = 'FORBIDDEN';
    return context.json(
      {
        error: {
          code,
          message: 'No tenés permiso para realizar esta acción.',
          requestId: context.get('requestId'),
        },
      },
      statusForCode(code),
    );
  };

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
  app.use('*', cors({ origin: options.appOrigin, credentials: true }));

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

  app.get('/api/v1/public/menu/current', async (context) => {
    const menu = await requireOperations().currentPublishedMenu();
    if (!menu) {
      const code: ApiErrorCode = 'NOT_FOUND';
      return context.json(
        {
          error: {
            code,
            message: 'Todavía no hay un menú semanal publicado.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }
    return context.json(MenuListResponseSchema.parse({ items: [contractValue(menu)] }).items[0]);
  });

  app.post('/api/v1/public/orders', async (context) => {
    const input = PublicOrderCreateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: input.error.issues,
            message: 'Revisá los datos del pedido.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }
    const requestId = context.get('requestId');
    const order = await requireOperations().createPublicOrder(input.data, {
      correlationId: requestId,
      requestId,
      source: 'public-web',
    });
    return context.json(OrderSchema.parse(contractValue(order)), 201);
  });

  app.post('/api/v1/auth/login', async (context) => {
    const input = LoginRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: input.error.issues,
            message: 'Revisá el email y la contraseña.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    const login = await options.credentials.login(
      input.data.email,
      input.data.password,
      context.get('requestId'),
    );
    if (!login) {
      const code: ApiErrorCode = 'UNAUTHENTICATED';
      return context.json(
        {
          error: {
            code,
            message: 'El email o la contraseña no son válidos.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    setCookie(context, SESSION_COOKIE_NAME, login.token, {
      expires: login.expiresAt,
      httpOnly: true,
      path: '/',
      sameSite: options.cookieSameSite,
      secure: options.secureCookies || options.cookieSameSite === 'None',
    });

    const payload = LoginResponseSchema.parse({
      expiresAt: login.expiresAt.toISOString(),
      sessionId: login.sessionId,
    });
    return context.json(payload);
  });

  app.use('/api/v1/me', requireAuthentication);
  app.use('/api/v1/sessions', requireAuthentication);
  app.use('/api/v1/sessions/*', requireAuthentication);
  app.use('/api/v1/users', requireAuthentication, requirePermission('users.read'));
  app.use('/api/v1/customers', requireAuthentication);
  app.use('/api/v1/menus', requireAuthentication);
  app.use('/api/v1/menus/*', requireAuthentication);
  app.use('/api/v1/orders', requireAuthentication);
  app.use('/api/v1/orders/*', requireAuthentication);
  app.use('/api/v1/production/*', requireAuthentication);
  app.use('/api/v1/ai/providers', requireAuthentication);

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
      sameSite: options.cookieSameSite,
      secure: options.secureCookies || options.cookieSameSite === 'None',
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
        sameSite: options.cookieSameSite,
        secure: options.secureCookies || options.cookieSameSite === 'None',
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

  app.get('/api/v1/customers', async (context) => {
    const session = context.get('session');
    if (!session.permissions.includes('customers.read')) return forbidden(context);
    const items = await requireOperations().listCustomers(
      session.permissions.includes('customers.view_sensitive'),
    );
    return context.json(CustomerListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.post('/api/v1/customers', async (context) => {
    if (!context.get('session').permissions.includes('customers.create')) return forbidden(context);
    const input = CustomerCreateRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: input.error.issues,
            message: 'Revisá los datos del cliente.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }
    const customer = await requireOperations().createCustomer(
      input.data,
      operationsContext(context),
    );
    return context.json(
      CustomerListResponseSchema.parse({ items: [contractValue(customer)] }).items[0],
      201,
    );
  });

  app.get('/api/v1/menus', async (context) => {
    const permissions = context.get('session').permissions;
    if (!permissions.includes('orders.read') && !permissions.includes('production.read')) {
      return forbidden(context);
    }
    const items = await requireOperations().listMenus();
    return context.json(MenuListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.post('/api/v1/menus', async (context) => {
    if (!context.get('session').permissions.includes('production.generate'))
      return forbidden(context);
    const input = MenuCreateRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: input.error.issues,
            message: 'Revisá la semana y sus opciones.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }
    const menu = await requireOperations().createMenu(input.data, operationsContext(context));
    return context.json(
      MenuListResponseSchema.parse({ items: [contractValue(menu)] }).items[0],
      201,
    );
  });

  app.post('/api/v1/menus/:id/publish', async (context) => {
    if (!context.get('session').permissions.includes('production.generate'))
      return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            message: 'El menú indicado no es válido.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }
    const menu = await requireOperations().publishMenu(params.data.id, operationsContext(context));
    return context.json(MenuListResponseSchema.parse({ items: [contractValue(menu)] }).items[0]);
  });

  app.get('/api/v1/orders', async (context) => {
    if (!context.get('session').permissions.includes('orders.read')) return forbidden(context);
    const items = await requireOperations().listOrders();
    return context.json(OrderListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.post('/api/v1/orders', async (context) => {
    if (!context.get('session').permissions.includes('orders.create')) return forbidden(context);
    const input = OrderCreateRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: input.error.issues,
            message: 'Revisá los datos del pedido.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }
    const order = await requireOperations().createOrder(input.data, operationsContext(context));
    return context.json(OrderSchema.parse(contractValue(order)), 201);
  });

  app.post('/api/v1/orders/:id/status', async (context) => {
    const session = context.get('session');
    const params = IdParamSchema.safeParse(context.req.param());
    const input = OrderTransitionRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            message: 'La transición solicitada no es válida.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }
    const permission =
      input.data.status === 'CONFIRMED'
        ? input.data.confirmedReversal
          ? 'orders.revert_status'
          : 'orders.confirm'
        : input.data.status === 'CANCELLED'
          ? 'orders.cancel'
          : input.data.confirmedReversal
            ? 'orders.revert_status'
            : 'orders.edit';
    if (!session.permissions.includes(permission)) return forbidden(context);

    const order = await requireOperations().transitionOrder(
      params.data.id,
      input.data.status,
      input.data.reason,
      input.data.confirmedReversal,
      operationsContext(context),
    );
    return context.json(OrderSchema.parse(contractValue(order)));
  });

  app.get('/api/v1/production/:cycleId', async (context) => {
    if (!context.get('session').permissions.includes('production.read')) return forbidden(context);
    const params = CycleIdParamSchema.safeParse(context.req.param());
    if (!params.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            message: 'El ciclo indicado no es válido.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }
    const summary = await requireOperations().kitchenSummary(params.data.cycleId);
    return context.json(KitchenSummaryResponseSchema.parse(contractValue(summary)));
  });

  app.get('/api/v1/ai/providers', async (context) => {
    if (!context.get('session').permissions.includes('ai.providers.manage'))
      return forbidden(context);
    if (!options.aiConfiguration) throw new Error('AI configuration engine is not configured');
    return context.json(
      AIProviderConfigListResponseSchema.parse(contractValue(await options.aiConfiguration.list())),
    );
  });

  app.put('/api/v1/ai/providers', async (context) => {
    const session = context.get('session');
    if (!session.permissions.includes('ai.providers.manage')) return forbidden(context);
    if (!options.aiConfiguration) throw new Error('AI configuration engine is not configured');
    const input = AIProviderConfigUpsertRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: input.error.issues,
            message: 'Revisá la configuración del proveedor.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }
    const requestId = context.get('requestId');
    const result = await options.aiConfiguration.upsert(input.data, {
      actorUserId: session.userId,
      correlationId: requestId,
      requestId,
      source: 'api',
    });
    return context.json(AIProviderConfigListResponseSchema.parse(contractValue(result)));
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
    if (error.name === 'OperationsNotFoundError') {
      const code: ApiErrorCode = 'NOT_FOUND';
      return context.json(
        { error: { code, message: error.message, requestId: context.get('requestId') } },
        statusForCode(code),
      );
    }
    if (
      error.name === 'OperationsConflictError' ||
      error.name === 'OrderRuleError' ||
      error.name === 'AIConfigurationUnavailableError'
    ) {
      const code: ApiErrorCode = 'CONFLICT';
      return context.json(
        { error: { code, message: error.message, requestId: context.get('requestId') } },
        statusForCode(code),
      );
    }
    (context.get('logger') ?? options.logger).error({ error, event: 'http.request.failed' });
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
