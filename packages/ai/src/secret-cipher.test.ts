import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { decryptSecret, encryptSecret, maskSecret } from './secret-cipher.js';

describe('AI configuration secret cipher', () => {
  it('round-trips a secret without including it in the ciphertext', () => {
    const key = randomBytes(32).toString('base64');
    const encrypted = encryptSecret('provider-secret-value', key);

    expect(encrypted).not.toContain('provider-secret-value');
    expect(decryptSecret(encrypted, key)).toBe('provider-secret-value');
    expect(maskSecret('alue')).toBe('••••••••alue');
  });

  it('rejects invalid encryption keys', () => {
    expect(() => encryptSecret('secret', Buffer.from('short').toString('base64'))).toThrow(
      /32 bytes/,
    );
  });
});
