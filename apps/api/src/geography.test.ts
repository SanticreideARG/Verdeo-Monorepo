import { describe, expect, it, vi } from 'vitest';

import { OperatingSiteListResponseSchema } from '@verdeo/contracts';
import { createLogger } from '@verdeo/observability';

import { createApp } from './app.js';

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

const sampleSite = {
  active: true,
  coverImageUrl: null,
  createdAt: new Date('2026-08-17T10:00:00.000Z'),
  displayName: 'Neuquén',
  id: '90000000-0000-4000-8000-000000000001',
  orderPrefix: 'NQN',
  publicEmail: null,
  publicPhone: null,
  publicWhatsapp: null,
  slug: 'neuquen',
  sortOrder: 0,
  timezone: 'America/Argentina/Buenos_Aires',
  updatedAt: new Date('2026-08-17T10:00:00.000Z'),
  zoneCount: 2,
};

const sampleZone = {
  active: true,
  coverImageUrl: null,
  coverageDescription: 'Centro y alrededores',
  createdAt: new Date('2026-08-17T10:00:00.000Z'),
  displayName: 'Centro',
  id: '90000000-0000-4000-8000-000000000002',
  managerName: null,
  operatingSiteId: sampleSite.id,
  publicPhoneOverride: null,
  publicWhatsappOverride: null,
  slug: 'centro',
  sortOrder: 0,
  updatedAt: new Date('2026-08-17T10:00:00.000Z'),
};

interface ResolvedScope {
  canSelectGlobal: boolean;
  defaultSiteId: string | null;
  sites: readonly { id: string }[];
}

const scopeSite = {
  active: true,
  displayName: sampleSite.displayName,
  id: sampleSite.id,
  orderPrefix: sampleSite.orderPrefix,
  slug: sampleSite.slug,
  timezone: sampleSite.timezone,
};

function geographyStubs() {
  return {
    createSite: vi
      .fn<(input: unknown, context: unknown) => Promise<unknown>>()
      .mockResolvedValue(sampleSite),
    createZone: vi
      .fn<(input: unknown, context: unknown) => Promise<unknown>>()
      .mockResolvedValue(sampleZone),
    listSites: vi.fn<() => Promise<unknown>>().mockResolvedValue([sampleSite]),
    resolveScope: vi
      .fn<(userId: string, canAccessAllSites: boolean) => Promise<ResolvedScope>>()
      .mockResolvedValue({
        canSelectGlobal: false,
        defaultSiteId: scopeSite.id,
        sites: [scopeSite],
      }),
    listActiveZones: vi.fn(() => Promise.resolve([])),
    listZones: vi
      .fn<(operatingSiteId: string) => Promise<unknown>>()
      .mockResolvedValue([sampleZone]),
    updateSite: vi
      .fn<(id: string, input: unknown, context: unknown) => Promise<unknown>>()
      .mockResolvedValue(sampleSite),
    updateZone: vi
      .fn<(id: string, input: unknown, context: unknown) => Promise<unknown>>()
      .mockResolvedValue(sampleZone),
  };
}

