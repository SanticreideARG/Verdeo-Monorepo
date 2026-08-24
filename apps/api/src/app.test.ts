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
  findProfileById: (id: string) =>
    Promise.resolve({ avatarUrl: null, displayName: 'Santiago', email: null, id }),
  list: () => Promise.resolve({ items: [], nextCursor: null }),
  updateProfile: (id: string) =>
    Promise.resolve({ avatarUrl: null, displayName: 'Santiago', email: null, id }),
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
  generateProductionSnapshot: vi.fn(),
  getAddressGeocodingRequest: vi.fn(),
  getCustomer: vi.fn(),
  getOrder: vi.fn(),
  listMenuCatalogSettings: vi.fn(),
  getSurplusConfig: vi.fn(),
  listMessageTemplates: vi.fn(),
  listProductionActuals: vi.fn(),
  listProductionSnapshots: vi.fn(),
  orderHistory: vi.fn(),
  orderRevisionHistory: vi.fn(),
  rejectAddressGeocoding: vi.fn(),
  reportProduction: vi.fn(),
  requestAddressGeocoding: vi.fn(),
  setIntuitivoEnabled: vi.fn(),
  setSurplusConfig: vi.fn(),
  surplusReport: vi.fn(),
  trackPublicOrder: vi.fn(),
  updateCustomer: vi.fn(),
  updateCustomerAddress: vi.fn(),
  updateCustomerIdentity: vi.fn(),
  updateCustomerPreference: vi.fn(),
  updateCustomerRestriction: vi.fn(),
  updateOrder: vi.fn(),
  upsertMessageTemplate: vi.fn(),
  writeOffSurplus: vi.fn(),
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
  operatingSiteId: null,
  operatingSiteName: null,
  publishedAt: new Date('2026-08-20T12:00:00.000Z'),
  revision: 1,
  sourceMenuId: null,
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
        avatarUrl: null,
        displayName: 'Santiago',
        email: null,
        id: '55276601-ec66-4f63-9f2f-edf73904ede0',
      },
    });
  });

  it('updates the display name for the authenticated user only, no permission required', async () => {
    const updateProfile = vi.fn((id: string, input: { displayName: string }) =>
      Promise.resolve({ avatarUrl: null, displayName: input.displayName, email: null, id }),
    );
    const profileApp = createApp({
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
      users: { ...emptyUsers, updateProfile },
      version: 'test',
    });

    const response = await profileApp.request('/api/v1/me', {
      body: JSON.stringify({ displayName: 'Santi' }),
      headers: {
        cookie: 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars',
        'content-type': 'application/json',
      },
      method: 'PATCH',
    });
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ displayName: 'Santi' });
    expect(updateProfile).toHaveBeenCalledWith('55276601-ec66-4f63-9f2f-edf73904ede0', {
      displayName: 'Santi',
    });
  });

  it('rejects a blank display name before invoking the engine', async () => {
    const updateProfile = vi.fn();
    const profileApp = createApp({
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
      users: { ...emptyUsers, updateProfile },
      version: 'test',
    });

    const response = await profileApp.request('/api/v1/me', {
      body: JSON.stringify({ displayName: '' }),
      headers: {
        cookie: 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars',
        'content-type': 'application/json',
      },
      method: 'PATCH',
    });

    expect(response.status).toBe(400);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  function buildAvatarApp(avatarStorage?: {
    upload: (userId: string, bytes: Uint8Array, contentType: string) => Promise<{ url: string }>;
  }) {
    const updateProfile = vi.fn((id: string, input: { avatarUrl?: string }) =>
      Promise.resolve({
        avatarUrl: input.avatarUrl ?? null,
        displayName: 'Santiago',
        email: null,
        id,
      }),
    );
    return {
      app: createApp({
        appOrigin: 'http://localhost:5173',
        ...(avatarStorage ? { avatarStorage: { ...avatarStorage, uploadMedia: vi.fn() } } : {}),
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
        users: { ...emptyUsers, updateProfile },
        version: 'test',
      }),
      updateProfile,
    };
  }

  it('uploads an avatar and persists the returned Blob URL', async () => {
    const upload = vi.fn<
      (userId: string, bytes: Uint8Array, contentType: string) => Promise<{ url: string }>
    >(() => Promise.resolve({ url: 'https://blob.example/avatars/55276601.jpg' }));
    const { app, updateProfile } = buildAvatarApp({ upload });

    const response = await app.request('/api/v1/me/avatar', {
      body: new Uint8Array([1, 2, 3]),
      headers: {
        cookie: 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars',
        'content-type': 'image/jpeg',
      },
      method: 'POST',
    });
    const body = (await response.json()) as { avatarUrl: string | null };

    expect(response.status).toBe(200);
    expect(body.avatarUrl).toBe('https://blob.example/avatars/55276601.jpg');
    expect(upload).toHaveBeenCalledWith(
      '55276601-ec66-4f63-9f2f-edf73904ede0',
      expect.any(Uint8Array),
      'image/jpeg',
    );
    expect(updateProfile).toHaveBeenCalledWith('55276601-ec66-4f63-9f2f-edf73904ede0', {
      avatarUrl: 'https://blob.example/avatars/55276601.jpg',
    });
  });

  it('rejects an unsupported content type before touching storage', async () => {
    const upload = vi.fn<
      (userId: string, bytes: Uint8Array, contentType: string) => Promise<{ url: string }>
    >(() => Promise.resolve({ url: 'unused' }));
    const { app } = buildAvatarApp({ upload });

    const response = await app.request('/api/v1/me/avatar', {
      body: new Uint8Array([1, 2, 3]),
      headers: {
        cookie: 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars',
        'content-type': 'application/pdf',
      },
      method: 'POST',
    });

    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  // Matches requireOperations/requireChat/requireGeography: a "not configured" adapter throws
  // and falls through to the generic 500 handler, not a dedicated 503 path.
  it('fails avatar upload when Blob storage is not configured', async () => {
    const { app } = buildAvatarApp();

    const response = await app.request('/api/v1/me/avatar', {
      body: new Uint8Array([1, 2, 3]),
      headers: {
        cookie: 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars',
        'content-type': 'image/jpeg',
      },
      method: 'POST',
    });

    expect(response.status).toBe(500);
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
                avatarUrl: null,
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
        distributeMenu: vi.fn(),
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
        distributeMenu: vi.fn(),
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

  it('tracks a public order by number and contact', async () => {
    const trackPublicOrder = vi.fn(() =>
      Promise.resolve({
        history: [{ createdAt: new Date('2026-08-20T10:00:00.000Z'), toStatus: 'CONFIRMED' }],
        order: {
          currency: 'ARS',
          deliveryAddress: 'Calle Falsa 123',
          deliveryDate: '2026-08-25',
          items: [{ productName: 'Real', quantityUnits: 1, variantName: 'Grande' }],
          notes: null,
          publicNumber: 'NQN-00001',
          status: 'CONFIRMED',
          totalMinor: 12000,
        },
      }),
    );
    const trackApp = createApp({
      appOrigin: 'http://localhost:5173',
      cookieSameSite: 'Lax',
      credentials: emptyCredentials,
      logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
      geography: singleSiteGeography,
      operations: {
        ...customerOperationsStubs,
        createCustomer: vi.fn(),
        createMenu: vi.fn(),
        distributeMenu: vi.fn(),
        createOrder: vi.fn(),
        createPublicOrder: vi.fn(),
        currentPublishedMenu: vi.fn(),
        kitchenSummary: vi.fn(),
        listCustomers: vi.fn(),
        listMenus: vi.fn(),
        listOrders: vi.fn(),
        publishMenu: vi.fn(),
        trackPublicOrder,
        transitionOrder: vi.fn(),
      },
      sessions: emptySessions,
      secureCookies: false,
      users: emptyUsers,
      version: 'test',
    });

    const response = await trackApp.request('/api/v1/public/orders/track', {
      body: JSON.stringify({ contact: 'cliente@example.com', publicNumber: 'nqn-00001' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(trackPublicOrder).toHaveBeenCalledWith('nqn-00001', 'cliente@example.com');
    expect(body).toMatchObject({ publicNumber: 'NQN-00001', status: 'CONFIRMED' });
  });

  it('returns a generic 404 when the order number or contact does not match', async () => {
    const trackApp = createApp({
      appOrigin: 'http://localhost:5173',
      cookieSameSite: 'Lax',
      credentials: emptyCredentials,
      logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
      geography: singleSiteGeography,
      operations: {
        ...customerOperationsStubs,
        createCustomer: vi.fn(),
        createMenu: vi.fn(),
        distributeMenu: vi.fn(),
        createOrder: vi.fn(),
        createPublicOrder: vi.fn(),
        currentPublishedMenu: vi.fn(),
        kitchenSummary: vi.fn(),
        listCustomers: vi.fn(),
        listMenus: vi.fn(),
        listOrders: vi.fn(),
        publishMenu: vi.fn(),
        trackPublicOrder: () => Promise.resolve(null),
        transitionOrder: vi.fn(),
      },
      sessions: emptySessions,
      secureCookies: false,
      users: emptyUsers,
      version: 'test',
    });

    const response = await trackApp.request('/api/v1/public/orders/track', {
      body: JSON.stringify({ contact: 'nadie@example.com', publicNumber: 'XXX-99999' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    expect(response.status).toBe(404);
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
        distributeMenu: vi.fn(),
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
        distributeMenu: vi.fn(),
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
        distributeMenu: vi.fn(),
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
          distributeMenu: vi.fn(),
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
        distributeMenu: vi.fn(),
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

  describe('production and surplus', () => {
    const CYCLE = '10000000-0000-4000-8000-000000000099';

    function buildApp(operationsOverrides: Record<string, unknown>, permissions: string[]) {
      return createApp({
        appOrigin: 'http://localhost:5173',
        cookieSameSite: 'Lax',
        credentials: emptyCredentials,
        logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
        geography: singleSiteGeography,
        operations: {
          ...customerOperationsStubs,
          createCustomer: vi.fn(),
          createMenu: vi.fn(),
          distributeMenu: vi.fn(),
          createOrder: vi.fn(),
          createPublicOrder: vi.fn(),
          currentPublishedMenu: vi.fn(),
          kitchenSummary: vi.fn(),
          listCustomers: vi.fn(),
          listMenus: vi.fn(),
          listOrders: vi.fn(),
          publishMenu: vi.fn(),
          transitionOrder: vi.fn(),
          ...operationsOverrides,
        },
        sessions: {
          ...emptySessions,
          authenticate: () =>
            Promise.resolve({
              expiresAt: new Date('2026-08-20T12:00:00.000Z'),
              permissions,
              sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
              userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
            }),
        },
        secureCookies: false,
        users: emptyUsers,
        version: 'test',
      });
    }

    const cookie = 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars';

    it('reports production with production.report and denies without it', async () => {
      const reportProduction = vi.fn(() => Promise.resolve([]));
      const app = buildApp({ reportProduction }, ['production.report']);

      const response = await app.request(`/api/v1/production/${CYCLE}/actuals`, {
        body: JSON.stringify({
          entries: [{ familyName: 'Keto', quantityUnits: 5, variantName: '250' }],
        }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(response.status).toBe(200);
      expect(reportProduction).toHaveBeenCalledWith(
        CYCLE,
        [{ familyName: 'Keto', quantityUnits: 5, variantName: '250' }],
        expect.objectContaining({ actorUserId: '55276601-ec66-4f63-9f2f-edf73904ede0' }),
      );

      const denied = buildApp({ reportProduction: vi.fn() }, ['production.read']);
      const deniedResponse = await denied.request(`/api/v1/production/${CYCLE}/actuals`, {
        body: JSON.stringify({
          entries: [{ familyName: 'Keto', quantityUnits: 5, variantName: '250' }],
        }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(deniedResponse.status).toBe(403);
    });

    it('generates a snapshot with production.generate and denies without it', async () => {
      const generateProductionSnapshot = vi.fn(() =>
        Promise.resolve({
          generatedAt: new Date('2026-08-25T20:00:00.000Z'),
          generatedByUserId: null,
          id: '20000000-0000-4000-8000-000000000001',
          kind: 'partial',
          payload: {
            actuals: [],
            base: [],
            custom: [],
            cycle: { alias: 'Semana 34', id: CYCLE },
            delta: null,
            totalUnits: 0,
          },
          salesCycleId: CYCLE,
        }),
      );
      const app = buildApp({ generateProductionSnapshot }, ['production.generate']);

      const response = await app.request(`/api/v1/production/${CYCLE}/snapshots`, {
        body: JSON.stringify({ kind: 'partial' }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(response.status).toBe(201);

      const denied = buildApp({ generateProductionSnapshot: vi.fn() }, ['production.read']);
      const deniedResponse = await denied.request(`/api/v1/production/${CYCLE}/snapshots`, {
        body: JSON.stringify({ kind: 'partial' }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(deniedResponse.status).toBe(403);
    });

    it('reads the surplus report with production.read', async () => {
      const surplusReport = vi.fn(() =>
        Promise.resolve({
          coefficientPercent: 10,
          cycle: { alias: 'Semana 34', id: CYCLE },
          generatedAt: new Date('2026-08-25T20:00:00.000Z'),
          items: [
            {
              bajaMerma: 0,
              demandaConfirmada: 4,
              disponible: 2,
              excedenteEfectivo: 2,
              familyName: 'Keto',
              produccionPlanificada: 5,
              produccionReal: 6,
              variantName: '250',
              vendidoOportunidad: 0,
            },
          ],
        }),
      );
      const app = buildApp({ surplusReport }, ['production.read']);

      const response = await app.request(`/api/v1/production/${CYCLE}/surplus`, {
        headers: { cookie },
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { items: { disponible: number }[] };
      expect(body.items[0]?.disponible).toBe(2);
    });

    it('writes off surplus with production.adjust_surplus and denies without it', async () => {
      const writeOffSurplus = vi.fn(() => Promise.resolve([]));
      const app = buildApp({ writeOffSurplus }, ['production.adjust_surplus']);

      const response = await app.request(`/api/v1/production/${CYCLE}/surplus/writeoffs`, {
        body: JSON.stringify({
          entries: [
            { familyName: 'Keto', quantityUnits: 1, reason: 'Vencimiento', variantName: '250' },
          ],
        }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(response.status).toBe(200);

      const denied = buildApp({ writeOffSurplus: vi.fn() }, ['production.read']);
      const deniedResponse = await denied.request(`/api/v1/production/${CYCLE}/surplus/writeoffs`, {
        body: JSON.stringify({
          entries: [
            { familyName: 'Keto', quantityUnits: 1, reason: 'Vencimiento', variantName: '250' },
          ],
        }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(deniedResponse.status).toBe(403);
    });

    it('updates the surplus coefficient with production.adjust_surplus and denies without it', async () => {
      const setSurplusConfig = vi.fn(() => Promise.resolve({ coefficientPercent: '15.00' }));
      const app = buildApp({ setSurplusConfig }, ['production.adjust_surplus']);

      const response = await app.request('/api/v1/surplus/config', {
        body: JSON.stringify({ coefficientPercent: 15 }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'PATCH',
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { coefficientPercent: number };
      expect(body.coefficientPercent).toBe(15);

      const denied = buildApp({ setSurplusConfig: vi.fn() }, ['production.read']);
      const deniedResponse = await denied.request('/api/v1/surplus/config', {
        body: JSON.stringify({ coefficientPercent: 15 }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'PATCH',
      });
      expect(deniedResponse.status).toBe(403);
    });

    const SITE = '20000000-0000-4000-8000-000000000099';

    it('lists the per-site Intuitivo toggle with production.read and denies without it', async () => {
      const listMenuCatalogSettings = vi.fn(() =>
        Promise.resolve([
          { intuitivoEnabled: true, operatingSiteId: SITE, operatingSiteName: 'Neuquén' },
        ]),
      );
      const app = buildApp({ listMenuCatalogSettings }, ['production.read']);

      const response = await app.request('/api/v1/menu-catalog/settings', { headers: { cookie } });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        items: [{ intuitivoEnabled: true, operatingSiteId: SITE, operatingSiteName: 'Neuquén' }],
      });

      const denied = buildApp({ listMenuCatalogSettings: vi.fn() }, []);
      const deniedResponse = await denied.request('/api/v1/menu-catalog/settings', {
        headers: { cookie },
      });
      expect(deniedResponse.status).toBe(403);
    });

    it("flips one site's Intuitivo toggle with production.generate and denies without it", async () => {
      const setIntuitivoEnabled = vi.fn(() => Promise.resolve(undefined));
      const listMenuCatalogSettings = vi.fn(() => Promise.resolve([]));
      const app = buildApp({ listMenuCatalogSettings, setIntuitivoEnabled }, [
        'production.generate',
      ]);

      const response = await app.request(`/api/v1/menu-catalog/settings/${SITE}`, {
        body: JSON.stringify({ intuitivoEnabled: false }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'PATCH',
      });
      expect(response.status).toBe(200);
      expect(setIntuitivoEnabled).toHaveBeenCalledWith(SITE, false, expect.anything());

      const denied = buildApp({ setIntuitivoEnabled: vi.fn() }, ['production.read']);
      const deniedResponse = await denied.request(`/api/v1/menu-catalog/settings/${SITE}`, {
        body: JSON.stringify({ intuitivoEnabled: false }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'PATCH',
      });
      expect(deniedResponse.status).toBe(403);
    });

    const sampleSnapshot = {
      generatedAt: new Date('2026-08-25T20:00:00.000Z'),
      generatedByUserId: null,
      id: '20000000-0000-4000-8000-000000000001',
      kind: 'partial',
      payload: {
        actuals: [],
        base: [{ exceptions: [], familyName: 'Keto', quantityUnits: 4, variantName: '250' }],
        custom: [],
        cycle: { alias: 'Semana 34', id: CYCLE },
        delta: null,
        totalUnits: 4,
      },
      salesCycleId: CYCLE,
    };

    it('exports a snapshot as xlsx, whatsapp text, and a print page', async () => {
      const listProductionSnapshots = vi.fn(() => Promise.resolve([sampleSnapshot]));
      const app = buildApp({ listProductionSnapshots }, ['production.read']);

      const xlsx = await app.request(
        `/api/v1/production/${CYCLE}/snapshots/export?kind=partial&format=xlsx`,
        { headers: { cookie } },
      );
      expect(xlsx.status).toBe(200);
      expect(xlsx.headers.get('content-type')).toContain('spreadsheetml');

      const whatsapp = await app.request(
        `/api/v1/production/${CYCLE}/snapshots/export?kind=partial&format=whatsapp`,
        { headers: { cookie } },
      );
      expect(whatsapp.status).toBe(200);
      expect(await whatsapp.text()).toContain('Keto 250');

      const pdf = await app.request(
        `/api/v1/production/${CYCLE}/snapshots/export?kind=partial&format=pdf`,
        { headers: { cookie } },
      );
      expect(pdf.status).toBe(200);
      expect(pdf.headers.get('content-type')).toContain('text/html');
    });

    it('404s exporting a snapshot kind that was never generated', async () => {
      const listProductionSnapshots = vi.fn(() => Promise.resolve([]));
      const app = buildApp({ listProductionSnapshots }, ['production.read']);

      const response = await app.request(
        `/api/v1/production/${CYCLE}/snapshots/export?kind=final&format=pdf`,
        { headers: { cookie } },
      );
      expect(response.status).toBe(404);
    });
  });

  describe('user administration', () => {
    const TARGET_USER = '60000000-0000-4000-8000-000000000001';
    const sampleDetail = {
      avatarUrl: null,
      displayName: 'María Pérez',
      effectivePermissions: ['orders.read'],
      email: 'maria@example.com',
      id: TARGET_USER,
      overrides: [],
      roles: [
        {
          active: true,
          description: null,
          id: '70000000-0000-4000-8000-000000000001',
          key: 'operador',
          name: 'Operador',
        },
      ],
      status: 'active',
    };

    function buildUserAdminApp(userAdmin: Record<string, unknown>, permissions: string[]) {
      return createApp({
        appOrigin: 'http://localhost:5173',
        cookieSameSite: 'Lax',
        credentials: emptyCredentials,
        logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
        sessions: {
          ...emptySessions,
          authenticate: () =>
            Promise.resolve({
              expiresAt: new Date('2026-08-18T12:00:00.000Z'),
              permissions,
              sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
              userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
            }),
        },
        secureCookies: false,
        userAdmin: userAdmin as never,
        users: emptyUsers,
        version: 'test',
      });
    }

    const cookie = 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars';

    it('reads a user detail with users.read and denies without it', async () => {
      const getDetail = vi.fn(() => Promise.resolve(sampleDetail));
      const app = buildUserAdminApp({ getDetail }, ['users.read']);

      const response = await app.request(`/api/v1/users/${TARGET_USER}`, { headers: { cookie } });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { displayName: string };
      expect(body.displayName).toBe('María Pérez');

      const denied = buildUserAdminApp({ getDetail: vi.fn() }, []);
      const deniedResponse = await denied.request(`/api/v1/users/${TARGET_USER}`, {
        headers: { cookie },
      });
      expect(deniedResponse.status).toBe(403);
    });

    it('404s a user detail that does not exist', async () => {
      const getDetail = vi.fn(() => Promise.resolve(null));
      const app = buildUserAdminApp({ getDetail }, ['users.read']);

      const response = await app.request(`/api/v1/users/${TARGET_USER}`, { headers: { cookie } });
      expect(response.status).toBe(404);
    });

    it('disables a user with users.disable and denies without it', async () => {
      const setStatus = vi.fn(() => Promise.resolve({ ...sampleDetail, status: 'disabled' }));
      const app = buildUserAdminApp({ setStatus }, ['users.disable']);

      const response = await app.request(`/api/v1/users/${TARGET_USER}/status`, {
        body: JSON.stringify({ active: false }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'PATCH',
      });
      expect(response.status).toBe(200);
      expect(setStatus).toHaveBeenCalledWith(TARGET_USER, false);

      const denied = buildUserAdminApp({ setStatus: vi.fn() }, ['users.read']);
      const deniedResponse = await denied.request(`/api/v1/users/${TARGET_USER}/status`, {
        body: JSON.stringify({ active: false }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'PATCH',
      });
      expect(deniedResponse.status).toBe(403);
    });

    it('replaces roles with roles.manage and denies without it', async () => {
      const setRoles = vi.fn(() => Promise.resolve(sampleDetail));
      const app = buildUserAdminApp({ setRoles }, ['roles.manage']);

      const response = await app.request(`/api/v1/users/${TARGET_USER}/roles`, {
        body: JSON.stringify({ roleIds: ['70000000-0000-4000-8000-000000000001'] }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'PUT',
      });
      expect(response.status).toBe(200);
      expect(setRoles).toHaveBeenCalledWith(
        TARGET_USER,
        ['70000000-0000-4000-8000-000000000001'],
        '55276601-ec66-4f63-9f2f-edf73904ede0',
      );

      const denied = buildUserAdminApp({ setRoles: vi.fn() }, ['users.read']);
      const deniedResponse = await denied.request(`/api/v1/users/${TARGET_USER}/roles`, {
        body: JSON.stringify({ roleIds: [] }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'PUT',
      });
      expect(deniedResponse.status).toBe(403);
    });

    it('replaces permission overrides with permissions.override and denies without it', async () => {
      const setPermissionOverrides = vi.fn(() => Promise.resolve(sampleDetail));
      const app = buildUserAdminApp({ setPermissionOverrides }, ['permissions.override']);

      const response = await app.request(`/api/v1/users/${TARGET_USER}/permissions`, {
        body: JSON.stringify({
          overrides: [{ effect: 'deny', permissionId: '80000000-0000-4000-8000-000000000001' }],
        }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'PUT',
      });
      expect(response.status).toBe(200);
      expect(setPermissionOverrides).toHaveBeenCalledWith(
        TARGET_USER,
        [{ effect: 'deny', permissionId: '80000000-0000-4000-8000-000000000001' }],
        '55276601-ec66-4f63-9f2f-edf73904ede0',
      );

      const denied = buildUserAdminApp({ setPermissionOverrides: vi.fn() }, ['users.read']);
      const deniedResponse = await denied.request(`/api/v1/users/${TARGET_USER}/permissions`, {
        body: JSON.stringify({ overrides: [] }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'PUT',
      });
      expect(deniedResponse.status).toBe(403);
    });

    it('lists roles and the permission catalog behind users.read', async () => {
      const listRoles = vi.fn(() => Promise.resolve(sampleDetail.roles));
      const listPermissionsCatalog = vi.fn(() =>
        Promise.resolve([
          {
            description: 'Ver pedidos',
            group: 'orders',
            id: '80000000-0000-4000-8000-000000000001',
            key: 'orders.read',
          },
        ]),
      );
      const app = buildUserAdminApp({ listRoles, listPermissionsCatalog }, ['users.read']);

      const rolesResponse = await app.request('/api/v1/roles', { headers: { cookie } });
      expect(rolesResponse.status).toBe(200);
      const permissionsResponse = await app.request('/api/v1/permissions', { headers: { cookie } });
      expect(permissionsResponse.status).toBe(200);
    });
  });

  describe('access tokens', () => {
    function buildAccessTokenApp(accessTokens: Record<string, unknown>, permissions: string[]) {
      return createApp({
        accessTokens: accessTokens as never,
        appOrigin: 'http://localhost:5173',
        cookieSameSite: 'Lax',
        credentials: emptyCredentials,
        logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
        sessions: {
          ...emptySessions,
          authenticate: () =>
            Promise.resolve({
              expiresAt: new Date('2026-08-18T12:00:00.000Z'),
              permissions,
              sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
              userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
            }),
        },
        secureCookies: false,
        users: emptyUsers,
        version: 'test',
      });
    }

    const cookie = 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars';

    it('issues a repartidor_access token with access_tokens.manage and denies without it', async () => {
      const issue = vi.fn(() =>
        Promise.resolve({
          expiresAt: new Date('2026-08-27T12:00:00.000Z'),
          id: '90000000-0000-4000-8000-000000000001',
          token: 'vrd_raw-token-value',
        }),
      );
      const app = buildAccessTokenApp({ issue }, ['access_tokens.manage']);

      const response = await app.request('/api/v1/access-tokens', {
        body: JSON.stringify({
          boundUserId: '90000000-0000-4000-8000-000000000002',
          kind: 'repartidor_access',
          label: 'Repartidor Neuquén',
          ttlHours: 48,
        }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(response.status).toBe(201);
      const body = (await response.json()) as { token: string };
      expect(body.token).toBe('vrd_raw-token-value');

      const denied = buildAccessTokenApp({ issue: vi.fn() }, ['users.read']);
      const deniedResponse = await denied.request('/api/v1/access-tokens', {
        body: JSON.stringify({
          boundUserId: '90000000-0000-4000-8000-000000000002',
          kind: 'repartidor_access',
          label: 'x',
          ttlHours: 48,
        }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(deniedResponse.status).toBe(403);
    });

    it('rejects a repartidor_access token with no bound user', async () => {
      const issue = vi.fn();
      const app = buildAccessTokenApp({ issue }, ['access_tokens.manage']);

      const response = await app.request('/api/v1/access-tokens', {
        body: JSON.stringify({ kind: 'repartidor_access', label: 'x', ttlHours: 48 }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(response.status).toBe(400);
      expect(issue).not.toHaveBeenCalled();
    });

    it('rejects a user_invite token with no role', async () => {
      const issue = vi.fn();
      const app = buildAccessTokenApp({ issue }, ['access_tokens.manage']);

      const response = await app.request('/api/v1/access-tokens', {
        body: JSON.stringify({ kind: 'user_invite', label: 'x', ttlHours: 48 }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(response.status).toBe(400);
      expect(issue).not.toHaveBeenCalled();
    });

    it('revokes a token with access_tokens.manage and denies without it', async () => {
      const revoke = vi.fn(() => Promise.resolve());
      const app = buildAccessTokenApp({ revoke }, ['access_tokens.manage']);

      const response = await app.request(
        '/api/v1/access-tokens/90000000-0000-4000-8000-000000000001',
        { headers: { cookie }, method: 'DELETE' },
      );
      expect(response.status).toBe(204);
      expect(revoke).toHaveBeenCalledWith('90000000-0000-4000-8000-000000000001');

      const denied = buildAccessTokenApp({ revoke: vi.fn() }, ['users.read']);
      const deniedResponse = await denied.request(
        '/api/v1/access-tokens/90000000-0000-4000-8000-000000000001',
        { headers: { cookie }, method: 'DELETE' },
      );
      expect(deniedResponse.status).toBe(403);
    });

    it('redeems a valid token, sets the session cookie, and answers the same shape as password login', async () => {
      const redeem = vi.fn(() =>
        Promise.resolve({
          ok: true,
          session: {
            expiresAt: new Date('2026-08-27T12:00:00.000Z'),
            sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
            token: 'opaque-session-token-that-is-never-returned-to-the-browser-body',
          },
        }),
      );
      const app = buildAccessTokenApp({ redeem }, []);

      const response = await app.request('/api/v1/auth/token-login', {
        body: JSON.stringify({ token: 'vrd_raw-token-value' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const body: unknown = await response.json();

      expect(response.status).toBe(200);
      expect(LoginResponseSchema.parse(body).sessionId).toBe(
        '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
      );
      expect(response.headers.get('set-cookie')).toContain('HttpOnly');
      expect(redeem).toHaveBeenCalledWith('vrd_raw-token-value', undefined);
    });

    it('answers a generic error for an invalid, expired, or already-used token', async () => {
      const redeem = vi.fn(() => Promise.resolve({ ok: false, reason: 'expired' }));
      const app = buildAccessTokenApp({ redeem }, []);

      const response = await app.request('/api/v1/auth/token-login', {
        body: JSON.stringify({ token: 'vrd_some-token' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'UNAUTHENTICATED' },
      });
    });

    it('passes displayName through for a user_invite redemption', async () => {
      const redeem = vi.fn(() =>
        Promise.resolve({
          ok: true,
          session: {
            expiresAt: new Date('2026-08-27T12:00:00.000Z'),
            sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
            token: 'opaque-session-token-that-is-never-returned-to-the-browser-body',
          },
        }),
      );
      const app = buildAccessTokenApp({ redeem }, []);

      const response = await app.request('/api/v1/auth/token-login', {
        body: JSON.stringify({ displayName: 'Nueva Operadora', token: 'vrd_invite-token' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(response.status).toBe(200);
      expect(redeem).toHaveBeenCalledWith('vrd_invite-token', 'Nueva Operadora');
    });
  });

  describe('cms', () => {
    function buildCmsApp(cms: Record<string, unknown>, permissions: string[]) {
      return createApp({
        appOrigin: 'http://localhost:5173',
        cms: cms as never,
        cookieSameSite: 'Lax',
        credentials: emptyCredentials,
        logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
        sessions: {
          ...emptySessions,
          authenticate: () =>
            Promise.resolve({
              expiresAt: new Date('2026-08-18T12:00:00.000Z'),
              permissions,
              sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
              userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
            }),
        },
        secureCookies: false,
        users: emptyUsers,
        version: 'test',
      });
    }

    const cookie = 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars';
    const sampleRevision = {
      createdAt: new Date('2026-08-25T12:00:00.000Z'),
      createdByDisplayName: 'Santiago',
      id: '90000000-0000-4000-8000-000000000001',
      revision: 1,
      sections: [] as unknown[],
    };
    const sampleDetail = {
      draft: sampleRevision,
      id: '90000000-0000-4000-8000-000000000002',
      published: null,
      slug: 'home',
      title: 'Inicio',
    };

    it('serves a public page without authentication', async () => {
      const getPublicPage = vi.fn(() =>
        Promise.resolve({ sections: [], slug: 'home', title: 'Inicio' }),
      );
      const app = buildCmsApp({ getPublicPage }, []);

      const response = await app.request('/api/v1/public/pages/home');
      expect(response.status).toBe(200);
      const body = (await response.json()) as { slug: string };
      expect(body.slug).toBe('home');
    });

    it('404s a public page that was never published', async () => {
      const getPublicPage = vi.fn(() => Promise.resolve(null));
      const app = buildCmsApp({ getPublicPage }, []);

      const response = await app.request('/api/v1/public/pages/unknown');
      expect(response.status).toBe(404);
    });

    it('creates a page with cms.edit and denies without it', async () => {
      const createPage = vi.fn(() => Promise.resolve(sampleDetail));
      const app = buildCmsApp({ createPage }, ['cms.edit']);

      const response = await app.request('/api/v1/cms/pages', {
        body: JSON.stringify({ slug: 'home', title: 'Inicio' }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(response.status).toBe(201);

      const denied = buildCmsApp({ createPage: vi.fn() }, ['cms.read']);
      const deniedResponse = await denied.request('/api/v1/cms/pages', {
        body: JSON.stringify({ slug: 'home', title: 'Inicio' }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(deniedResponse.status).toBe(403);
    });

    it('answers 409 when the slug already exists', async () => {
      const conflict = new Error('Ya existe una página con ese slug');
      conflict.name = 'CmsConflictError';
      const createPage = vi.fn(() => Promise.reject(conflict));
      const app = buildCmsApp({ createPage }, ['cms.edit']);

      const response = await app.request('/api/v1/cms/pages', {
        body: JSON.stringify({ slug: 'home', title: 'Inicio' }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(response.status).toBe(409);
    });

    it('saves a draft with cms.edit and denies without it', async () => {
      const saveDraft = vi.fn(() => Promise.resolve(sampleRevision));
      const app = buildCmsApp({ saveDraft }, ['cms.edit']);

      const response = await app.request('/api/v1/cms/pages/home/draft', {
        body: JSON.stringify({ sections: [] }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'PUT',
      });
      expect(response.status).toBe(200);

      const denied = buildCmsApp({ saveDraft: vi.fn() }, ['cms.read']);
      const deniedResponse = await denied.request('/api/v1/cms/pages/home/draft', {
        body: JSON.stringify({ sections: [] }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'PUT',
      });
      expect(deniedResponse.status).toBe(403);
    });

    it('publishes with cms.publish and denies without it', async () => {
      const publish = vi.fn(() => Promise.resolve(sampleDetail));
      const app = buildCmsApp({ publish }, ['cms.publish']);

      const response = await app.request('/api/v1/cms/pages/home/publish', {
        body: JSON.stringify({ revisionId: sampleRevision.id }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(response.status).toBe(200);
      expect(publish).toHaveBeenCalledWith(
        'home',
        sampleRevision.id,
        expect.objectContaining({ actorUserId: '55276601-ec66-4f63-9f2f-edf73904ede0' }),
      );

      const denied = buildCmsApp({ publish: vi.fn() }, ['cms.edit']);
      const deniedResponse = await denied.request('/api/v1/cms/pages/home/publish', {
        body: JSON.stringify({ revisionId: sampleRevision.id }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(deniedResponse.status).toBe(403);
    });

    it('rejects an unsupported media content type before touching storage', async () => {
      const uploadMedia = vi.fn();
      const recordMediaAsset = vi.fn();
      const app = createApp({
        appOrigin: 'http://localhost:5173',
        avatarStorage: { upload: vi.fn(), uploadMedia },
        cms: { recordMediaAsset },
        cookieSameSite: 'Lax',
        credentials: emptyCredentials,
        logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
        sessions: {
          ...emptySessions,
          authenticate: () =>
            Promise.resolve({
              expiresAt: new Date('2026-08-18T12:00:00.000Z'),
              permissions: ['cms.edit'],
              sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
              userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
            }),
        },
        secureCookies: false,
        users: emptyUsers,
        version: 'test',
      } as never);

      const response = await app.request('/api/v1/cms/media', {
        body: new Uint8Array([1, 2, 3]),
        headers: { cookie, 'content-type': 'application/pdf' },
        method: 'POST',
      });
      expect(response.status).toBe(400);
      expect(uploadMedia).not.toHaveBeenCalled();
      expect(recordMediaAsset).not.toHaveBeenCalled();
    });
  });

  describe('messaging', () => {
    function buildMessagingApp(messaging: Record<string, unknown>, permissions: string[]) {
      return createApp({
        appOrigin: 'http://localhost:5173',
        cookieSameSite: 'Lax',
        credentials: emptyCredentials,
        logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
        messaging: messaging as never,
        sessions: {
          ...emptySessions,
          authenticate: () =>
            Promise.resolve({
              expiresAt: new Date('2026-08-18T12:00:00.000Z'),
              permissions,
              sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
              userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
            }),
        },
        secureCookies: false,
        users: emptyUsers,
        version: 'test',
      });
    }

    const cookie = 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars';

    it('lists accounts with messaging.accounts.manage and denies without it', async () => {
      const listAccounts = vi.fn(() => Promise.resolve([]));
      const app = buildMessagingApp({ listAccounts }, ['messaging.accounts.manage']);

      const response = await app.request('/api/v1/messaging/accounts', {
        headers: { cookie },
      });
      expect(response.status).toBe(200);

      const denied = buildMessagingApp({ listAccounts: vi.fn() }, []);
      const deniedResponse = await denied.request('/api/v1/messaging/accounts', {
        headers: { cookie },
      });
      expect(deniedResponse.status).toBe(403);
    });

    it('creates an account with valid input', async () => {
      const createAccount = vi.fn(() =>
        Promise.resolve({
          active: true,
          createdAt: new Date(),
          displayPhoneNumber: null,
          hasAccessToken: false,
          id: '90000000-0000-4000-8000-000000000001',
          label: 'A',
          operatingSiteId: null,
          phoneNumberId: 'PNID1',
          provider: 'whatsapp',
          wabaId: null,
        }),
      );
      const app = buildMessagingApp({ createAccount }, ['messaging.accounts.manage']);

      const response = await app.request('/api/v1/messaging/accounts', {
        body: JSON.stringify({ label: 'A', phoneNumberId: 'PNID1' }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });

      expect(response.status).toBe(201);
      expect(createAccount).toHaveBeenCalled();
    });

    it('lists conversations with messages.read and denies without it', async () => {
      const listConversations = vi.fn(() => Promise.resolve([]));
      const app = buildMessagingApp({ listConversations }, ['messages.read']);

      const response = await app.request('/api/v1/messaging/conversations', {
        headers: { cookie },
      });
      expect(response.status).toBe(200);

      const denied = buildMessagingApp({ listConversations: vi.fn() }, []);
      const deniedResponse = await denied.request('/api/v1/messaging/conversations', {
        headers: { cookie },
      });
      expect(deniedResponse.status).toBe(403);
    });

    it('sends a message with messages.send and denies without it', async () => {
      const sendMessage = vi.fn(() => Promise.resolve({ id: 'm1' }));
      const app = buildMessagingApp({ sendMessage }, ['messages.send']);

      const response = await app.request(
        '/api/v1/messaging/conversations/90000000-0000-4000-8000-000000000001/messages',
        {
          body: JSON.stringify({ body: 'Hola' }),
          headers: { cookie, 'content-type': 'application/json' },
          method: 'POST',
        },
      );
      expect(response.status).toBe(201);

      const denied = buildMessagingApp({ sendMessage: vi.fn() }, []);
      const deniedResponse = await denied.request(
        '/api/v1/messaging/conversations/90000000-0000-4000-8000-000000000001/messages',
        {
          body: JSON.stringify({ body: 'Hola' }),
          headers: { cookie, 'content-type': 'application/json' },
          method: 'POST',
        },
      );
      expect(deniedResponse.status).toBe(403);
    });

    it('turns a provider error into a 409 rather than a 500', async () => {
      class MessagingProviderError extends Error {
        public constructor(message: string) {
          super(message);
          this.name = 'MessagingProviderError';
        }
      }
      const sendMessage = vi.fn(() =>
        Promise.reject(new MessagingProviderError('sin token configurado')),
      );
      const app = buildMessagingApp({ sendMessage }, ['messages.send']);

      const response = await app.request(
        '/api/v1/messaging/conversations/90000000-0000-4000-8000-000000000001/messages',
        {
          body: JSON.stringify({ body: 'Hola' }),
          headers: { cookie, 'content-type': 'application/json' },
          method: 'POST',
        },
      );
      expect(response.status).toBe(409);
    });

    it('answers the Meta webhook verification challenge when configured', async () => {
      const app = createApp({
        appOrigin: 'http://localhost:5173',
        cookieSameSite: 'Lax',
        credentials: emptyCredentials,
        logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
        messaging: {
          verifyChallenge: () => 'the-challenge',
        } as never,
        sessions: emptySessions,
        secureCookies: false,
        users: emptyUsers,
        version: 'test',
      });

      const response = await app.request(
        '/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=x&hub.challenge=the-challenge',
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('the-challenge');
    });

    it('rejects the webhook verification challenge when unconfigured', async () => {
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

      const response = await app.request('/api/v1/webhooks/whatsapp?hub.mode=subscribe');
      expect(response.status).toBe(403);
    });

    it('rejects an inbound webhook post with a bad signature', async () => {
      const handleInboundEvent = vi.fn();
      const app = createApp({
        appOrigin: 'http://localhost:5173',
        cookieSameSite: 'Lax',
        credentials: emptyCredentials,
        logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
        messaging: {
          handleInboundEvent,
          verifySignature: () => false,
        } as never,
        sessions: emptySessions,
        secureCookies: false,
        users: emptyUsers,
        version: 'test',
      });

      const response = await app.request('/api/v1/webhooks/whatsapp', {
        body: JSON.stringify({ entry: [] }),
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=bad' },
        method: 'POST',
      });
      expect(response.status).toBe(403);
      expect(handleInboundEvent).not.toHaveBeenCalled();
    });

    it('routes an inbound webhook post once the signature passes', async () => {
      const handleInboundEvent = vi.fn(() => Promise.resolve({ deduped: false, routed: true }));
      const app = createApp({
        appOrigin: 'http://localhost:5173',
        cookieSameSite: 'Lax',
        credentials: emptyCredentials,
        logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
        messaging: {
          handleInboundEvent,
          verifySignature: () => true,
        } as never,
        sessions: emptySessions,
        secureCookies: false,
        users: emptyUsers,
        version: 'test',
      });

      const response = await app.request('/api/v1/webhooks/whatsapp', {
        body: JSON.stringify({ entry: [] }),
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=ok' },
        method: 'POST',
      });
      expect(response.status).toBe(200);
      expect(handleInboundEvent).toHaveBeenCalledWith({ entry: [] });
    });
  });

  describe('delivery', () => {
    function buildDeliveryApp(delivery: Record<string, unknown>, permissions: string[]) {
      return createApp({
        appOrigin: 'http://localhost:5173',
        cookieSameSite: 'Lax',
        credentials: emptyCredentials,
        delivery: delivery as never,
        logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
        sessions: {
          ...emptySessions,
          authenticate: () =>
            Promise.resolve({
              expiresAt: new Date('2026-08-18T12:00:00.000Z'),
              permissions,
              sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
              userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
            }),
        },
        secureCookies: false,
        users: emptyUsers,
        version: 'test',
      });
    }

    const cookie = 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars';
    const routeId = '90000000-0000-4000-8000-000000000001';

    it('creates a route with routes.manage and denies without it', async () => {
      const createRoute = vi.fn(() =>
        Promise.resolve({
          createdByUserId: null,
          deliveryDate: '2026-08-26',
          id: routeId,
          label: null,
          operatingSiteId: '80000000-0000-4000-8000-000000000001',
          publishedAt: null,
          status: 'draft',
          stops: [],
        }),
      );
      const app = buildDeliveryApp({ createRoute }, ['routes.manage']);

      const response = await app.request('/api/v1/delivery/routes', {
        body: JSON.stringify({
          deliveryDate: '2026-08-26',
          operatingSiteId: '80000000-0000-4000-8000-000000000001',
        }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(response.status).toBe(201);

      const denied = buildDeliveryApp({ createRoute: vi.fn() }, ['routes.read']);
      const deniedResponse = await denied.request('/api/v1/delivery/routes', {
        body: JSON.stringify({
          deliveryDate: '2026-08-26',
          operatingSiteId: '80000000-0000-4000-8000-000000000001',
        }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(deniedResponse.status).toBe(403);
    });

    it('turns a route-not-found error into a 404', async () => {
      class DeliveryNotFoundError extends Error {
        public constructor(message: string) {
          super(message);
          this.name = 'DeliveryNotFoundError';
        }
      }
      const getRouteDetail = vi.fn(() =>
        Promise.reject(new DeliveryNotFoundError('Route not found')),
      );
      const app = buildDeliveryApp({ getRouteDetail }, ['routes.read']);

      const response = await app.request(`/api/v1/delivery/routes/${routeId}`, {
        headers: { cookie },
      });
      expect(response.status).toBe(404);
    });

    it('turns a publish conflict into a 409', async () => {
      class DeliveryConflictError extends Error {
        public constructor(message: string) {
          super(message);
          this.name = 'DeliveryConflictError';
        }
      }
      const publishRoute = vi.fn(() =>
        Promise.reject(new DeliveryConflictError('Solo una ruta en borrador puede publicarse.')),
      );
      const app = buildDeliveryApp({ publishRoute }, ['routes.publish']);

      const response = await app.request(`/api/v1/delivery/routes/${routeId}/publish`, {
        headers: { cookie },
        method: 'POST',
      });
      expect(response.status).toBe(409);
    });

    it('lists my-stops with delivery.execute and denies without it', async () => {
      const listStopsForUser = vi.fn(() => Promise.resolve([]));
      const app = buildDeliveryApp({ listStopsForUser }, ['delivery.execute']);

      const response = await app.request('/api/v1/delivery/my-stops', { headers: { cookie } });
      expect(response.status).toBe(200);

      const denied = buildDeliveryApp({ listStopsForUser: vi.fn() }, []);
      const deniedResponse = await denied.request('/api/v1/delivery/my-stops', {
        headers: { cookie },
      });
      expect(deniedResponse.status).toBe(403);
    });

    it('triggers a delivery message with delivery.trigger_messages and denies without it', async () => {
      const triggerMessage = vi.fn(() => Promise.resolve({ sent: true }));
      const app = buildDeliveryApp({ triggerMessage }, ['delivery.trigger_messages']);
      const stopId = '90000000-0000-4000-8000-000000000002';

      const response = await app.request(`/api/v1/delivery/stops/${stopId}/trigger`, {
        body: JSON.stringify({ action: 'ON_MY_WAY' }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ sent: true });

      const denied = buildDeliveryApp({ triggerMessage: vi.fn() }, []);
      const deniedResponse = await denied.request(`/api/v1/delivery/stops/${stopId}/trigger`, {
        body: JSON.stringify({ action: 'ON_MY_WAY' }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(deniedResponse.status).toBe(403);
    });
  });

  describe('payments', () => {
    function buildPaymentsApp(payments: Record<string, unknown>, permissions: string[]) {
      return createApp({
        appOrigin: 'http://localhost:5173',
        cookieSameSite: 'Lax',
        credentials: emptyCredentials,
        logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
        payments: payments as never,
        sessions: {
          ...emptySessions,
          authenticate: () =>
            Promise.resolve({
              expiresAt: new Date('2026-08-18T12:00:00.000Z'),
              permissions,
              sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
              userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
            }),
        },
        secureCookies: false,
        users: emptyUsers,
        version: 'test',
      });
    }

    const cookie = 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars';

    it('reads the dashboard with payments.read and denies without it', async () => {
      const dashboard = vi.fn(() =>
        Promise.resolve({
          cashByRepartidor: [],
          paidTotalMinor: 0,
          pendingTotalMinor: 0,
          toSettleTotalMinor: 0,
        }),
      );
      const app = buildPaymentsApp({ dashboard }, ['payments.read']);

      const response = await app.request('/api/v1/payments/dashboard', { headers: { cookie } });
      expect(response.status).toBe(200);

      const denied = buildPaymentsApp({ dashboard: vi.fn() }, []);
      const deniedResponse = await denied.request('/api/v1/payments/dashboard', {
        headers: { cookie },
      });
      expect(deniedResponse.status).toBe(403);
    });

    it('records a collection with payments.record and denies without it', async () => {
      const recordCollection = vi.fn(() =>
        Promise.resolve({
          amountMinor: 25000,
          collectedAt: new Date(),
          collectedByUserId: '55276601-ec66-4f63-9f2f-edf73904ede0',
          id: '90000000-0000-4000-8000-000000000003',
          method: 'efectivo',
          orderId: '90000000-0000-4000-8000-000000000004',
        }),
      );
      const app = buildPaymentsApp({ recordCollection }, ['payments.record']);
      const orderId = '90000000-0000-4000-8000-000000000004';

      const response = await app.request(`/api/v1/payments/orders/${orderId}/collections`, {
        body: JSON.stringify({ amountMinor: 25000, method: 'efectivo' }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(response.status).toBe(201);

      const denied = buildPaymentsApp({ recordCollection: vi.fn() }, []);
      const deniedResponse = await denied.request(
        `/api/v1/payments/orders/${orderId}/collections`,
        {
          body: JSON.stringify({ amountMinor: 25000, method: 'efectivo' }),
          headers: { cookie, 'content-type': 'application/json' },
          method: 'POST',
        },
      );
      expect(deniedResponse.status).toBe(403);
    });

    it('turns a settlement conflict into a 409', async () => {
      class PaymentsConflictError extends Error {
        public constructor(message: string) {
          super(message);
          this.name = 'PaymentsConflictError';
        }
      }
      const settleCollection = vi.fn(() =>
        Promise.reject(new PaymentsConflictError('Esta cobranza ya fue rendida.')),
      );
      const app = buildPaymentsApp({ settleCollection }, ['payments.settle']);
      const collectionId = '90000000-0000-4000-8000-000000000005';

      const response = await app.request(`/api/v1/payments/collections/${collectionId}/settle`, {
        body: JSON.stringify({ receivedByUserId: '55276601-ec66-4f63-9f2f-edf73904ede0' }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(response.status).toBe(409);
    });
  });

  describe('ai prompts and tasks', () => {
    function buildAIApp(
      overrides: { aiPrompts?: Record<string, unknown>; aiTasks?: Record<string, unknown> },
      permissions: string[],
    ) {
      return createApp({
        appOrigin: 'http://localhost:5173',
        ...overrides,
        cookieSameSite: 'Lax',
        credentials: emptyCredentials,
        logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
        sessions: {
          ...emptySessions,
          authenticate: () =>
            Promise.resolve({
              expiresAt: new Date('2026-08-18T12:00:00.000Z'),
              permissions,
              sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
              userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
            }),
        },
        secureCookies: false,
        users: emptyUsers,
        version: 'test',
      } as never);
    }

    const cookie = 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars';

    it('lists prompts with ai.prompts.manage and denies without it', async () => {
      const listPrompts = vi.fn(() => Promise.resolve([]));
      const app = buildAIApp({ aiPrompts: { listPrompts } }, ['ai.prompts.manage']);

      const response = await app.request('/api/v1/ai/prompts', { headers: { cookie } });
      expect(response.status).toBe(200);

      const denied = buildAIApp({ aiPrompts: { listPrompts: vi.fn() } }, []);
      const deniedResponse = await denied.request('/api/v1/ai/prompts', { headers: { cookie } });
      expect(deniedResponse.status).toBe(403);
    });

    it('creates a prompt version with ai.prompts.manage and denies without it', async () => {
      const createVersion = vi.fn(() =>
        Promise.resolve({ activeVersionId: null, taskKey: 'rewrite_message', versions: [] }),
      );
      const app = buildAIApp({ aiPrompts: { createVersion } }, ['ai.prompts.manage']);

      const response = await app.request('/api/v1/ai/prompts/rewrite_message/versions', {
        body: JSON.stringify({
          maxTokens: 500,
          systemPrompt: 'Sos un asistente.',
          temperature: 0.5,
        }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(response.status).toBe(201);

      const denied = buildAIApp({ aiPrompts: { createVersion: vi.fn() } }, []);
      const deniedResponse = await denied.request('/api/v1/ai/prompts/rewrite_message/versions', {
        body: JSON.stringify({ maxTokens: 500, systemPrompt: 'x', temperature: 0.5 }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(deniedResponse.status).toBe(403);
    });

    it('runs a task with ai.use and denies without it', async () => {
      const runTask = vi.fn(() =>
        Promise.resolve({
          model: 'gpt-test',
          output: 'texto reescrito',
          promptVersion: 1,
          providerKey: 'openai',
          usage: { inputTokens: 10, outputTokens: 20 },
        }),
      );
      const app = buildAIApp({ aiTasks: { runTask } }, ['ai.use']);

      const response = await app.request('/api/v1/ai/tasks/rewrite_message/run', {
        body: JSON.stringify({ variables: { style: 'cordial', text: 'hola' } }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ output: 'texto reescrito' });

      const denied = buildAIApp({ aiTasks: { runTask: vi.fn() } }, []);
      const deniedResponse = await denied.request('/api/v1/ai/tasks/rewrite_message/run', {
        body: JSON.stringify({ variables: { style: 'cordial', text: 'hola' } }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(deniedResponse.status).toBe(403);
    });

    it('turns AITaskNotConfiguredError into a 409, not a 500', async () => {
      class AITaskNotConfiguredError extends Error {
        public constructor(message: string) {
          super(message);
          this.name = 'AITaskNotConfiguredError';
        }
      }
      const runTask = vi.fn(() =>
        Promise.reject(
          new AITaskNotConfiguredError('Esta tarea todavía no tiene un prompt activo.'),
        ),
      );
      const app = buildAIApp({ aiTasks: { runTask } }, ['ai.use']);

      const response = await app.request('/api/v1/ai/tasks/rewrite_message/run', {
        body: JSON.stringify({ variables: { style: 'cordial', text: 'hola' } }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(response.status).toBe(409);
    });

    it('turns AITaskValidationError into a 409', async () => {
      class AITaskValidationError extends Error {
        public constructor(message: string) {
          super(message);
          this.name = 'AITaskValidationError';
        }
      }
      const runTask = vi.fn(() =>
        Promise.reject(new AITaskValidationError('La respuesta no cumple el esquema.')),
      );
      const app = buildAIApp({ aiTasks: { runTask } }, ['ai.use']);

      const response = await app.request('/api/v1/ai/tasks/extract_order/run', {
        body: JSON.stringify({ variables: { message: 'hola' } }),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(response.status).toBe(409);
    });
  });

  describe('audit', () => {
    function buildAuditApp(auditQuery: Record<string, unknown>, permissions: string[]) {
      return createApp({
        appOrigin: 'http://localhost:5173',
        auditQuery: auditQuery as never,
        cookieSameSite: 'Lax',
        credentials: emptyCredentials,
        logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
        sessions: {
          ...emptySessions,
          authenticate: () =>
            Promise.resolve({
              expiresAt: new Date('2026-08-18T12:00:00.000Z'),
              permissions,
              sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
              userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
            }),
        },
        secureCookies: false,
        users: emptyUsers,
        version: 'test',
      });
    }

    const cookie = 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars';

    it('lists events with audit.read and denies without it', async () => {
      const listEvents = vi.fn(() => Promise.resolve({ items: [], nextBefore: null }));
      const app = buildAuditApp({ listEvents }, ['audit.read']);

      const response = await app.request('/api/v1/audit', { headers: { cookie } });
      expect(response.status).toBe(200);

      const denied = buildAuditApp({ listEvents: vi.fn() }, []);
      const deniedResponse = await denied.request('/api/v1/audit', { headers: { cookie } });
      expect(deniedResponse.status).toBe(403);
    });

    it('passes query filters through to the service', async () => {
      const listEvents = vi.fn(() => Promise.resolve({ items: [], nextBefore: null }));
      const app = buildAuditApp({ listEvents }, ['audit.read']);

      await app.request('/api/v1/audit?entityType=order&entityId=order-1&limit=10', {
        headers: { cookie },
      });

      expect(listEvents).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: 'order-1', entityType: 'order', limit: 10 }),
      );
    });

    it('rejects an invalid query', async () => {
      const app = buildAuditApp({ listEvents: vi.fn() }, ['audit.read']);

      const response = await app.request('/api/v1/audit?limit=abc', { headers: { cookie } });

      expect(response.status).toBe(400);
    });

    it('lists facets with audit.read and denies without it', async () => {
      const listFacets = vi.fn(() => Promise.resolve({ actions: [], entityTypes: [] }));
      const app = buildAuditApp({ listFacets }, ['audit.read']);

      const response = await app.request('/api/v1/audit/facets', { headers: { cookie } });
      expect(response.status).toBe(200);

      const denied = buildAuditApp({ listFacets: vi.fn() }, []);
      const deniedResponse = await denied.request('/api/v1/audit/facets', { headers: { cookie } });
      expect(deniedResponse.status).toBe(403);
    });
  });
});
