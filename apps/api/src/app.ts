import { cors } from 'hono/cors';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { Hono, type Context } from 'hono';

import type { AuthenticatedSession, SessionSummary, UserDirectoryPage } from '@verdeo/auth';
import {
  AIProviderConfigListResponseSchema,
  AIProviderConfigUpsertRequestSchema,
  AddressGeocodingConfirmRequestSchema,
  AddressGeocodingCreateRequestSchema,
  AddressGeocodingParamSchema,
  AddressGeocodingRejectRequestSchema,
  AddressGeocodingRequestSchema,
  CustomerAddressParamSchema,
  CustomerAddressCreateRequestSchema,
  CustomerAddressSchema,
  CustomerAddressUpdateRequestSchema,
  CustomerCreateRequestSchema,
  CustomerDetailSchema,
  CustomerIdentityCreateRequestSchema,
  CustomerIdentitySchema,
  CustomerIdentityUpdateRequestSchema,
  CustomerImportResponseSchema,
  CustomerListResponseSchema,
  CustomerListQuerySchema,
  CustomerPreferenceCreateRequestSchema,
  CustomerPreferenceSchema,
  CustomerPreferenceUpdateRequestSchema,
  CustomerRelationParamSchema,
  CustomerRestrictionCreateRequestSchema,
  CustomerRestrictionSchema,
  CustomerRestrictionUpdateRequestSchema,
  CustomerUpdateRequestSchema,
  HealthResponseSchema,
  CycleIdParamSchema,
  GeographicZoneCreateRequestSchema,
  GeographicZoneListResponseSchema,
  GeographicZoneSchema,
  GeographicZoneUpdateRequestSchema,
  IdParamSchema,
  OperatingSiteCreateRequestSchema,
  OperatingSiteListResponseSchema,
  OperatingSiteSchema,
  OperatingSiteUpdateRequestSchema,
  KitchenSummaryResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  MenuCreateRequestSchema,
  MenuDistributeRequestSchema,
  MenuDistributionResponseSchema,
  MenuListResponseSchema,
  MessageTemplateListResponseSchema,
  MessageTemplateSchema,
  MessageTemplateUpsertRequestSchema,
  MeResponseSchema,
  OrderCreateRequestSchema,
  OrderListQuerySchema,
  OrderPageResponseSchema,
  OrderRevisionListResponseSchema,
  OrderSchema,
  OrderStatusHistoryResponseSchema,
  OrderTransitionRequestSchema,
  OrderUpdateRequestSchema,
  OAuthExchangeRequestSchema,
  PublicOperatingSiteListResponseSchema,
  PublicOrderCreateRequestSchema,
  ScopeResponseSchema,
  SessionIdParamSchema,
  SessionListResponseSchema,
  UserListQuerySchema,
  UserListResponseSchema,
  type ApiErrorCode,
  type AIProviderConfigUpsertRequest,
  type AddressGeocodingConfirmRequest,
  type AddressGeocodingCreateRequest,
  type CustomerCreateRequest,
  type CustomerAddressCreateRequest,
  type CustomerAddressUpdateRequest,
  type CustomerIdentityCreateRequest,
  type CustomerIdentityUpdateRequest,
  type CustomerListQuery,
  type CustomerPreferenceCreateRequest,
  type CustomerPreferenceUpdateRequest,
  type CustomerRestrictionCreateRequest,
  type CustomerRestrictionUpdateRequest,
  type CustomerUpdateRequest,
  type GeographicZoneCreateRequest,
  type GeographicZoneUpdateRequest,
  type MessageTemplateUpsertRequest,
  type OperatingSiteCreateRequest,
  type OperatingSiteUpdateRequest,
  type MenuCreateRequest,
  type MenuDistributeRequest,
  type OrderCreateRequest,
  type OrderListQuery,
  type OrderTransitionRequest,
  type OrderUpdateRequest,
  type PublicOrderCreateRequest,
} from '@verdeo/contracts';
import { createRequestId, type Logger } from '@verdeo/observability';

import { ContactImportError, parseContactImport } from './integrations/contact-import.js';
import { requirePermission } from './middleware/authorization.js';

interface AppVariables {
  logger: Logger;
  requestId: string;
  scope: ScopeSelection;
  session: AuthenticatedSession;
}

// `operatingSiteId: null` is the consolidated global view, never a persisted operation (ADR-028).
interface ScopeSelection {
  operatingSiteId: string | null;
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
  findById(id: string): Promise<{ displayName: string; id: string } | null>;
  list(afterId: string | undefined, limit: number): Promise<UserDirectoryPage>;
}

type ScopedInput<T> = T & { operatingSiteId: string | null };

