import { describe, expect, it, vi } from 'vitest';

import { ChatContactListResponseSchema } from '@verdeo/contracts';
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

const ME = '55276601-ec66-4f63-9f2f-edf73904ede0';
const OTHER = '20000000-0000-4000-8000-000000000002';
const CONVERSATION = '30000000-0000-4000-8000-000000000001';

function chatStubs() {
  return {
    heartbeat: vi
      .fn<(userId: string, status: string | undefined) => Promise<unknown>>()
      .mockResolvedValue({ connected: true, status: 'available', statusMessage: null, userId: ME }),
    listContacts: vi
      .fn<(userId: string) => Promise<unknown>>()
      .mockResolvedValue([{ displayName: 'Tamara', id: OTHER }]),
    listConversations: vi.fn<(userId: string) => Promise<unknown>>().mockResolvedValue([]),
    listPresence: vi
      .fn<(userId: string) => Promise<unknown>>()
      .mockResolvedValue([
        { connected: true, status: 'available', statusMessage: null, userId: ME },
      ]),
    listPresenceStatuses: vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValue([{ displayName: 'Disponible', key: 'available', reachable: true }]),
    listLinks: vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ roleLinks: [], roles: [], userLinks: [] }),
    listMessages: vi
      .fn<(conversationId: string, userId: string, input: unknown) => Promise<unknown>>()
      .mockResolvedValue([]),
    markRead: vi
      .fn<(conversationId: string, userId: string) => Promise<void>>()
      .mockResolvedValue(),
    openDirectConversation: vi
      .fn<(otherUserId: string, context: unknown) => Promise<unknown>>()
      .mockResolvedValue({ id: CONVERSATION }),
    purgeExpiredMessages: vi
      .fn<(retentionDays: number, context: unknown) => Promise<{ cutoff: Date; removed: number }>>()
      .mockResolvedValue({ cutoff: new Date('2026-07-23T00:00:00.000Z'), removed: 0 }),
    removeUserLink: vi
      .fn<(linkId: string, context: unknown) => Promise<void>>()
      .mockResolvedValue(),
    sendMessage: vi
      .fn<(conversationId: string, body: string, context: unknown) => Promise<unknown>>()
      .mockResolvedValue({
        authorDisplayName: null,
        authorUserId: ME,
        body: 'hola',
        createdAt: new Date('2026-08-22T12:00:00.000Z'),
        deletedAt: null,
        editedAt: null,
        id: '40000000-0000-4000-8000-000000000001',
        kind: 'text',
      }),
    setRoleLink: vi
      .fn<(input: unknown, context: unknown) => Promise<unknown>>()
      .mockResolvedValue({}),
    setUserLink: vi
      .fn<(input: unknown, context: unknown) => Promise<unknown>>()
      .mockResolvedValue({}),
  };
}

function chatApp(permissions: string[], chat: ReturnType<typeof chatStubs>) {
  return createApp({
    appOrigin: 'http://localhost:5173',
    chat,
    cookieSameSite: 'Lax',
    credentials: emptyCredentials,
    logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
    sessions: {
      ...emptySessions,
      authenticate: () =>
        Promise.resolve({
          expiresAt: new Date('2026-08-23T12:00:00.000Z'),
          permissions,
          sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
          userId: ME,
        }),
    },
    secureCookies: false,
    users: emptyUsers,
    version: 'test',
  });
}

