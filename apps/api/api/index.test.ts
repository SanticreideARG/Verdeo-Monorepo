import { beforeAll, describe, expect, it, vi } from 'vitest';

let handler: { fetch(request: Request): Response | Promise<Response> };

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('LOG_LEVEL', 'silent');
  vi.stubEnv('APP_URL', 'https://preview.verdeo.example');
  vi.stubEnv('API_URL', 'https://api-preview.verdeo.example');
  vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/verdeo');
  vi.stubEnv('SESSION_SECRET', 'test-session-secret-at-least-32-characters');
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '1234567890abcdef');

  const entrypoint = await import('./index.js');
  handler = entrypoint.default;
});

describe('Vercel function entrypoint', () => {
  it('serves the Hono application without opening a Node server', async () => {
    const response = await handler.fetch(new Request('https://api-preview.verdeo.example/health'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      service: 'verdeo-api',
      status: 'ok',
      version: '1234567',
    });
  });

  it('accepts API routes through the same catch-all function', async () => {
    const response = await handler.fetch(
      new Request('https://api-preview.verdeo.example/api/v1/me'),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
    });
  });
});
