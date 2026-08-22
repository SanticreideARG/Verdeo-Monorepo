import { describe, expect, it, vi } from 'vitest';

import { ScopeResponseSchema } from '@verdeo/contracts';
import { createLogger } from '@verdeo/observability';

import { createApp, SITE_SCOPE_HEADER } from './app.js';

const emptySessions = {
  authenticate: () => Promise.resolve(null),
  listForUser: () => Promise.resolve([]),
  revoke: () => Promise.resolve(),
  revokeOwned: () => Promise.resolve(false),
};
const emptyUsers = {
  findById: (id: string) => Promise.resolve({ displayName: 'Santiago', id }),
  findProfileById: (id: string) =>
    Promise.resolve({ avatarUrl: null, displayName: 'Santiago', email: null, id }),
  list: () => Promise.resolve({ items: [], nextCursor: null }),
  updateProfile: (id: string) =>
    Promise.resolve({ avatarUrl: null, displayName: 'Santiago', email: null, id }),
};
const emptyCredentials = { login: () => Promise.resolve(null) };

const sessionCookie = {
  cookie: 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars',
};

const neuquen = {
  active: true,
  displayName: 'Neuquén',
  id: '90000000-0000-4000-8000-000000000001',
  orderPrefix: 'NQN',
  slug: 'neuquen',
  timezone: 'America/Argentina/Buenos_Aires',
};
const bariloche = {
  active: true,
  displayName: 'Bariloche',
  id: '90000000-0000-4000-8000-000000000002',
  orderPrefix: 'BRC',
  slug: 'bariloche',
  timezone: 'America/Argentina/Buenos_Aires',
};

interface ResolvedScope {
  canSelectGlobal: boolean;
  defaultSiteId: string | null;
  sites: readonly { id: string }[];
}

