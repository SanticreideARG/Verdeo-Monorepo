import { describe, expect, it } from 'vitest';

import { createRandomPassword, hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies the original password without storing it', async () => {
    const encodedHash = await hashPassword('a-strong-temporary-password');

    await expect(verifyPassword('a-strong-temporary-password', encodedHash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', encodedHash)).resolves.toBe(false);
    expect(encodedHash).not.toContain('a-strong-temporary-password');
  });

  it('creates high-entropy provisioning passwords', () => {
    expect(createRandomPassword()).toHaveLength(32);
  });
});