interface ResolvedScope {
  canSelectGlobal: boolean;
  defaultSiteId: string | null;
  sites: readonly { id: string }[];
}

interface GeographyEngine {
  createSite(input: OperatingSiteCreateRequest, context: GeographyContext): Promise<unknown>;
  createZone(input: GeographicZoneCreateRequest, context: GeographyContext): Promise<unknown>;
  listSites(): Promise<unknown>;
  listActiveZones(operatingSiteId: string | null): Promise<unknown>;
  listZones(operatingSiteId: string): Promise<unknown>;
  resolveScope(userId: string, canAccessAllSites: boolean): Promise<ResolvedScope>;
  updateSite(
    id: string,
    input: OperatingSiteUpdateRequest,
    context: GeographyContext,
  ): Promise<unknown>;
  updateZone(
    id: string,
    input: GeographicZoneUpdateRequest,
    context: GeographyContext,
  ): Promise<unknown>;
}

interface GeographyContext {
  actorUserId?: string | undefined;
  correlationId: string;
  requestId: string;
  source: string;
}

interface LoginResult {
  expiresAt: Date;
  sessionId: string;
  token: string;
}

interface CredentialLogin {
  login(email: string, password: string, requestId: string): Promise<LoginResult | null>;
}

interface OAuthLogin {
  exchange(accessToken: string, requestId: string): Promise<LoginResult | null>;
}

