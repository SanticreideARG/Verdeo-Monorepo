import { describe, expect, it } from 'vitest';

import { parseServerEnv } from './server-env.js';

describe('parseServerEnv', () => {
  it('applies safe operational defaults', () => {
    const config = parseServerEnv({
      DATABASE_URL: 'postgresql://localhost/verdeo',
      SESSION_SECRET: 'a-secure-session-secret-with-32-chars',
    });

    expect(config.SYSTEM_CURRENCY).toBe('ARS');
    expect(config.SYSTEM_TIMEZONE).toBe('America/Argentina/Buenos_Aires');
  });

  it('rejects short session secrets', () => {
    expect(() =>
      parseServerEnv({ DATABASE_URL: 'postgresql://localhost/verdeo', SESSION_SECRET: 'short' }),
    ).toThrow();
  });

  it('rejects invalid AI configuration encryption keys', () => {
    expect(() =>
      parseServerEnv({
        AI_CONFIG_ENCRYPTION_KEY: Buffer.from('short').toString('base64'),
        DATABASE_URL: 'postgresql://localhost/verdeo',
        SESSION_SECRET: 'a-secure-session-secret-with-32-chars',
      }),
    ).toThrow(/AI_CONFIG_ENCRYPTION_KEY/);
  });

  it('accepts a complete optional Supabase configuration', () => {
    const config = parseServerEnv({
      DATABASE_URL: 'postgresql://localhost/verdeo',
      SESSION_SECRET: 'a-secure-session-secret-with-32-chars',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_a-valid-public-key',
      SUPABASE_URL: 'https://project-ref.supabase.co',
    });

    expect(config.SUPABASE_URL).toBe('https://project-ref.supabase.co');
  });

  it('rejects a partial Supabase configuration', () => {
    expect(() =>
      parseServerEnv({
        DATABASE_URL: 'postgresql://localhost/verdeo',
        SESSION_SECRET: 'a-secure-session-secret-with-32-chars',
        SUPABASE_URL: 'https://project-ref.supabase.co',
      }),
    ).toThrow(/SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY/);
  });
});