function scopedApp(
  permissions: string[],
  scope: ResolvedScope,
  listCustomers = vi.fn(),
  extraOperations: Record<string, unknown> = {},
) {
  const geography = {
    createSite: vi.fn<(input: unknown, context: unknown) => Promise<unknown>>(),
    createZone: vi.fn<(input: unknown, context: unknown) => Promise<unknown>>(),
    listSites: vi.fn<() => Promise<unknown>>().mockResolvedValue([]),
    listActiveZones: vi.fn(() => Promise.resolve([])),
    listZones: vi.fn<(operatingSiteId: string) => Promise<unknown>>().mockResolvedValue([]),
    resolveScope: vi
      .fn<(userId: string, canAccessAllSites: boolean) => Promise<ResolvedScope>>()
      .mockResolvedValue(scope),
    updateSite: vi.fn<(id: string, input: unknown, context: unknown) => Promise<unknown>>(),
    updateZone: vi.fn<(id: string, input: unknown, context: unknown) => Promise<unknown>>(),
  };

  const app = createApp({
    appOrigin: 'http://localhost:5173',
    cookieSameSite: 'Lax',
    credentials: emptyCredentials,
    geography,
    logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
    operations: {
      listCustomers,
      ...extraOperations,
    } as unknown as NonNullable<Parameters<typeof createApp>[0]['operations']>,
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

  return { app, geography, listCustomers };
}

describe('Operating scope selection', () => {
  it('does not expose the scope without authentication', async () => {
    const { app } = scopedApp([], {
      canSelectGlobal: false,
      defaultSiteId: null,
      sites: [],
    });

    expect((await app.request('/api/v1/scope')).status).toBe(401);
  });

  it('returns only the operations the session has a membership for', async () => {
    const { app } = scopedApp(['customers.read'], {
      canSelectGlobal: false,
      defaultSiteId: neuquen.id,
      sites: [neuquen],
    });

    const response = await app.request('/api/v1/scope', { headers: sessionCookie });
    const body: unknown = await response.json();
    const scope = ScopeResponseSchema.parse(body);

    expect(response.status).toBe(200);
    expect(scope.sites).toHaveLength(1);
    expect(scope.canSelectGlobal).toBe(false);
    expect(scope.defaultSiteId).toBe(neuquen.id);
  });

  it('offers the consolidated global view only with sites.access_all', async () => {
    const { app, geography } = scopedApp(['sites.access_all'], {
      canSelectGlobal: true,
      defaultSiteId: neuquen.id,
      sites: [neuquen, bariloche],
    });

    const response = await app.request('/api/v1/scope', { headers: sessionCookie });
    const scope = ScopeResponseSchema.parse(await response.json());

    expect(scope.canSelectGlobal).toBe(true);
    expect(geography.resolveScope.mock.calls[0]?.[1]).toBe(true);
  });

  it('rejects an operation the session has no membership for', async () => {
    const listCustomers = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const { app } = scopedApp(
      ['customers.read'],
      { canSelectGlobal: false, defaultSiteId: neuquen.id, sites: [neuquen] },
      listCustomers,
    );

    const response = await app.request('/api/v1/customers', {
      headers: { ...sessionCookie, [SITE_SCOPE_HEADER]: bariloche.id },
    });

    // A forbidden operation must answer 403, never an empty list (ADR-031).
    expect(response.status).toBe(403);
    expect(listCustomers).not.toHaveBeenCalled();
  });

  it('accepts an operation the session has a membership for', async () => {
    const listCustomers = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const { app } = scopedApp(
      ['customers.read'],
      { canSelectGlobal: false, defaultSiteId: neuquen.id, sites: [neuquen] },
      listCustomers,
    );

    const response = await app.request('/api/v1/customers', {
      headers: { ...sessionCookie, [SITE_SCOPE_HEADER]: neuquen.id },
    });

    expect(response.status).toBe(200);
    expect(listCustomers).toHaveBeenCalled();
  });

  it('does not let a missing header widen access to the global view', async () => {
    const listCustomers = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const { app } = scopedApp(
      ['customers.read'],
      { canSelectGlobal: false, defaultSiteId: neuquen.id, sites: [neuquen] },
      listCustomers,
    );

    const response = await app.request('/api/v1/customers', { headers: sessionCookie });

    expect(response.status).toBe(200);
    expect(listCustomers).toHaveBeenCalled();
  });

  it('rejects the global keyword for a session that cannot select it', async () => {
    const listCustomers = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const { app } = scopedApp(
      ['customers.read'],
      { canSelectGlobal: false, defaultSiteId: neuquen.id, sites: [neuquen] },
      listCustomers,
    );

    const response = await app.request('/api/v1/customers', {
      headers: { ...sessionCookie, [SITE_SCOPE_HEADER]: 'global' },
    });

    // The keyword falls back to the session's own default rather than granting the global view.
    expect(response.status).toBe(200);
    expect(listCustomers).toHaveBeenCalled();
  });
});

describe('Scope reaches the data layer', () => {
  it('passes the selected operation down to the customer query', async () => {
    const listCustomers = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const { app } = scopedApp(
      ['customers.read'],
      { canSelectGlobal: false, defaultSiteId: neuquen.id, sites: [neuquen] },
      listCustomers,
    );

    await app.request('/api/v1/customers', {
      headers: { ...sessionCookie, [SITE_SCOPE_HEADER]: neuquen.id },
    });

    expect(listCustomers.mock.calls[0]?.[0]).toMatchObject({ operatingSiteId: neuquen.id });
  });

  it('passes a null operation for the consolidated global view', async () => {
    const listCustomers = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const { app } = scopedApp(
      ['customers.read', 'sites.access_all'],
      { canSelectGlobal: true, defaultSiteId: neuquen.id, sites: [neuquen, bariloche] },
      listCustomers,
    );

    await app.request('/api/v1/customers', {
      headers: { ...sessionCookie, [SITE_SCOPE_HEADER]: 'global' },
    });

    // Null is the consolidated view; it is never a persisted operation (ADR-028).
    expect(listCustomers.mock.calls[0]?.[0]).toMatchObject({ operatingSiteId: null });
  });

  it('bounds the kitchen summary by the selected operation', async () => {
    const kitchenSummary = vi.fn().mockResolvedValue({
      base: [],
      custom: [],
      cycle: { alias: 'Semana 34', id: '10000000-0000-4000-8000-000000000001' },
      generatedAt: new Date('2026-08-21T12:00:00.000Z'),
      totalUnits: 0,
    });
    const { app } = scopedApp(
      ['production.read'],
      { canSelectGlobal: false, defaultSiteId: neuquen.id, sites: [neuquen] },
      vi.fn(),
      { kitchenSummary },
    );

    await app.request('/api/v1/production/10000000-0000-4000-8000-000000000001', {
      headers: { ...sessionCookie, [SITE_SCOPE_HEADER]: neuquen.id },
    });

    // Production is bounded by the operation: one kitchen must not cook another city's demand.
    expect(kitchenSummary).toHaveBeenCalledWith('10000000-0000-4000-8000-000000000001', neuquen.id);
  });

  it('does not let an unauthorized operation reach the kitchen query', async () => {
    const kitchenSummary = vi.fn();
    const { app } = scopedApp(
      ['production.read'],
      { canSelectGlobal: false, defaultSiteId: neuquen.id, sites: [neuquen] },
      vi.fn(),
      { kitchenSummary },
    );

    const response = await app.request('/api/v1/production/10000000-0000-4000-8000-000000000001', {
      headers: { ...sessionCookie, [SITE_SCOPE_HEADER]: bariloche.id },
    });

    expect(response.status).toBe(403);
    expect(kitchenSummary).not.toHaveBeenCalled();
  });
});
