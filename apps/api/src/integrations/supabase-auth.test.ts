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

  /*
   * Escribe contra Postgres, que es lo único que Supabase cuenta como actividad.
   *
   * La versión anterior sólo leía `/auth/v1/settings` y el proyecto se pausó igual, con el cron
   * corriendo todos los días. Este caso fija el contrato que faltaba: que la petición vaya a
   * PostgREST, que sea un upsert —sin `merge-duplicates` la segunda corrida choca con la clave
   * primaria— y que toque siempre la misma fila, para que la tabla no crezca.
   */
  it('escribe una fila fija en keep_alive para que el proyecto no se pause', async () => {
    // `vi.fn<typeof fetch>`: sin la firma, `mock.calls` es `[]` y la petición no se puede mirar.
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 201 })));
    const client = new SupabaseAuthClient(
      'https://project-ref.supabase.co',
      'sb_publishable_test-key-long-enough',
      fetcher,
    );

    await expect(client.touch()).resolves.toEqual({ detail: 'HTTP 201', ok: true });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe('https://project-ref.supabase.co/rest/v1/keep_alive');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).prefer).toContain('merge-duplicates');
    expect(JSON.parse(init?.body as string)).toMatchObject({ id: 1 });
  });

  /*
   * El error de PostgREST viaja en el detalle. Sin él, "la tabla no existe" y "existe pero `anon`
   * no la puede escribir" se ven iguales desde un log, y son dos arreglos distintos.
   */
  /*
   * Las claves nuevas de Supabase no son JWT y no van como `Authorization: Bearer`; las anteriores
   * sí. No se sabe cuál tiene el proyecto, así que la escritura tiene que servir con las dos.
   */
  it('manda una clave nueva sólo como apikey y una clave JWT en las dos cabeceras', async () => {
    const llamar = async (clave: string) => {
      const fetcher = vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(null, { status: 201 })),
      );
      await new SupabaseAuthClient('https://project-ref.supabase.co', clave, fetcher).touch();
      return fetcher.mock.calls[0]?.[1]?.headers as Record<string, string>;
    };

    const nueva = await llamar('sb_publishable_test-key-long-enough');
    expect(nueva.apikey).toBe('sb_publishable_test-key-long-enough');
    expect(nueva).not.toHaveProperty('authorization');

    const jwt = await llamar('eyJhbGciOiJIUzI1NiJ9.payload.signature');
    expect(jwt.authorization).toBe('Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature');
  });

  it('informa el error de PostgREST en lugar de decir sólo que falló', async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        new Response('{"message":"relation \\"keep_alive\\" does not exist"}', { status: 404 }),
      ),
    );
    const client = new SupabaseAuthClient(
      'https://project-ref.supabase.co',
      'sb_publishable_test-key-long-enough',
      fetcher,
    );

    const result = await client.touch();
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('does not exist');
  });
});