interface OperationsEngine {
  addCustomerAddress(
    customerId: string,
    input: CustomerAddressCreateRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  addCustomerIdentity(
    customerId: string,
    input: CustomerIdentityCreateRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  addCustomerPreference(
    customerId: string,
    input: CustomerPreferenceCreateRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  addCustomerRestriction(
    customerId: string,
    input: CustomerRestrictionCreateRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  createCustomer(
    input: ScopedInput<CustomerCreateRequest>,
    context: OperationsContext,
  ): Promise<unknown>;
  importCustomers?(
    inputs: readonly ScopedInput<CustomerCreateRequest>[],
    context: OperationsContext,
  ): Promise<readonly unknown[]>;
  createMenu(input: MenuCreateRequest, context: OperationsContext): Promise<unknown>;
  distributeMenu(
    menuId: string,
    input: MenuDistributeRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  createOrder(input: ScopedInput<OrderCreateRequest>, context: OperationsContext): Promise<unknown>;
  createPublicOrder(input: PublicOrderCreateRequest, context: OperationsContext): Promise<unknown>;
  confirmAddressGeocoding(
    customerId: string,
    addressId: string,
    requestId: string,
    input: AddressGeocodingConfirmRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  currentPublishedMenu(operatingSiteId: string | null): Promise<unknown>;
  exportOrdersCsv(
    input: ScopedInput<Omit<OrderListQuery, 'cursor' | 'limit'>>,
    context: OperationsContext,
  ): Promise<string>;
  getCustomer(customerId: string, includeSensitive: boolean): Promise<unknown>;
  getAddressGeocodingRequest(
    customerId: string,
    addressId: string,
    requestId: string,
  ): Promise<unknown>;
  getOrder(orderId: string): Promise<unknown>;
  kitchenSummary(cycleId: string, operatingSiteId: string | null): Promise<unknown>;
  listCustomers(input: ScopedInput<CustomerListQuery>, includeSensitive: boolean): Promise<unknown>;
  listMessageTemplates(): Promise<unknown>;
  listMenus(onlyPublished?: boolean): Promise<unknown>;
  listOrders(input: ScopedInput<OrderListQuery>): Promise<unknown>;
  orderHistory(orderId: string): Promise<unknown>;
  orderRevisionHistory(orderId: string): Promise<unknown>;
  publishMenu(menuId: string, context: OperationsContext): Promise<unknown>;
  rejectAddressGeocoding(
    customerId: string,
    addressId: string,
    requestId: string,
    reason: string,
    context: OperationsContext,
  ): Promise<unknown>;
  requestAddressGeocoding(
    customerId: string,
    addressId: string,
    input: AddressGeocodingCreateRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  transitionOrder(
    orderId: string,
    status: OrderTransitionRequest['status'],
    reason: string | undefined,
    confirmedReversal: boolean,
    allowCycleOverride: boolean,
    context: OperationsContext,
  ): Promise<unknown>;
  updateCustomer(
    customerId: string,
    input: CustomerUpdateRequest,
    includeSensitive: boolean,
    context: OperationsContext,
  ): Promise<unknown>;
  updateCustomerAddress(
    customerId: string,
    addressId: string,
    input: CustomerAddressUpdateRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  updateCustomerIdentity(
    customerId: string,
    identityId: string,
    input: CustomerIdentityUpdateRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  updateCustomerRestriction(
    customerId: string,
    restrictionId: string,
    input: CustomerRestrictionUpdateRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  updateOrder(
    orderId: string,
    input: OrderUpdateRequest,
    allowCycleOverride: boolean,
    context: OperationsContext,
  ): Promise<unknown>;
  updateCustomerPreference(
    customerId: string,
    preferenceId: string,
    input: CustomerPreferenceUpdateRequest,
    context: OperationsContext,
  ): Promise<unknown>;
  upsertMessageTemplate(
    input: MessageTemplateUpsertRequest,
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
  geography?: GeographyEngine;
  logger: Logger;
  oauth?: OAuthLogin;
  operations?: OperationsEngine;
  sessions: SessionAuthenticator;
  secureCookies: boolean;
  users: UserDirectory;
  version: string;
}

export const SESSION_COOKIE_NAME = 'verdeo_session';
export const SITE_SCOPE_HEADER = 'x-verdeo-site';

function statusForCode(code: ApiErrorCode): 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503 {
  const statuses: Record<ApiErrorCode, 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503> = {
    BAD_REQUEST: 400,
    UNAUTHENTICATED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    RATE_LIMITED: 429,
    SERVICE_UNAVAILABLE: 503,
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

  const geography = options.geography;

  const requireGeography = () => {
    if (!geography) throw new Error('Geography engine is not configured');
    return geography;
  };

  // The client sends its selected operation, but membership is resolved server-side and intersected
  // with it. An operation the session cannot reach answers 403, never an empty list (ADR-031).
  const resolveScopeSelection = async (
    context: Context<{ Variables: AppVariables }>,
    next: () => Promise<void>,
  ) => {
    const session = context.get('session');
    const scope = await requireGeography().resolveScope(
      session.userId,
      session.permissions.includes('sites.access_all'),
    );
    const requested = context.req.header(SITE_SCOPE_HEADER)?.trim();

    if (!requested || requested.toLowerCase() === 'global') {
      // No explicit selection never widens access: global only for sessions allowed to use it,
      // otherwise the session's own default operation.
      context.set('scope', {
        operatingSiteId: scope.canSelectGlobal ? null : scope.defaultSiteId,
      });
      await next();
      return;
    }

    if (!scope.sites.some((site) => site.id === requested)) return forbidden(context);

    context.set('scope', { operatingSiteId: requested });
    await next();
  };

  const scoped = <T>(context: Context<{ Variables: AppVariables }>, input: T): ScopedInput<T> => ({
    ...input,
    operatingSiteId: context.get('scope')?.operatingSiteId ?? null,
  });

  const geographyContext = (context: Context<{ Variables: AppVariables }>): GeographyContext => ({
    actorUserId: context.get('session')?.userId,
    correlationId: context.get('requestId'),
    requestId: context.get('requestId'),
    source: 'api',
  });

  const operationsContext = (context: Context<{ Variables: AppVariables }>): OperationsContext => ({
    actorUserId: context.get('session')?.userId,
    correlationId: context.get('requestId'),
    requestId: context.get('requestId'),
    source: 'api',
  });

  const contractValue = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;

  const setSessionCookie = (context: Context, login: LoginResult) => {
    setCookie(context, SESSION_COOKIE_NAME, login.token, {
      expires: login.expiresAt,
      httpOnly: true,
      path: '/',
      sameSite: options.cookieSameSite,
      secure: options.secureCookies || options.cookieSameSite === 'None',
    });
  };

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

  const badRequest = (
    context: Context<{ Variables: AppVariables }>,
    message: string,
    details?: unknown,
  ) => {
    const code: ApiErrorCode = 'BAD_REQUEST';
    return context.json(
      {
        error: {
          code,
          ...(details === undefined ? {} : { details }),
          message,
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

  // Public site directory for the guest city selector. Names and slugs only: no contact data,
  // no counts, nothing an operator configured as internal.
  app.get('/api/v1/public/operating-sites', async (context) => {
    const sites = await requireGeography().listSites();
    const items = (sites as readonly { active: boolean; displayName: string; slug: string }[])
      .filter((site) => site.active)
      .map((site) => ({ displayName: site.displayName, slug: site.slug }));
    return context.json(PublicOperatingSiteListResponseSchema.parse({ items }));
  });

  app.get('/api/v1/public/menu/current', async (context) => {
    // A visitor's city selects which published revision they see; without one, the global master.
    const requestedSlug = context.req.query('site')?.trim();
    const sites = requestedSlug
      ? ((await requireGeography().listSites()) as readonly {
          active: boolean;
          id: string;
          slug: string;
        }[])
      : [];
    const site = sites.find((candidate) => candidate.active && candidate.slug === requestedSlug);
    const menu = await requireOperations().currentPublishedMenu(site?.id ?? null);
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

    setSessionCookie(context, login);

    const payload = LoginResponseSchema.parse({
      expiresAt: login.expiresAt.toISOString(),
      sessionId: login.sessionId,
    });
    return context.json(payload);
  });

  app.post('/api/v1/auth/oauth/exchange', async (context) => {
    const input = OAuthExchangeRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success) {
      const code: ApiErrorCode = 'BAD_REQUEST';
      return context.json(
        {
          error: {
            code,
            details: input.error.issues,
            message: 'La respuesta de autenticación no es válida.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    if (!options.oauth) {
      const code: ApiErrorCode = 'SERVICE_UNAVAILABLE';
      return context.json(
        {
          error: {
            code,
            message: 'El acceso con Google todavía no está disponible.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    const login = await options.oauth.exchange(input.data.accessToken, context.get('requestId'));
    if (!login) {
      const code: ApiErrorCode = 'UNAUTHENTICATED';
      return context.json(
        {
          error: {
            code,
            message: 'Esta cuenta no tiene acceso habilitado en Verdeo.',
            requestId: context.get('requestId'),
          },
        },
        statusForCode(code),
      );
    }

    setSessionCookie(context, login);
    context.header('cache-control', 'no-store');

    return context.json(
      LoginResponseSchema.parse({
        expiresAt: login.expiresAt.toISOString(),
        sessionId: login.sessionId,
      }),
    );
  });

  app.use('/api/v1/me', requireAuthentication);
  app.use('/api/v1/sessions', requireAuthentication);
  app.use('/api/v1/sessions/*', requireAuthentication);
  app.use('/api/v1/users', requireAuthentication, requirePermission('users.read'));
  app.use('/api/v1/scope', requireAuthentication);
  app.use('/api/v1/operating-sites', requireAuthentication);
  app.use('/api/v1/operating-sites/*', requireAuthentication);
  app.use('/api/v1/zones', requireAuthentication, resolveScopeSelection);
  app.use('/api/v1/zones/*', requireAuthentication);
  app.use('/api/v1/customers', requireAuthentication, resolveScopeSelection);
  app.use('/api/v1/customers/*', requireAuthentication, resolveScopeSelection);
  app.use('/api/v1/message-templates', requireAuthentication);
  app.use('/api/v1/menus', requireAuthentication);
  app.use('/api/v1/menus/*', requireAuthentication);
  app.use('/api/v1/orders', requireAuthentication, resolveScopeSelection);
  app.use('/api/v1/orders/*', requireAuthentication, resolveScopeSelection);
  app.use('/api/v1/production/*', requireAuthentication, resolveScopeSelection);
  app.use('/api/v1/ai/providers', requireAuthentication);

  app.get('/api/v1/me', async (context) => {
    const session = context.get('session');
    const user = await options.users.findById(session.userId);
    if (!user) throw new Error(`Authenticated user not found: ${session.userId}`);
    const payload = MeResponseSchema.parse({
      permissions: [...session.permissions].sort(),
      session: {
        expiresAt: session.expiresAt.toISOString(),
        id: session.sessionId,
      },
      user: { displayName: user.displayName, id: session.userId },
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

  app.get('/api/v1/scope', async (context) => {
    const session = context.get('session');
    const scope = await requireGeography().resolveScope(
      session.userId,
      session.permissions.includes('sites.access_all'),
    );
    return context.json(ScopeResponseSchema.parse(contractValue(scope)));
  });

  // Zones of the active scope, for any screen that must attach an address to one.
  app.get('/api/v1/zones', async (context) => {
    const items = await requireGeography().listActiveZones(
      context.get('scope')?.operatingSiteId ?? null,
    );
    return context.json(GeographicZoneListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.get('/api/v1/operating-sites', requirePermission('sites.read'), async (context) => {
    const items = await requireGeography().listSites();
    return context.json(OperatingSiteListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.post('/api/v1/operating-sites', requirePermission('sites.manage'), async (context) => {
    const input = OperatingSiteCreateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success)
      return badRequest(context, 'Revisá los datos de la operación.', input.error.issues);
    const site = await requireGeography().createSite(input.data, geographyContext(context));
    return context.json(OperatingSiteSchema.parse(contractValue(site)), 201);
  });

  app.patch('/api/v1/operating-sites/:id', requirePermission('sites.manage'), async (context) => {
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'Identificador inválido.', params.error.issues);
    const input = OperatingSiteUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success)
      return badRequest(context, 'Revisá los datos de la operación.', input.error.issues);
    const site = await requireGeography().updateSite(
      params.data.id,
      input.data,
      geographyContext(context),
    );
    return context.json(OperatingSiteSchema.parse(contractValue(site)));
  });

  app.get('/api/v1/operating-sites/:id/zones', requirePermission('sites.read'), async (context) => {
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'Identificador inválido.', params.error.issues);
    const items = await requireGeography().listZones(params.data.id);
    return context.json(GeographicZoneListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.post(
    '/api/v1/operating-sites/:id/zones',
    requirePermission('zones.manage'),
    async (context) => {
      const params = IdParamSchema.safeParse(context.req.param());
      if (!params.success)
        return badRequest(context, 'Identificador inválido.', params.error.issues);
      const input = GeographicZoneCreateRequestSchema.safeParse({
        ...((await context.req.json().catch(() => null)) ?? {}),
        operatingSiteId: params.data.id,
      });
      if (!input.success)
        return badRequest(context, 'Revisá los datos de la zona.', input.error.issues);
      const zone = await requireGeography().createZone(input.data, geographyContext(context));
      return context.json(GeographicZoneSchema.parse(contractValue(zone)), 201);
    },
  );

  app.patch('/api/v1/zones/:id', requirePermission('zones.manage'), async (context) => {
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'Identificador inválido.', params.error.issues);
    const input = GeographicZoneUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success)
      return badRequest(context, 'Revisá los datos de la zona.', input.error.issues);
    const zone = await requireGeography().updateZone(
      params.data.id,
      input.data,
      geographyContext(context),
    );
    return context.json(GeographicZoneSchema.parse(contractValue(zone)));
  });

  app.get('/api/v1/customers', async (context) => {
    const session = context.get('session');
    if (!session.permissions.includes('customers.read')) return forbidden(context);
    const query = CustomerListQuerySchema.safeParse(context.req.query());
    if (!query.success)
      return badRequest(context, 'Los filtros de clientes no son válidos.', query.error.issues);
    const page = await requireOperations().listCustomers(
      scoped(context, query.data),
      session.permissions.includes('customers.view_sensitive'),
    );
    return context.json(CustomerListResponseSchema.parse(contractValue(page)));
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
      scoped(context, input.data),
      operationsContext(context),
    );
    return context.json(
      CustomerListResponseSchema.parse({ items: [contractValue(customer)], nextCursor: null })
        .items[0],
      201,
    );
  });

  app.post('/api/v1/customers/import', async (context) => {
    if (!context.get('session').permissions.includes('customers.create')) return forbidden(context);
    const body = await context.req.parseBody().catch(() => null);
    const file = body?.file;
    if (!(file instanceof File)) {
      return badRequest(context, 'Adjuntá un archivo CSV o Excel (.xlsx) en el campo file.');
    }
    try {
      const zoneField = body?.geographicZoneId;
      const customers = await parseContactImport(
        file,
        typeof zoneField === 'string' && zoneField ? zoneField : undefined,
      );
      const operations = requireOperations();
      if (!operations.importCustomers) throw new Error('Customer import is not configured');
      await operations.importCustomers(
        customers.map((customer) => scoped(context, customer)),
        {
          ...operationsContext(context),
          source: 'spreadsheet_import',
        },
      );
      return context.json(CustomerImportResponseSchema.parse({ imported: customers.length }), 201);
    } catch (error) {
      if (error instanceof ContactImportError) {
        return badRequest(context, error.message, error.details);
      }
      throw error;
    }
  });

  app.get('/api/v1/customers/:id', async (context) => {
    const session = context.get('session');
    if (!session.permissions.includes('customers.read')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'El cliente indicado no es válido.');
    const customer = await requireOperations().getCustomer(
      params.data.id,
      session.permissions.includes('customers.view_sensitive'),
    );
    return context.json(CustomerDetailSchema.parse(contractValue(customer)));
  });

  app.patch('/api/v1/customers/:id', async (context) => {
    const session = context.get('session');
    if (!session.permissions.includes('customers.edit')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    const input = CustomerUpdateRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá los cambios del cliente.',
        input.success ? undefined : input.error.issues,
      );
    const customer = await requireOperations().updateCustomer(
      params.data.id,
      input.data,
      session.permissions.includes('customers.view_sensitive'),
      operationsContext(context),
    );
    return context.json(CustomerDetailSchema.parse(contractValue(customer)));
  });

  app.post('/api/v1/customers/:id/identities', async (context) => {
    const permissions = context.get('session').permissions;
    if (
      !permissions.includes('customers.edit') ||
      !permissions.includes('customers.view_sensitive')
    )
      return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    const input = CustomerIdentityCreateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá los datos de contacto.',
        input.success ? undefined : input.error.issues,
      );
    const identity = await requireOperations().addCustomerIdentity(
      params.data.id,
      input.data,
      operationsContext(context),
    );
    return context.json(CustomerIdentitySchema.parse(contractValue(identity)), 201);
  });

  app.patch('/api/v1/customers/:customerId/identities/:relationId', async (context) => {
    const permissions = context.get('session').permissions;
    if (
      !permissions.includes('customers.edit') ||
      !permissions.includes('customers.view_sensitive')
    )
      return forbidden(context);
    const params = CustomerRelationParamSchema.safeParse(context.req.param());
    const input = CustomerIdentityUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá los cambios del contacto.',
        input.success ? undefined : input.error.issues,
      );
    const identity = await requireOperations().updateCustomerIdentity(
      params.data.customerId,
      params.data.relationId,
      input.data,
      operationsContext(context),
    );
    return context.json(CustomerIdentitySchema.parse(contractValue(identity)));
  });

  app.post('/api/v1/customers/:id/addresses', async (context) => {
    const permissions = context.get('session').permissions;
    if (
      !permissions.includes('customers.edit') ||
      !permissions.includes('customers.view_sensitive')
    )
      return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    const input = CustomerAddressCreateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá el domicilio.',
        input.success ? undefined : input.error.issues,
      );
    const address = await requireOperations().addCustomerAddress(
      params.data.id,
      input.data,
      operationsContext(context),
    );
    return context.json(CustomerAddressSchema.parse(contractValue(address)), 201);
  });

  app.patch('/api/v1/customers/:customerId/addresses/:relationId', async (context) => {
    const permissions = context.get('session').permissions;
    if (
      !permissions.includes('customers.edit') ||
      !permissions.includes('customers.view_sensitive')
    )
      return forbidden(context);
    const params = CustomerRelationParamSchema.safeParse(context.req.param());
    const input = CustomerAddressUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá los cambios del domicilio.',
        input.success ? undefined : input.error.issues,
      );
    const address = await requireOperations().updateCustomerAddress(
      params.data.customerId,
      params.data.relationId,
      input.data,
      operationsContext(context),
    );
    return context.json(CustomerAddressSchema.parse(contractValue(address)));
  });

  app.post('/api/v1/customers/:customerId/addresses/:addressId/geocoding', async (context) => {
    const permissions = context.get('session').permissions;
    if (
      !permissions.includes('customers.edit') ||
      !permissions.includes('customers.view_sensitive')
    )
      return forbidden(context);
    const params = CustomerAddressParamSchema.safeParse(context.req.param());
    const input = AddressGeocodingCreateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá la solicitud de geocodificación.',
        input.success ? undefined : input.error.issues,
      );
    const request = await requireOperations().requestAddressGeocoding(
      params.data.customerId,
      params.data.addressId,
      input.data,
      operationsContext(context),
    );
    return context.json(AddressGeocodingRequestSchema.parse(contractValue(request)), 201);
  });

  app.get(
    '/api/v1/customers/:customerId/addresses/:addressId/geocoding/:requestId',
    async (context) => {
      const permissions = context.get('session').permissions;
      if (
        !permissions.includes('customers.read') ||
        !permissions.includes('customers.view_sensitive')
      )
        return forbidden(context);
      const params = AddressGeocodingParamSchema.safeParse(context.req.param());
      if (!params.success)
        return badRequest(context, 'La solicitud de geocodificación no es válida.');
      const request = await requireOperations().getAddressGeocodingRequest(
        params.data.customerId,
        params.data.addressId,
        params.data.requestId,
      );
      return context.json(AddressGeocodingRequestSchema.parse(contractValue(request)));
    },
  );

  app.post(
    '/api/v1/customers/:customerId/addresses/:addressId/geocoding/:requestId/confirm',
    async (context) => {
      const permissions = context.get('session').permissions;
      if (
        !permissions.includes('customers.edit') ||
        !permissions.includes('customers.view_sensitive')
      )
        return forbidden(context);
      const params = AddressGeocodingParamSchema.safeParse(context.req.param());
      const input = AddressGeocodingConfirmRequestSchema.safeParse(
        await context.req.json().catch(() => null),
      );
      if (!params.success || !input.success)
        return badRequest(
          context,
          'Revisá la confirmación de ubicación.',
          input.success ? undefined : input.error.issues,
        );
      const address = await requireOperations().confirmAddressGeocoding(
        params.data.customerId,
        params.data.addressId,
        params.data.requestId,
        input.data,
        operationsContext(context),
      );
      return context.json(CustomerAddressSchema.parse(contractValue(address)));
    },
  );

  app.post(
    '/api/v1/customers/:customerId/addresses/:addressId/geocoding/:requestId/reject',
    async (context) => {
      const permissions = context.get('session').permissions;
      if (
        !permissions.includes('customers.edit') ||
        !permissions.includes('customers.view_sensitive')
      )
        return forbidden(context);
      const params = AddressGeocodingParamSchema.safeParse(context.req.param());
      const input = AddressGeocodingRejectRequestSchema.safeParse(
        await context.req.json().catch(() => null),
      );
      if (!params.success || !input.success)
        return badRequest(
          context,
          'Revisá el rechazo de ubicación.',
          input.success ? undefined : input.error.issues,
        );
      const request = await requireOperations().rejectAddressGeocoding(
        params.data.customerId,
        params.data.addressId,
        params.data.requestId,
        input.data.reason,
        operationsContext(context),
      );
      return context.json(AddressGeocodingRequestSchema.parse(contractValue(request)));
    },
  );

  app.post('/api/v1/customers/:id/preferences', async (context) => {
    const permissions = context.get('session').permissions;
    if (
      !permissions.includes('customers.edit') ||
      !permissions.includes('customers.view_sensitive')
    )
      return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    const input = CustomerPreferenceCreateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá la preferencia.',
        input.success ? undefined : input.error.issues,
      );
    const preference = await requireOperations().addCustomerPreference(
      params.data.id,
      input.data,
      operationsContext(context),
    );
    return context.json(CustomerPreferenceSchema.parse(contractValue(preference)), 201);
  });

  app.patch('/api/v1/customers/:customerId/preferences/:relationId', async (context) => {
    const permissions = context.get('session').permissions;
    if (
      !permissions.includes('customers.edit') ||
      !permissions.includes('customers.view_sensitive')
    )
      return forbidden(context);
    const params = CustomerRelationParamSchema.safeParse(context.req.param());
    const input = CustomerPreferenceUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá los cambios de la preferencia.',
        input.success ? undefined : input.error.issues,
      );
    const preference = await requireOperations().updateCustomerPreference(
      params.data.customerId,
      params.data.relationId,
      input.data,
      operationsContext(context),
    );
    return context.json(CustomerPreferenceSchema.parse(contractValue(preference)));
  });

  app.post('/api/v1/customers/:id/restrictions', async (context) => {
    const permissions = context.get('session').permissions;
    if (
      !permissions.includes('customers.restrict') ||
      !permissions.includes('customers.view_sensitive')
    )
      return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    const input = CustomerRestrictionCreateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá la restricción.',
        input.success ? undefined : input.error.issues,
      );
    const restriction = await requireOperations().addCustomerRestriction(
      params.data.id,
      input.data,
      operationsContext(context),
    );
    return context.json(CustomerRestrictionSchema.parse(contractValue(restriction)), 201);
  });

  app.patch('/api/v1/customers/:customerId/restrictions/:relationId', async (context) => {
    const permissions = context.get('session').permissions;
    if (
      !permissions.includes('customers.restrict') ||
      !permissions.includes('customers.view_sensitive')
    )
      return forbidden(context);
    const params = CustomerRelationParamSchema.safeParse(context.req.param());
    const input = CustomerRestrictionUpdateRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá los cambios de la restricción.',
        input.success ? undefined : input.error.issues,
      );
    const restriction = await requireOperations().updateCustomerRestriction(
      params.data.customerId,
      params.data.relationId,
      input.data,
      operationsContext(context),
    );
    return context.json(CustomerRestrictionSchema.parse(contractValue(restriction)));
  });

  app.get('/api/v1/message-templates', async (context) => {
    const permissions = context.get('session').permissions;
    if (
      !permissions.includes('messages.templates.use') &&
      !permissions.includes('messages.templates.manage')
    )
      return forbidden(context);
    const items = await requireOperations().listMessageTemplates();
    return context.json(MessageTemplateListResponseSchema.parse({ items: contractValue(items) }));
  });

  app.put('/api/v1/message-templates', async (context) => {
    if (!context.get('session').permissions.includes('messages.templates.manage'))
      return forbidden(context);
    const input = MessageTemplateUpsertRequestSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success)
      return badRequest(context, 'Revisá la plantilla de mensaje.', input.error.issues);
    const template = await requireOperations().upsertMessageTemplate(
      input.data,
      operationsContext(context),
    );
    return context.json(MessageTemplateSchema.parse(contractValue(template)));
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

  app.post('/api/v1/menus/:id/distribute', async (context) => {
    const permissions = context.get('session').permissions;
    if (!permissions.includes('menus.distribute')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success)
      return badRequest(context, 'El menú indicado no es válido.', params.error.issues);
    const input = MenuDistributeRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!input.success) return badRequest(context, 'Revisá la distribución.', input.error.issues);
    // Replacing regional customisations is a separate grant, not a stronger flag on the same one.
    if (input.data.mode === 'REPLACE' && !permissions.includes('menus.distribute_replace'))
      return forbidden(context);
    const results = await requireOperations().distributeMenu(
      params.data.id,
      input.data,
      operationsContext(context),
    );
    return context.json(MenuDistributionResponseSchema.parse({ results: contractValue(results) }));
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
    const query = OrderListQuerySchema.safeParse(context.req.query());
    if (!query.success)
      return badRequest(context, 'Los filtros de pedidos no son válidos.', query.error.issues);
    const page = await requireOperations().listOrders(scoped(context, query.data));
    return context.json(OrderPageResponseSchema.parse(contractValue(page)));
  });

  app.get('/api/v1/orders/export', async (context) => {
    if (!context.get('session').permissions.includes('orders.read')) return forbidden(context);
    const query = OrderListQuerySchema.safeParse(context.req.query());
    if (!query.success)
      return badRequest(context, 'Los filtros de exportación no son válidos.', query.error.issues);
    const filters: Omit<OrderListQuery, 'cursor' | 'limit'> = {
      ...(query.data.customerId ? { customerId: query.data.customerId } : {}),
      ...(query.data.cycleId ? { cycleId: query.data.cycleId } : {}),
      ...(query.data.from ? { from: query.data.from } : {}),
      ...(query.data.search ? { search: query.data.search } : {}),
      ...(query.data.status ? { status: query.data.status } : {}),
      ...(query.data.to ? { to: query.data.to } : {}),
      ...(query.data.zone ? { zone: query.data.zone } : {}),
    };
    const csv = await requireOperations().exportOrdersCsv(
      scoped(context, filters),
      operationsContext(context),
    );
    context.header('cache-control', 'private, no-store');
    context.header('content-disposition', 'attachment; filename="verdeo-pedidos.csv"');
    context.header('content-type', 'text/csv; charset=utf-8');
    return context.body(csv);
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
    const order = await requireOperations().createOrder(
      scoped(context, input.data),
      operationsContext(context),
    );
    return context.json(OrderSchema.parse(contractValue(order)), 201);
  });

  app.get('/api/v1/orders/:id', async (context) => {
    if (!context.get('session').permissions.includes('orders.read')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'El pedido indicado no es válido.');
    return context.json(
      OrderSchema.parse(contractValue(await requireOperations().getOrder(params.data.id))),
    );
  });

  app.patch('/api/v1/orders/:id', async (context) => {
    const session = context.get('session');
    if (!session.permissions.includes('orders.edit')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    const input = OrderUpdateRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!params.success || !input.success)
      return badRequest(
        context,
        'Revisá los cambios del pedido.',
        input.success ? undefined : input.error.issues,
      );
    const order = await requireOperations().updateOrder(
      params.data.id,
      input.data,
      session.permissions.includes('orders.override_cycle_lock'),
      operationsContext(context),
    );
    return context.json(OrderSchema.parse(contractValue(order)));
  });

  app.get('/api/v1/orders/:id/history', async (context) => {
    if (!context.get('session').permissions.includes('orders.read')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'El pedido indicado no es válido.');
    const items = await requireOperations().orderHistory(params.data.id);
    return context.json(OrderStatusHistoryResponseSchema.parse({ items: contractValue(items) }));
  });

  app.get('/api/v1/orders/:id/revisions', async (context) => {
    if (!context.get('session').permissions.includes('orders.read')) return forbidden(context);
    const params = IdParamSchema.safeParse(context.req.param());
    if (!params.success) return badRequest(context, 'El pedido indicado no es válido.');
    const items = await requireOperations().orderRevisionHistory(params.data.id);
    return context.json(OrderRevisionListResponseSchema.parse({ items: contractValue(items) }));
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
      session.permissions.includes('orders.override_cycle_lock'),
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
    const summary = await requireOperations().kitchenSummary(
      params.data.cycleId,
      context.get('scope')?.operatingSiteId ?? null,
    );
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
    if (
      error.name === 'OperationsNotFoundError' ||
      error.name === 'OperatingSiteNotFoundError' ||
      error.name === 'GeographicZoneNotFoundError'
    ) {
      const code: ApiErrorCode = 'NOT_FOUND';
      return context.json(
        { error: { code, message: error.message, requestId: context.get('requestId') } },
        statusForCode(code),
      );
    }
    if (
      error.name === 'OperationsConflictError' ||
      error.name === 'GeographyConflictError' ||
      error.name === 'OrderRuleError' ||
      error.name === 'CustomerRuleError' ||
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
