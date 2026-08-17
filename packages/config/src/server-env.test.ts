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
});
