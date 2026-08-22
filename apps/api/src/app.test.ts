import { describe, expect, it, vi } from 'vitest';

import {
  HealthResponseSchema,
  MenuListResponseSchema,
  LoginResponseSchema,
  MeResponseSchema,
  SessionListResponseSchema,
  UserListResponseSchema,
} from '@verdeo/contracts';
import { createLogger } from '@verdeo/observability';

import { createApp } from './app.js';

const emptySessions = {
  authenticate: () => Promise.resolve(null),
  listForUser: () => Promise.resolve([]),
  revoke: () => Promise.resolve(),
  revokeOwned: () => Promise.resolve(false),
};
const emptyUsers = {
  findById: (id: string) =>
    Promise.resolve({
      displayName: 'Santiago',
      id,
    }),
  list: () => Promise.resolve({ items: [], nextCursor: null }),
};
const emptyCredentials = { login: () => Promise.resolve(null) };
// Scoped endpoints resolve the operating scope before reaching operations, so every app that
// exercises customers/orders/production must wire a geography engine.
const singleSiteGeography = {
  createSite: vi.fn(),
  createZone: vi.fn(),
  listSites: vi.fn(() => Promise.resolve([])),
  listActiveZones: vi.fn(() => Promise.resolve([])),
  listZones: vi.fn(() => Promise.resolve([])),
  resolveScope: vi.fn(() =>
    Promise.resolve({
      canSelectGlobal: true,
      defaultSiteId: '90000000-0000-4000-8000-000000000001',
      sites: [{ id: '90000000-0000-4000-8000-000000000001' }],
    }),
  ),
  updateSite: vi.fn(),
  updateZone: vi.fn(),
};
const customerOperationsStubs = {
  addCustomerAddress: vi.fn(),
  addCustomerIdentity: vi.fn(),
  addCustomerPreference: vi.fn(),
  addCustomerRestriction: vi.fn(),
  confirmAddressGeocoding: vi.fn(),
  exportOrdersCsv: vi.fn(),
  getAddressGeocodingRequest: vi.fn(),
  getCustomer: vi.fn(),
  getOrder: vi.fn(),
  listMessageTemplates: vi.fn(),
  orderHistory: vi.fn(),
  orderRevisionHistory: vi.fn(),
  rejectAddressGeocoding: vi.fn(),
  requestAddressGeocoding: vi.fn(),
  updateCustomer: vi.fn(),
  updateCustomerAddress: vi.fn(),
  updateCustomerIdentity: vi.fn(),
  updateCustomerPreference: vi.fn(),
  updateCustomerRestriction: vi.fn(),
  updateOrder: vi.fn(),
  upsertMessageTemplate: vi.fn(),
};
const sampleMenu = {
  cycle: {
    alias: 'Semana 34',
    closeAt: new Date('2026-08-26T22:00:00.000Z'),
    id: '10000000-0000-4000-8000-000000000001',
    openAt: new Date('2026-08-20T12:00:00.000Z'),
    partialKitchenCutoffAt: new Date('2026-08-25T23:00:00.000Z'),
    status: 'OPEN',
  },
  id: '20000000-0000-4000-8000-000000000001',
  offerings: [
    {
      composable: false,
      currency: 'ARS',
      dishes: ['A', 'B', 'C', 'D', 'E'],
      familyName: 'Real',
      id: '30000000-0000-4000-8000-000000000001',
      mealsPerUnit: 5,
      priceOverridden: false,
      sizeName: '250',
      unitPriceMinor: 25_000,
      variantName: '250',
    },
  ],
  publishedAt: new Date('2026-08-20T12:00:00.000Z'),
  revision: 1,
  status: 'PUBLISHED',
};

const app = createApp({
  appOrigin: 'http://localhost:5173',
  cookieSameSite: 'Lax',
  credentials: emptyCredentials,
  logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
  sessions: emptySessions,
  secureCookies: false,
  users: emptyUsers,
  version: 'test',
});

