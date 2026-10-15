import { describe, expect, it, vi } from 'vitest';

import { createLogger } from '@verdeo/observability';

import { createApp } from './app.js';

const SEDE = '90000000-0000-4000-8000-000000000001';
const POST = '70000000-0000-4000-8000-000000000001';
const USER = '55276601-ec66-4f63-9f2f-edf73904ede0';
const cookie = 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars';

function feedEngine() {
  return {
    createPost: vi.fn(() => Promise.resolve({ id: POST })),
    deletePost: vi.fn(() => Promise.resolve()),
    listPosts: vi.fn(() => Promise.resolve([])),
    markRead: vi.fn(() => Promise.resolve()),
    readers: vi.fn(() => Promise.resolve({ pending: [], reads: [] })),
    setPinned: vi.fn(() => Promise.resolve()),
    unreadCount: vi.fn(() => Promise.resolve(2)),
    updatePost: vi.fn(() => Promise.resolve()),
    listReplies: vi.fn(() => Promise.resolve([])),
    addReply: vi.fn(() => Promise.resolve({ id: POST })),
    deleteReply: vi.fn(() => Promise.resolve()),
    setReaction: vi.fn(() => Promise.resolve()),
    hiddenCards: vi.fn(() => Promise.resolve(['duplicados:3'])),
    setCardHidden: vi.fn(() => Promise.resolve()),
    tips: vi.fn(() => Promise.resolve([{ href: '/app/cocina', key: 'tip:x', text: 'Consejo' }])),
  };
}

function buildApp(feed: ReturnType<typeof feedEngine>, permissions: string[]) {
  return createApp({
    appOrigin: 'http://localhost:5173',
    cookieSameSite: 'Lax',
    credentials: { login: () => Promise.resolve(null) },
    feed,
    geography: {
      resolveScope: vi.fn(() =>
        Promise.resolve({ canSelectGlobal: true, defaultSiteId: SEDE, sites: [{ id: SEDE }] }),
      ),
    } as never,
    logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
    operations: {} as never,
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

const json = (body: unknown, method = 'POST') => ({
  body: JSON.stringify(body),
  headers: { cookie, 'content-type': 'application/json' },
  method,
});

describe('tablero: publicaciones', () => {
  it('lista con el alcance de la ciudad y cuántas no vio', async () => {
    const feed = feedEngine();
    const response = await buildApp(feed, ['feed.post']).request('/api/v1/feed/posts', {
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], unreadCount: 2 });
    expect(feed.listPosts).toHaveBeenCalledWith(expect.objectContaining({ viewerUserId: USER }));
  });

  it('publicar pide feed.post y pasa si puede moderar', async () => {
    const feed = feedEngine();
    const created = await buildApp(feed, ['feed.post']).request(
      '/api/v1/feed/posts',
      json({ body: 'Llegó la verdura', tag: 'aviso' }),
    );
    expect(created.status).toBe(201);
    expect(feed.createPost).toHaveBeenCalledWith(
      { body: 'Llegó la verdura', operatingSiteId: null, pinnedUntil: null, tag: 'aviso' },
      expect.objectContaining({ actorUserId: USER, canModerate: false }),
    );

    const denied = await buildApp(feedEngine(), ['orders.read']).request(
      '/api/v1/feed/posts',
      json({ body: 'Hola', tag: 'aviso' }),
    );
    expect(denied.status).toBe(403);
  });

  it('fijar pide feed.moderate', async () => {
    const pin = json({ pinnedUntil: '2026-10-30T12:00:00.000Z' }, 'PUT');
    expect(
      (await buildApp(feedEngine(), ['feed.post']).request(`/api/v1/feed/posts/${POST}/pin`, pin))
        .status,
    ).toBe(403);

    const feed = feedEngine();
    const ok = await buildApp(feed, ['feed.post', 'feed.moderate']).request(
      `/api/v1/feed/posts/${POST}/pin`,
      pin,
    );
    expect(ok.status).toBe(204);
    expect(feed.setPinned).toHaveBeenCalledWith(
      POST,
      new Date('2026-10-30T12:00:00.000Z'),
      expect.objectContaining({ canModerate: true }),
    );
  });

  it('confirmar "lo leí" marca a quien está en la sesión', async () => {
    const feed = feedEngine();
    const response = await buildApp(feed, ['feed.post']).request(
      `/api/v1/feed/posts/${POST}/read`,
      json({ acknowledge: true }),
    );
    expect(response.status).toBe(204);
    expect(feed.markRead).toHaveBeenCalledWith(POST, USER, true);
  });

  it('responder, 👍 y esconder una tarjeta van a nombre de quien está en la sesión', async () => {
    const feed = feedEngine();
    const app = buildApp(feed, ['feed.post']);

    expect(
      (await app.request(`/api/v1/feed/posts/${POST}/replies`, json({ body: 'Dale' }))).status,
    ).toBe(201);
    expect(feed.addReply).toHaveBeenCalledWith(
      POST,
      'Dale',
      expect.objectContaining({ actorUserId: USER }),
    );

    expect(
      (await app.request(`/api/v1/feed/posts/${POST}/reaction`, json({ on: true }, 'PUT'))).status,
    ).toBe(204);
    expect(feed.setReaction).toHaveBeenCalledWith(POST, USER, true);

    const hide = await app.request(
      '/api/v1/feed/cards',
      json({ cardKey: 'duplicados:3', hiddenUntil: '2026-10-17T12:00:00.000Z' }, 'PUT'),
    );
    expect(hide.status).toBe(204);
    expect(feed.setCardHidden).toHaveBeenCalledWith(
      USER,
      'duplicados:3',
      new Date('2026-10-17T12:00:00.000Z'),
    );

    const hidden = await app.request('/api/v1/feed/cards/hidden', { headers: { cookie } });
    expect(await hidden.json()).toEqual({ keys: ['duplicados:3'] });

    const tips = await app.request('/api/v1/feed/tips', { headers: { cookie } });
    expect(((await tips.json()) as { items: unknown[] }).items).toHaveLength(1);
    expect(feed.tips).toHaveBeenCalledWith(expect.objectContaining({ permissions: ['feed.post'] }));

    const unread = await app.request('/api/v1/feed/unread', { headers: { cookie } });
    expect(await unread.json()).toEqual({ count: 2 });
  });

  it('una publicación ajena devuelve 403 en español', async () => {
    const feed = feedEngine();
    feed.updatePost.mockImplementation(() => {
      const error = new Error('Sólo podés cambiar tus publicaciones.');
      error.name = 'FeedForbiddenError';
      return Promise.reject(error);
    });
    const response = await buildApp(feed, ['feed.post']).request(
      `/api/v1/feed/posts/${POST}`,
      json({ body: 'Otra cosa' }, 'PATCH'),
    );
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { message: string } }).error.message).toBe(
      'Sólo podés cambiar tus publicaciones.',
    );
  });
});