describe('internal chat access', () => {
  it('does not expose contacts without authentication', async () => {
    const chat = chatStubs();

    expect((await chatApp([], chat).request('/api/v1/chat/contacts')).status).toBe(401);
    expect(chat.listContacts).not.toHaveBeenCalled();
  });

  it('denies chat to a session without chat.use', async () => {
    const chat = chatStubs();

    const response = await chatApp(['customers.read'], chat).request('/api/v1/chat/contacts', {
      headers: sessionCookie,
    });

    expect(response.status).toBe(403);
    expect(chat.listContacts).not.toHaveBeenCalled();
  });

  it('lists contacts for the session user, never an arbitrary one', async () => {
    const chat = chatStubs();

    const response = await chatApp(['chat.use'], chat).request('/api/v1/chat/contacts', {
      headers: sessionCookie,
    });
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(ChatContactListResponseSchema.parse(body).items[0]?.displayName).toBe('Tamara');
    // The user is taken from the session, so it cannot be spoofed by a query parameter.
    expect(chat.listContacts).toHaveBeenCalledWith(ME);
  });

  it('does not let chat.use configure who talks to whom', async () => {
    const chat = chatStubs();

    const response = await chatApp(['chat.use'], chat).request('/api/v1/chat/links', {
      headers: sessionCookie,
    });

    expect(response.status).toBe(403);
    expect(chat.listLinks).not.toHaveBeenCalled();
  });

  it('lets chat.links.manage read the policy', async () => {
    const chat = chatStubs();

    const response = await chatApp(['chat.links.manage'], chat).request('/api/v1/chat/links', {
      headers: sessionCookie,
    });

    expect(response.status).toBe(200);
    expect(chat.listLinks).toHaveBeenCalled();
  });

  it('does not let managing the policy grant the chat itself', async () => {
    const chat = chatStubs();

    const response = await chatApp(['chat.links.manage'], chat).request('/api/v1/chat/contacts', {
      headers: sessionCookie,
    });

    // Configuring who may talk is not the same as taking part.
    expect(response.status).toBe(403);
  });

  it('rejects an exception between a person and themselves', async () => {
    const chat = chatStubs();

    const response = await chatApp(['chat.links.manage'], chat).request(
      '/api/v1/chat/links/users',
      {
        body: JSON.stringify({ effect: 'deny', userAId: ME, userBId: ME }),
        headers: jsonHeaders,
        method: 'PUT',
      },
    );

    expect(response.status).toBe(400);
    expect(chat.setUserLink).not.toHaveBeenCalled();
  });

  it('rejects an unknown link effect', async () => {
    const chat = chatStubs();

    const response = await chatApp(['chat.links.manage'], chat).request(
      '/api/v1/chat/links/users',
      {
        body: JSON.stringify({ effect: 'maybe', userAId: ME, userBId: OTHER }),
        headers: jsonHeaders,
        method: 'PUT',
      },
    );

    expect(response.status).toBe(400);
    expect(chat.setUserLink).not.toHaveBeenCalled();
  });

  it('turns a policy refusal into 403 rather than a server error', async () => {
    const chat = chatStubs();
    chat.openDirectConversation = vi.fn(() => {
      const error = new Error('No tenés habilitada una conversación con esa persona.');
      error.name = 'ChatForbiddenError';
      return Promise.reject(error);
    });

    const response = await chatApp(['chat.use'], chat).request('/api/v1/chat/conversations', {
      body: JSON.stringify({ userId: OTHER }),
      headers: jsonHeaders,
      method: 'POST',
    });

    expect(response.status).toBe(403);
  });

  it('reports a conversation the user cannot see as missing', async () => {
    const chat = chatStubs();
    chat.listMessages = vi.fn(() => {
      const error = new Error('La conversación no existe.');
      error.name = 'ChatNotFoundError';
      return Promise.reject(error);
    });

    const response = await chatApp(['chat.use'], chat).request(
      `/api/v1/chat/conversations/${CONVERSATION}/messages`,
      { headers: sessionCookie },
    );

    // Never 403 here: that would confirm the conversation exists.
    expect(response.status).toBe(404);
  });

  it('sends a message as the session user', async () => {
    const chat = chatStubs();

    const response = await chatApp(['chat.use'], chat).request(
      `/api/v1/chat/conversations/${CONVERSATION}/messages`,
      { body: JSON.stringify({ body: 'hola' }), headers: jsonHeaders, method: 'POST' },
    );

    expect(response.status).toBe(201);
    expect(chat.sendMessage.mock.calls[0]?.[2]).toMatchObject({ actorUserId: ME });
  });

  it('refuses an empty message', async () => {
    const chat = chatStubs();

    const response = await chatApp(['chat.use'], chat).request(
      `/api/v1/chat/conversations/${CONVERSATION}/messages`,
      { body: JSON.stringify({ body: '   ' }), headers: jsonHeaders, method: 'POST' },
    );

    expect(response.status).toBe(400);
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });
});

