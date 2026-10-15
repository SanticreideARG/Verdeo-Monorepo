import { describe, expect, it, vi } from 'vitest';

import { createLogger } from '@verdeo/observability';

import { createApp } from './app.js';

const SEDE = '90000000-0000-4000-8000-000000000001';
const ADDRESS = '70000000-0000-4000-8000-000000000002';
const CUSTOMER = '70000000-0000-4000-8000-000000000003';
const USER = '55276601-ec66-4f63-9f2f-edf73904ede0';
const cookie = 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars';

function buildApp(operations: unknown, permissions: string[]) {
  return createApp({
    appOrigin: 'http://localhost:5173',
    cookieSameSite: 'Lax',
    credentials: { login: () => Promise.resolve(null) },
    geography: {
      resolveScope: vi.fn(() =>
        Promise.resolve({ canSelectGlobal: true, defaultSiteId: SEDE, sites: [{ id: SEDE }] }),
      ),
    } as never,
    logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
    operations: operations as never,
    secureCookies: false,
    sessions: {
      authenticate: () =>
        Promise.resolve({
          expiresAt: new Date('2026-12-31T12:00:00.000Z'),
          permissions,
          sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
          userId: USER,
        }),
      listForUser: () => Promise.resolve([]),
      revoke: () => Promise.resolve(),
      revokeOwned: () => Promise.resolve(false),
    },
    users: {
      findById: (id: string) => Promise.resolve({ displayName: 'Santiago', id }),
      findProfileById: (id: string) =>
        Promise.resolve({ avatarUrl: null, displayName: 'Santiago', email: null, id }),
      list: () => Promise.resolve({ items: [], nextCursor: null }),
      updateProfile: (id: string) =>
        Promise.resolve({ avatarUrl: null, displayName: 'Santiago', email: null, id }),
    },
    version: 'test',
  });
}

const ADMIN = ['customers.read', 'customers.edit', 'customers.view_sensitive'];

describe('asistente de ubicaciones', () => {
  it('lista los pendientes con la ciudad del alcance, y sólo con permiso de datos sensibles', async () => {
    const listUnlocatedAddresses = vi.fn(() =>
      Promise.resolve({ items: [], located: 3, total: 4 }),
    );
    const app = buildApp({ listUnlocatedAddresses }, ADMIN);
    const response = await app.request('/api/v1/address-locations/pending', {
      headers: { cookie, 'x-verdeo-site': SEDE },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], located: 3, total: 4 });

    const denied = buildApp({ listUnlocatedAddresses }, ['customers.read', 'customers.edit']);
    expect(
      (await denied.request('/api/v1/address-locations/pending', { headers: { cookie } })).status,
    ).toBe(403);
  });

  it('ubica con la dirección corregida o con las coordenadas pegadas', async () => {
    const locateCustomerAddress = vi.fn(() => Promise.resolve({ status: 'located' }));
    const app = buildApp({ locateCustomerAddress }, ADMIN);
    const post = (body: unknown) =>
      app.request(`/api/v1/address-locations/${ADDRESS}/locate`, {
        body: JSON.stringify(body),
        headers: { cookie, 'content-type': 'application/json' },
        method: 'POST',
      });

    expect((await post({ customerId: CUSTOMER })).status).toBe(200);
    expect(locateCustomerAddress).toHaveBeenLastCalledWith(
      CUSTOMER,
      ADDRESS,
      expect.anything(),
      expect.objectContaining({ actorUserId: USER }),
      undefined,
    );

    await post({ customerId: CUSTOMER, location: '-34.58, -58.41' });
    expect(locateCustomerAddress).toHaveBeenLastCalledWith(
      CUSTOMER,
      ADDRESS,
      expect.anything(),
      expect.anything(),
      {
        address: undefined,
        locationUrl: 'https://www.google.com/maps/search/?api=1&query=-34.58,-58.41',
      },
    );

    expect((await post({ customerId: CUSTOMER, location: 'cualquier cosa' })).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });
});
