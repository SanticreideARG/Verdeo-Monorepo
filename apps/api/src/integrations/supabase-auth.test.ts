import { describe, expect, it, vi } from 'vitest';

import { SupabaseAuthClient } from './supabase-auth.js';

describe('SupabaseAuthClient', () => {
  it('returns a verified identity from the Supabase user endpoint', async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            email: 'Santi.Creide@gmail.com',
            email_confirmed_at: '2026-08-19T12:00:00.000Z',
            id: '55276601-ec66-4f63-9f2f-edf73904ede0',
          }),
          { status: 200 },
        ),
      ),
    );
    const client = new SupabaseAuthClient(
      'https://project-ref.supabase.co/',
      'sb_publishable_test-key-long-enough',
      fetcher,
    );

    await expect(client.verifyAccessToken('a-valid-access-token')).resolves.toEqual({
      email: 'Santi.Creide@gmail.com',
      providerSubject: '55276601-ec66-4f63-9f2f-edf73904ede0',
    });
    const request = fetcher.mock.calls[0];
    expect(request?.[0]).toBe('https://project-ref.supabase.co/auth/v1/user');
    const headers = new Headers(request?.[1]?.headers);
    expect(headers.get('apikey')).toBe('sb_publishable_test-key-long-enough');
    expect(headers.get('authorization')).toBe('Bearer a-valid-access-token');
  });

  it('rejects users whose email is not confirmed', async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            email: 'staff@example.com',
            email_confirmed_at: null,
            id: '55276601-ec66-4f63-9f2f-edf73904ede0',
          }),
          { status: 200 },
        ),
      ),
    );
    const client = new SupabaseAuthClient(
      'https://project-ref.supabase.co',
      'sb_publishable_test-key-long-enough',
      fetcher,
    );

    await expect(client.verifyAccessToken('an-unconfirmed-access-token')).resolves.toBeNull();
  });

  it('returns null for tokens rejected by Supabase', async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response(null, { status: 401 })));
    const client = new SupabaseAuthClient(
      'https://project-ref.supabase.co',
      'sb_publishable_test-key-long-enough',
      fetcher,
    );

    await expect(client.verifyAccessToken('an-invalid-access-token')).resolves.toBeNull();
  });
});