describe('chat retention endpoint', () => {
  it('refuses every caller when no cron secret is configured', async () => {
    const chat = chatStubs();

    const response = await chatApp(['chat.links.manage'], chat).request(
      '/api/v1/cron/chat-retention',
      { headers: { authorization: 'Bearer whatever' }, method: 'POST' },
    );

    // A purge nobody can trigger beats one anybody can.
    expect(response.status).toBe(403);
    expect(chat.purgeExpiredMessages).not.toHaveBeenCalled();
  });

  it('refuses a wrong secret and accepts the configured one', async () => {
    const chat = chatStubs();
    const app = createApp({
      appOrigin: 'http://localhost:5173',
      chat,
      chatRetentionDays: 30,
      cookieSameSite: 'Lax',
      credentials: emptyCredentials,
      cronSecret: 'a-long-enough-cron-secret',
      logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
      sessions: emptySessions,
      secureCookies: false,
      users: emptyUsers,
      version: 'test',
    });

    const wrong = await app.request('/api/v1/cron/chat-retention', {
      headers: { authorization: 'Bearer not-the-secret' },
      method: 'POST',
    });
    expect(wrong.status).toBe(403);

    // No session cookie: the job authenticates as itself, not as a person.
    const right = await app.request('/api/v1/cron/chat-retention', {
      headers: { authorization: 'Bearer a-long-enough-cron-secret' },
      method: 'POST',
    });
    expect(right.status).toBe(200);
    expect(chat.purgeExpiredMessages).toHaveBeenCalledWith(
      30,
      expect.objectContaining({ source: 'cron' }),
    );
  });
});

describe('chat presence', () => {
  it('records a heartbeat for the session user, never an arbitrary one', async () => {
    const chat = chatStubs();

    const response = await chatApp(['chat.use'], chat).request('/api/v1/chat/presence/heartbeat', {
      body: JSON.stringify({ status: 'busy' }),
      headers: jsonHeaders,
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(chat.heartbeat).toHaveBeenCalledWith(ME, 'busy');
  });

  it('accepts a plain beat with no declared status', async () => {
    const chat = chatStubs();

    const response = await chatApp(['chat.use'], chat).request('/api/v1/chat/presence/heartbeat', {
      headers: jsonHeaders,
      method: 'POST',
    });

    // Undefined, not a default: a beat must not silently reset what the person declared.
    expect(response.status).toBe(200);
    expect(chat.heartbeat).toHaveBeenCalledWith(ME, undefined);
  });

  it('denies presence to a session without chat.presence.read', async () => {
    const chat = chatStubs();

    const response = await chatApp(['chat.use'], chat).request('/api/v1/chat/presence', {
      headers: sessionCookie,
    });

    expect(response.status).toBe(403);
    expect(chat.listPresence).not.toHaveBeenCalled();
  });

  it('returns presence for the session user with chat.presence.read', async () => {
    const chat = chatStubs();

    const response = await chatApp(['chat.presence.read'], chat).request('/api/v1/chat/presence', {
      headers: sessionCookie,
    });

    expect(response.status).toBe(200);
    expect(chat.listPresence).toHaveBeenCalledWith(ME);
  });

  it('turns an unknown status into a conflict rather than a server error', async () => {
    const chat = chatStubs();
    chat.heartbeat = vi.fn(() => {
      const error = new Error('Ese estado no está disponible.');
      error.name = 'ChatConflictError';
      return Promise.reject(error);
    });

    const response = await chatApp(['chat.use'], chat).request('/api/v1/chat/presence/heartbeat', {
      body: JSON.stringify({ status: 'inventado' }),
      headers: jsonHeaders,
      method: 'POST',
    });

    expect(response.status).toBe(409);
  });
});
