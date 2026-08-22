import { describe, expect, it, vi } from 'vitest';

import { MenuDistributionResponseSchema } from '@verdeo/contracts';
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
  list: () => Promise.resolve({ items: [], nextCursor: null }),
};
const emptyCredentials = { login: () => Promise.resolve(null) };

const sessionCookie = {
  cookie: 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars',
};
const jsonHeaders = { ...sessionCookie, 'content-type': 'application/json' };

const MENU_ID = '20000000-0000-4000-8000-000000000001';
const NEUQUEN = '90000000-0000-4000-8000-000000000001';
const BARILOCHE = '90000000-0000-4000-8000-000000000002';

function distributionApp(permissions: string[]) {
  const distributeMenu = vi
    .fn<(menuId: string, input: unknown, context: unknown) => Promise<unknown>>()
    .mockResolvedValue([{ operatingSiteId: NEUQUEN, outcome: 'CREATED', weeklyMenuId: MENU_ID }]);

  const app = createApp({
    appOrigin: 'http://localhost:5173',
    cookieSameSite: 'Lax',
    credentials: emptyCredentials,
    logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
    operations: { distributeMenu } as unknown as NonNullable<
      Parameters<typeof createApp>[0]['operations']
    >,
    sessions: {
      ...emptySessions,
      authenticate: () =>
        Promise.resolve({
          expiresAt: new Date('2026-08-22T12:00:00.000Z'),
          permissions,
          sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
          userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
        }),
    },
    secureCookies: false,
    users: emptyUsers,
    version: 'test',
  });

  return { app, distributeMenu };
}

describe('Weekly menu distribution', () => {
  it('denies distribution without menus.distribute', async () => {
    const { app, distributeMenu } = distributionApp(['production.generate']);

    const response = await app.request(`/api/v1/menus/${MENU_ID}/distribute`, {
      body: JSON.stringify({ mode: 'CREATE_MISSING', operatingSiteIds: [NEUQUEN] }),
      headers: jsonHeaders,
      method: 'POST',
    });

    expect(response.status).toBe(403);
    expect(distributeMenu).not.toHaveBeenCalled();
  });

  it('distributes to the selected operations', async () => {
    const { app, distributeMenu } = distributionApp(['menus.distribute']);

    const response = await app.request(`/api/v1/menus/${MENU_ID}/distribute`, {
      body: JSON.stringify({ mode: 'CREATE_MISSING', operatingSiteIds: [NEUQUEN, BARILOCHE] }),
      headers: jsonHeaders,
      method: 'POST',
    });
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(MenuDistributionResponseSchema.parse(body).results[0]?.outcome).toBe('CREATED');
    expect(distributeMenu.mock.calls[0]?.[1]).toMatchObject({
      mode: 'CREATE_MISSING',
      operatingSiteIds: [NEUQUEN, BARILOCHE],
    });
  });

  it('rejects a replace that carries no explicit confirmation', async () => {
    const { app, distributeMenu } = distributionApp([
      'menus.distribute',
      'menus.distribute_replace',
    ]);

    const response = await app.request(`/api/v1/menus/${MENU_ID}/distribute`, {
      body: JSON.stringify({ mode: 'REPLACE', operatingSiteIds: [NEUQUEN] }),
      headers: jsonHeaders,
      method: 'POST',
    });

    // Overwriting regional customisations is never the default reading of a request.
    expect(response.status).toBe(400);
    expect(distributeMenu).not.toHaveBeenCalled();
  });

  it('does not let plain distribution permission perform a replace', async () => {
    const { app, distributeMenu } = distributionApp(['menus.distribute']);

    const response = await app.request(`/api/v1/menus/${MENU_ID}/distribute`, {
      body: JSON.stringify({
        confirmedReplace: true,
        mode: 'REPLACE',
        operatingSiteIds: [NEUQUEN],
      }),
      headers: jsonHeaders,
      method: 'POST',
    });

    // Replacing is a separate grant, not a stronger flag on the same one.
    expect(response.status).toBe(403);
    expect(distributeMenu).not.toHaveBeenCalled();
  });

  it('allows a confirmed replace to the operator who holds the replace grant', async () => {
    const { app, distributeMenu } = distributionApp([
      'menus.distribute',
      'menus.distribute_replace',
    ]);

    const response = await app.request(`/api/v1/menus/${MENU_ID}/distribute`, {
      body: JSON.stringify({
        confirmedReplace: true,
        mode: 'REPLACE',
        operatingSiteIds: [NEUQUEN],
      }),
      headers: jsonHeaders,
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(distributeMenu.mock.calls[0]?.[1]).toMatchObject({
      confirmedReplace: true,
      mode: 'REPLACE',
    });
  });

  it('rejects an unknown distribution mode', async () => {
    const { app, distributeMenu } = distributionApp(['menus.distribute']);

    const response = await app.request(`/api/v1/menus/${MENU_ID}/distribute`, {
      body: JSON.stringify({ mode: 'MERGE', operatingSiteIds: [NEUQUEN] }),
      headers: jsonHeaders,
      method: 'POST',
    });

    expect(response.status).toBe(400);
    expect(distributeMenu).not.toHaveBeenCalled();
  });
});