function geographyApp(permissions: string[], geography: ReturnType<typeof geographyStubs>) {
  return createApp({
    appOrigin: 'http://localhost:5173',
    cookieSameSite: 'Lax',
    credentials: emptyCredentials,
    geography,
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

function rejectingStub<T extends (...args: never[]) => Promise<unknown>>(
  name: string,
  message: string,
) {
  const error = new Error(message);
  error.name = name;
  return vi.fn<T>().mockRejectedValue(error);
}

describe('Operating sites and geographic zones', () => {
  it('does not list operating sites without authentication', async () => {
    const geography = geographyStubs();
    const response = await geographyApp([], geography).request('/api/v1/operating-sites');

    expect(response.status).toBe(401);
    expect(geography.listSites).not.toHaveBeenCalled();
  });

  it('denies reading operating sites without sites.read', async () => {
    const geography = geographyStubs();
    const response = await geographyApp(['customers.read'], geography).request(
      '/api/v1/operating-sites',
      { headers: sessionCookie },
    );

    expect(response.status).toBe(403);
    expect(geography.listSites).not.toHaveBeenCalled();
  });

  it('lists contract-valid operating sites with sites.read', async () => {
    const geography = geographyStubs();
    const response = await geographyApp(['sites.read'], geography).request(
      '/api/v1/operating-sites',
      { headers: sessionCookie },
    );
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(OperatingSiteListResponseSchema.parse(body).items[0]?.orderPrefix).toBe('NQN');
  });

  it('does not let sites.read create an operating site', async () => {
    const geography = geographyStubs();
    const response = await geographyApp(['sites.read'], geography).request(
      '/api/v1/operating-sites',
      {
        body: JSON.stringify({ displayName: 'Bariloche', orderPrefix: 'BRC', slug: 'bariloche' }),
        headers: { ...sessionCookie, 'content-type': 'application/json' },
        method: 'POST',
      },
    );

    expect(response.status).toBe(403);
    expect(geography.createSite).not.toHaveBeenCalled();
  });

  it('rejects an operating site whose slug is not a valid identifier', async () => {
    const geography = geographyStubs();
    const response = await geographyApp(['sites.manage'], geography).request(
      '/api/v1/operating-sites',
      {
        body: JSON.stringify({ displayName: 'Bariloche', orderPrefix: 'BRC', slug: 'San Carlos' }),
        headers: { ...sessionCookie, 'content-type': 'application/json' },
        method: 'POST',
      },
    );

    expect(response.status).toBe(400);
    expect(geography.createSite).not.toHaveBeenCalled();
  });

  it('normalizes the order prefix before it reaches the domain service', async () => {
    const geography = geographyStubs();
    const response = await geographyApp(['sites.manage'], geography).request(
      '/api/v1/operating-sites',
      {
        body: JSON.stringify({ displayName: 'Neuquén', orderPrefix: 'nqn', slug: 'neuquen' }),
        headers: { ...sessionCookie, 'content-type': 'application/json' },
        method: 'POST',
      },
    );

    expect(response.status).toBe(201);
    expect(geography.createSite.mock.calls[0]?.[0]).toMatchObject({ orderPrefix: 'NQN' });
  });

  it('takes the zone owner from the route and not from the request body', async () => {
    const geography = geographyStubs();
    const response = await geographyApp(['zones.manage'], geography).request(
      `/api/v1/operating-sites/${sampleSite.id}/zones`,
      {
        body: JSON.stringify({
          displayName: 'Centro',
          operatingSiteId: '90000000-0000-4000-8000-0000000000ff',
          slug: 'centro',
        }),
        headers: { ...sessionCookie, 'content-type': 'application/json' },
        method: 'POST',
      },
    );

    expect(response.status).toBe(201);
    expect(geography.createZone.mock.calls[0]?.[0]).toMatchObject({
      operatingSiteId: sampleSite.id,
    });
  });

  it('denies zone creation to a session that can only manage sites', async () => {
    const geography = geographyStubs();
    const response = await geographyApp(['sites.manage'], geography).request(
      `/api/v1/operating-sites/${sampleSite.id}/zones`,
      {
        body: JSON.stringify({ displayName: 'Centro', slug: 'centro' }),
        headers: { ...sessionCookie, 'content-type': 'application/json' },
        method: 'POST',
      },
    );

    expect(response.status).toBe(403);
    expect(geography.createZone).not.toHaveBeenCalled();
  });

  it('maps a missing operating site to 404', async () => {
    const geography = geographyStubs();
    geography.listZones = rejectingStub(
      'OperatingSiteNotFoundError',
      'La operación indicada no existe.',
    );

    const response = await geographyApp(['sites.read'], geography).request(
      `/api/v1/operating-sites/${sampleSite.id}/zones`,
      { headers: sessionCookie },
    );

    expect(response.status).toBe(404);
  });

  it('maps a frozen order prefix to 409', async () => {
    const geography = geographyStubs();
    geography.updateSite = rejectingStub(
      'GeographyConflictError',
      'No se puede cambiar el prefijo: la operación ya emitió pedidos con el prefijo actual.',
    );

    const response = await geographyApp(['sites.manage'], geography).request(
      `/api/v1/operating-sites/${sampleSite.id}`,
      {
        body: JSON.stringify({ orderPrefix: 'XXX' }),
        headers: { ...sessionCookie, 'content-type': 'application/json' },
        method: 'PATCH',
      },
    );

    expect(response.status).toBe(409);
  });
});