describe('API foundation', () => {
  it('exposes a contract-valid health endpoint', async () => {
    const response = await app.request('/health');
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(HealthResponseSchema.parse(body).version).toBe('test');
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });

  it('does not expose /me without authentication', async () => {
    const response = await app.request('/api/v1/me');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
    });
  });

  it('creates a secure cookie after a valid credential login', async () => {
    const login = vi.fn(() =>
      Promise.resolve({
        expiresAt: new Date('2026-08-17T20:00:00.000Z'),
        sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
        token: 'opaque-session-token-that-is-never-returned-to-the-browser-body',
      }),
    );
    const loginApp = createApp({
      appOrigin: 'https://verdeo-web.example',
      cookieSameSite: 'None',
      credentials: { login },
      logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
      sessions: emptySessions,
      secureCookies: true,
      users: emptyUsers,
      version: 'test',
    });

    const response = await loginApp.request('/api/v1/auth/login', {
      body: JSON.stringify({
        email: 'santi.creide@gmail.com',
        password: 'a-strong-temporary-password',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(LoginResponseSchema.parse(body).sessionId).toBe('4c35a5ce-5c11-47b3-b31a-41a7d2983354');
    expect(JSON.stringify(body)).not.toContain('opaque-session-token');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=None');
    expect(response.headers.get('set-cookie')).toContain('Secure');
  });

  it('returns a generic authentication error for invalid credentials', async () => {
    const response = await app.request('/api/v1/auth/login', {
      body: JSON.stringify({
        email: 'santi.creide@gmail.com',
        password: 'a-wrong-password-with-enough-length',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
    });
  });

  it('exchanges a verified OAuth identity for the existing Verdeo session cookie', async () => {
    const exchange = vi.fn(() =>
      Promise.resolve({
        expiresAt: new Date('2026-08-17T20:00:00.000Z'),
        sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
        token: 'opaque-oauth-session-token-that-is-never-returned-in-the-body',
      }),
    );
    const oauthApp = createApp({
      appOrigin: 'https://verdeo-web.example',
      cookieSameSite: 'None',
      credentials: emptyCredentials,
      logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
      oauth: { exchange },
      sessions: emptySessions,
      secureCookies: true,
      users: emptyUsers,
      version: 'test',
    });

    const response = await oauthApp.request('/api/v1/auth/oauth/exchange', {
      body: JSON.stringify({ accessToken: 'a-supabase-access-token-long-enough' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(LoginResponseSchema.parse(body).sessionId).toBe('4c35a5ce-5c11-47b3-b31a-41a7d2983354');
    expect(exchange).toHaveBeenCalledWith(
      'a-supabase-access-token-long-enough',
      expect.any(String),
    );
    expect(JSON.stringify(body)).not.toContain('opaque-oauth-session-token');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=None');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('does not reveal whether an OAuth email is provisioned', async () => {
    const oauthApp = createApp({
      appOrigin: 'http://localhost:5173',
      cookieSameSite: 'Lax',
      credentials: emptyCredentials,
      logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
      oauth: { exchange: () => Promise.resolve(null) },
      sessions: emptySessions,
      secureCookies: false,
      users: emptyUsers,
      version: 'test',
    });

    const response = await oauthApp.request('/api/v1/auth/oauth/exchange', {
      body: JSON.stringify({ accessToken: 'an-unknown-access-token-long-enough' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Esta cuenta no tiene acceso habilitado en Verdeo.',
      },
    });
  });

  it('reports OAuth as unavailable when the API adapter is not configured', async () => {
    const response = await app.request('/api/v1/auth/oauth/exchange', {
      body: JSON.stringify({ accessToken: 'a-supabase-access-token-long-enough' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
  });

  it('returns the resolved principal for an authenticated session', async () => {
    const authenticatedApp = createApp({
      appOrigin: 'http://localhost:5173',
      cookieSameSite: 'Lax',
      credentials: emptyCredentials,
      logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
      sessions: {
        ...emptySessions,
        authenticate: () =>
          Promise.resolve({
            expiresAt: new Date('2026-08-18T12:00:00.000Z'),
            permissions: ['users.read', 'orders.read'],
            sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
            userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
          }),
      },
      secureCookies: false,
      users: emptyUsers,
      version: 'test',
    });
    const response = await authenticatedApp.request('/api/v1/me', {
      headers: { cookie: 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars' },
    });
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(MeResponseSchema.parse(body)).toEqual({
      permissions: ['orders.read', 'users.read'],
      session: {
        expiresAt: '2026-08-18T12:00:00.000Z',
        id: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
      },
      user: {
        displayName: 'Santiago',
        id: '55276601-ec66-4f63-9f2f-edf73904ede0',
      },
    });
  });

  it('revokes a valid session and clears its cookie on logout', async () => {
    const revoke = vi.fn(() => Promise.resolve());
    const logoutApp = createApp({
      appOrigin: 'http://localhost:5173',
      cookieSameSite: 'Lax',
      credentials: emptyCredentials,
      logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
      sessions: {
        ...emptySessions,
        authenticate: () =>
          Promise.resolve({
            expiresAt: new Date('2026-08-18T12:00:00.000Z'),
            permissions: [],
            sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
            userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
          }),
        revoke,
      },
      secureCookies: true,
      users: emptyUsers,
      version: 'test',
    });

    const response = await logoutApp.request('/api/v1/auth/logout', {
      headers: { cookie: 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars' },
      method: 'POST',
    });

    expect(response.status).toBe(204);
    expect(revoke).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354' }),
      expect.any(String),
    );
    expect(response.headers.get('set-cookie')).toContain('verdeo_session=;');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('Secure');
  });

  it('lists only safe session metadata for the authenticated user', async () => {
    const sessionsApp = createApp({
      appOrigin: 'http://localhost:5173',
      cookieSameSite: 'Lax',
      credentials: emptyCredentials,
      logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
      sessions: {
        ...emptySessions,
        authenticate: () =>
          Promise.resolve({
            expiresAt: new Date('2026-08-18T12:00:00.000Z'),
            permissions: [],
            sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
            userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
          }),
        listForUser: () =>
          Promise.resolve([
            {
              createdAt: new Date('2026-08-17T10:00:00.000Z'),
              expiresAt: new Date('2026-08-18T12:00:00.000Z'),
              id: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
              lastSeenAt: new Date('2026-08-17T12:00:00.000Z'),
              revokedAt: null,
            },
          ]),
      },
      secureCookies: false,
      users: emptyUsers,
      version: 'test',
    });
    const response = await sessionsApp.request('/api/v1/sessions', {
      headers: { cookie: 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars' },
    });
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(SessionListResponseSchema.parse(body).items[0]).toMatchObject({
      current: true,
      id: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
      revokedAt: null,
    });
    expect(JSON.stringify(body)).not.toContain('token');
  });

  it('does not reveal whether an unowned session exists', async () => {
    const revokeOwned = vi.fn(() => Promise.resolve(false));
    const sessionsApp = createApp({
      appOrigin: 'http://localhost:5173',
      cookieSameSite: 'Lax',
      credentials: emptyCredentials,
      logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
      sessions: {
        ...emptySessions,
        authenticate: () =>
          Promise.resolve({
            expiresAt: new Date('2026-08-18T12:00:00.000Z'),
            permissions: [],
            sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
            userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
          }),
        revokeOwned,
      },
      secureCookies: false,
      users: emptyUsers,
      version: 'test',
    });

    const response = await sessionsApp.request(
      '/api/v1/sessions/97ecbe34-a5a2-49d7-ac45-9a816f2bc47c',
      {
        headers: { cookie: 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars' },
        method: 'DELETE',
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(revokeOwned).toHaveBeenCalledWith(
      expect.objectContaining({ userId: '55276601-ec66-4f63-9f2f-edf73904ede0' }),
      '97ecbe34-a5a2-49d7-ac45-9a816f2bc47c',
      expect.any(String),
    );
  });

  it('denies the user directory without users.read', async () => {
    const list = vi.fn(() => Promise.resolve({ items: [], nextCursor: null }));
    const usersApp = createApp({
      appOrigin: 'http://localhost:5173',
      cookieSameSite: 'Lax',
      credentials: emptyCredentials,
      logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
      sessions: {
        ...emptySessions,
        authenticate: () =>
          Promise.resolve({
            expiresAt: new Date('2026-08-18T12:00:00.000Z'),
            permissions: [],
            sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
            userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
          }),
      },
      secureCookies: false,
      users: { ...emptyUsers, list },
      version: 'test',
    });

    const response = await usersApp.request('/api/v1/users', {
      headers: { cookie: 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars' },
    });

    expect(response.status).toBe(403);
    expect(list).not.toHaveBeenCalled();
  });

  it('returns a paginated, PII-minimized user directory with users.read', async () => {
    const usersApp = createApp({
      appOrigin: 'http://localhost:5173',
      cookieSameSite: 'Lax',
      credentials: emptyCredentials,
      logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
      sessions: {
        ...emptySessions,
        authenticate: () =>
          Promise.resolve({
            expiresAt: new Date('2026-08-18T12:00:00.000Z'),
            permissions: ['users.read'],
            sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
            userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
          }),
      },
      secureCookies: false,
      users: {
        ...emptyUsers,
        list: () =>
          Promise.resolve({
            items: [
              {
                createdAt: new Date('2026-08-17T10:00:00.000Z'),
                displayName: 'Operador',
                id: '00000000-0000-4000-8000-000000000001',
                status: 'active',
              },
            ],
            nextCursor: null,
          }),
      },
      version: 'test',
    });
    const response = await usersApp.request('/api/v1/users?limit=10', {
      headers: { cookie: 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars' },
    });
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(UserListResponseSchema.parse(body).items[0]).toMatchObject({
      displayName: 'Operador',
      status: 'active',
    });
    expect(JSON.stringify(body)).not.toContain('email');
  });

  it('exposes the published menu without requiring authentication', async () => {
    const menuApp = createApp({
      appOrigin: 'http://localhost:5173',
      cookieSameSite: 'Lax',
      credentials: emptyCredentials,
      logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
      geography: singleSiteGeography,
      operations: {
        ...customerOperationsStubs,
        createCustomer: vi.fn(),
        createMenu: vi.fn(),
        createOrder: vi.fn(),
        createPublicOrder: vi.fn(),
        currentPublishedMenu: () => Promise.resolve(sampleMenu),
        kitchenSummary: vi.fn(),
        listCustomers: vi.fn(),
        listMenus: vi.fn(),
        listOrders: vi.fn(),
        publishMenu: vi.fn(),
        transitionOrder: vi.fn(),
      },
      sessions: emptySessions,
      secureCookies: false,
      users: emptyUsers,
      version: 'test',
    });

    const response = await menuApp.request('/api/v1/public/menu/current');
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(MenuListResponseSchema.parse({ items: [body] }).items[0]?.offerings).toHaveLength(1);
  });

  it('rejects malformed public orders before invoking the engine', async () => {
    const createPublicOrder = vi.fn();
    const orderApp = createApp({
      appOrigin: 'http://localhost:5173',
      cookieSameSite: 'Lax',
      credentials: emptyCredentials,
      logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
      geography: singleSiteGeography,
      operations: {
        ...customerOperationsStubs,
        createCustomer: vi.fn(),
        createMenu: vi.fn(),
        createOrder: vi.fn(),
        createPublicOrder,
        currentPublishedMenu: vi.fn(),
        kitchenSummary: vi.fn(),
        listCustomers: vi.fn(),
        listMenus: vi.fn(),
        listOrders: vi.fn(),
        publishMenu: vi.fn(),
        transitionOrder: vi.fn(),
      },
      sessions: emptySessions,
      secureCookies: false,
      users: emptyUsers,
      version: 'test',
    });

    const response = await orderApp.request('/api/v1/public/orders', {
      body: JSON.stringify({ customer: { displayName: '' }, items: [] }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    expect(response.status).toBe(400);
    expect(createPublicOrder).not.toHaveBeenCalled();
  });

  it('checks dynamic permissions before listing orders', async () => {
    const listOrders = vi.fn(() => Promise.resolve([]));
    const ordersApp = createApp({
      appOrigin: 'http://localhost:5173',
      cookieSameSite: 'Lax',
      credentials: emptyCredentials,
      logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
      geography: singleSiteGeography,
      operations: {
        ...customerOperationsStubs,
        createCustomer: vi.fn(),
        createMenu: vi.fn(),
        createOrder: vi.fn(),
        createPublicOrder: vi.fn(),
        currentPublishedMenu: vi.fn(),
        kitchenSummary: vi.fn(),
        listCustomers: vi.fn(),
        listMenus: vi.fn(),
        listOrders,
        publishMenu: vi.fn(),
        transitionOrder: vi.fn(),
      },
      sessions: {
        ...emptySessions,
        authenticate: () =>
          Promise.resolve({
            expiresAt: new Date('2026-08-18T12:00:00.000Z'),
            permissions: [],
            sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
            userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
          }),
      },
      secureCookies: false,
      users: emptyUsers,
      version: 'test',
    });

    const response = await ordersApp.request('/api/v1/orders', {
      headers: { cookie: 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars' },
    });

    expect(response.status).toBe(403);
    expect(listOrders).not.toHaveBeenCalled();
  });

  it('validates and forwards a complete CRM customer payload', async () => {
    const createCustomer = vi.fn(() =>
      Promise.resolve({
        createdAt: new Date('2026-08-19T10:00:00.000Z'),
        displayName: 'María Pérez',
        email: 'maria@example.com',
        id: '70000000-0000-4000-8000-000000000001',
        phone: null,
        status: 'active',
        whatsapp: '+5491155551212',
      }),
    );
    const crmApp = createApp({
      appOrigin: 'http://localhost:5173',
      cookieSameSite: 'Lax',
      credentials: emptyCredentials,
      logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
      geography: singleSiteGeography,
      operations: {
        ...customerOperationsStubs,
        createCustomer,
        createMenu: vi.fn(),
        createOrder: vi.fn(),
        createPublicOrder: vi.fn(),
        currentPublishedMenu: vi.fn(),
        kitchenSummary: vi.fn(),
        listCustomers: vi.fn(),
        listMenus: vi.fn(),
        listOrders: vi.fn(),
        publishMenu: vi.fn(),
        transitionOrder: vi.fn(),
      },
      sessions: {
        ...emptySessions,
        authenticate: () =>
          Promise.resolve({
            expiresAt: new Date('2026-08-20T12:00:00.000Z'),
            permissions: ['customers.create'],
            sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
            userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
          }),
      },
      secureCookies: false,
      users: emptyUsers,
      version: 'test',
    });

    const response = await crmApp.request('/api/v1/customers', {
      body: JSON.stringify({
        addresses: [
          {
            geographicZoneId: '90000000-0000-4000-8000-0000000000aa',
            label: 'Casa',
            locationUrl: 'https://maps.google.com/?q=-34.6037,-58.3816',
            primary: true,
            writtenAddress: 'Av. Siempre Viva 742',
          },
        ],
        displayName: 'María Pérez',
        firstName: 'María',
        identities: [
          {
            primary: true,
            type: 'whatsapp',
            value: '+54 9 11 5555-1212',
          },
        ],
        lastName: 'Pérez',
      }),
      headers: {
        'content-type': 'application/json',
        cookie: 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars',
      },
      method: 'POST',
    });

    expect(response.status).toBe(201);
    expect(createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        addresses: [expect.objectContaining({ geocodingStatus: 'NEEDS_LOCATION' })],
        identities: [expect.objectContaining({ source: 'manual', verified: false })],
      }),
      expect.objectContaining({ actorUserId: '55276601-ec66-4f63-9f2f-edf73904ede0' }),
    );
  });

  it('does not let edit permission bypass sensitive CRM field protection', async () => {
    const addCustomerIdentity = vi.fn();
    const crmApp = createApp({
      appOrigin: 'http://localhost:5173',
      cookieSameSite: 'Lax',
      credentials: emptyCredentials,
      logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
      geography: singleSiteGeography,
      operations: {
        ...customerOperationsStubs,
        addCustomerIdentity,
        createCustomer: vi.fn(),
        createMenu: vi.fn(),
        createOrder: vi.fn(),
        createPublicOrder: vi.fn(),
        currentPublishedMenu: vi.fn(),
        kitchenSummary: vi.fn(),
        listCustomers: vi.fn(),
        listMenus: vi.fn(),
        listOrders: vi.fn(),
        publishMenu: vi.fn(),
        transitionOrder: vi.fn(),
      },
      sessions: {
        ...emptySessions,
        authenticate: () =>
          Promise.resolve({
            expiresAt: new Date('2026-08-20T12:00:00.000Z'),
            permissions: ['customers.edit'],
            sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
            userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
          }),
      },
      secureCookies: false,
      users: emptyUsers,
      version: 'test',
    });

    const response = await crmApp.request(
      '/api/v1/customers/70000000-0000-4000-8000-000000000001/identities',
      {
        body: JSON.stringify({ type: 'whatsapp', value: '+5491155551212' }),
        headers: {
          'content-type': 'application/json',
          cookie: 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars',
        },
        method: 'POST',
      },
    );

    expect(response.status).toBe(403);
    expect(addCustomerIdentity).not.toHaveBeenCalled();
  });

  it('requires sensitive CRM access and forwards an idempotent geocoding request', async () => {
    const requestAddressGeocoding = vi.fn(() =>
      Promise.resolve({
        candidates: [],
        createdAt: new Date('2026-08-20T12:00:00.000Z'),
        errorCode: null,
        id: '72000000-0000-4000-8000-000000000001',
        providerKey: 'location-link',
        selectedCandidateId: null,
        status: 'NO_MATCH',
        updatedAt: new Date('2026-08-20T12:00:00.000Z'),
      }),
    );
    const session = {
      expiresAt: new Date('2026-08-20T12:00:00.000Z'),
      permissions: ['customers.edit'],
      sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
      userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
    };
    const createGeocodingApp = (permissions: string[]) =>
      createApp({
        appOrigin: 'http://localhost:5173',
        cookieSameSite: 'Lax',
        credentials: emptyCredentials,
        logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
        geography: singleSiteGeography,
        operations: {
          ...customerOperationsStubs,
          createCustomer: vi.fn(),
          createMenu: vi.fn(),
          createOrder: vi.fn(),
          createPublicOrder: vi.fn(),
          currentPublishedMenu: vi.fn(),
          kitchenSummary: vi.fn(),
          listCustomers: vi.fn(),
          listMenus: vi.fn(),
          listOrders: vi.fn(),
          publishMenu: vi.fn(),
          requestAddressGeocoding,
          transitionOrder: vi.fn(),
        },
        sessions: {
          ...emptySessions,
          authenticate: () => Promise.resolve({ ...session, permissions }),
        },
        secureCookies: false,
        users: emptyUsers,
        version: 'test',
      });
    const path =
      '/api/v1/customers/70000000-0000-4000-8000-000000000001/addresses/71000000-0000-4000-8000-000000000001/geocoding';
    const request = {
      body: JSON.stringify({ idempotencyKey: 'customer-7-address-71-attempt-1' }),
      headers: {
        'content-type': 'application/json',
        cookie: 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars',
      },
      method: 'POST',
    };

    expect((await createGeocodingApp(['customers.edit']).request(path, request)).status).toBe(403);
    const response = await createGeocodingApp([
      'customers.edit',
      'customers.view_sensitive',
    ]).request(path, request);

    expect(response.status).toBe(201);
    expect(requestAddressGeocoding).toHaveBeenCalledWith(
      '70000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      { idempotencyKey: 'customer-7-address-71-attempt-1' },
      expect.objectContaining({ actorUserId: session.userId }),
    );
  });

  it('forwards validated order filters and exports CSV with safe headers', async () => {
    const listOrders = vi.fn(() => Promise.resolve({ items: [], nextCursor: null }));
    const exportOrdersCsv = vi.fn(() => Promise.resolve('\uFEFF"numero_pedido"\r\n'));
    const operationsApp = createApp({
      appOrigin: 'http://localhost:5173',
      cookieSameSite: 'Lax',
      credentials: emptyCredentials,
      logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
      geography: singleSiteGeography,
      operations: {
        ...customerOperationsStubs,
        createCustomer: vi.fn(),
        createMenu: vi.fn(),
        createOrder: vi.fn(),
        createPublicOrder: vi.fn(),
        currentPublishedMenu: vi.fn(),
        exportOrdersCsv,
        kitchenSummary: vi.fn(),
        listCustomers: vi.fn(),
        listMenus: vi.fn(),
        listOrders,
        publishMenu: vi.fn(),
        transitionOrder: vi.fn(),
      },
      sessions: {
        ...emptySessions,
        authenticate: () =>
          Promise.resolve({
            expiresAt: new Date('2026-08-20T12:00:00.000Z'),
            permissions: ['orders.read'],
            sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
            userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
          }),
      },
      secureCookies: false,
      users: emptyUsers,
      version: 'test',
    });
    const cookie = 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars';

    const listResponse = await operationsApp.request(
      '/api/v1/orders?status=CONFIRMED&limit=10&zone=Centro',
      { headers: { cookie } },
    );
    expect(listResponse.status).toBe(200);
    expect(listOrders).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, status: 'CONFIRMED', zone: 'Centro' }),
    );

    const exportResponse = await operationsApp.request(
      '/api/v1/orders/export?status=CONFIRMED&zone=Centro',
      { headers: { cookie } },
    );
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers.get('content-type')).toContain('text/csv');
    expect(exportResponse.headers.get('content-disposition')).toContain('verdeo-pedidos.csv');
    expect(exportOrdersCsv).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CONFIRMED', zone: 'Centro' }),
      expect.objectContaining({ actorUserId: '55276601-ec66-4f63-9f2f-edf73904ede0' }),
    );
  });
});
