import { describe, expect, it, vi } from 'vitest';

import { hashPassword } from './password.js';
import {
  PasswordCredentialService,
  type PasswordCredentialRepository,
} from './password-credential-service.js';

describe('PasswordCredentialService', () => {
  it('authenticates an active, unlocked credential and resets failures', async () => {
    const recordSuccess = vi.fn<PasswordCredentialRepository['recordSuccess']>();
    const passwordHash = await hashPassword('a-strong-temporary-password');
    const service = new PasswordCredentialService({
      findActiveByEmail: vi.fn(() =>
        Promise.resolve({ failedAttempts: 2, lockedUntil: null, passwordHash, userId: 'user-id' }),
      ),
      recordFailure: vi.fn(),
      recordSuccess,
    });

    await expect(
      service.authenticate('  USER@Example.COM ', 'a-strong-temporary-password'),
    ).resolves.toBe('user-id');
    expect(recordSuccess).toHaveBeenCalledWith('user-id');
  });

  it('locks a credential after five consecutive failures', async () => {
    const recordFailure = vi.fn<PasswordCredentialRepository['recordFailure']>();
    const passwordHash = await hashPassword('a-strong-temporary-password');
    const service = new PasswordCredentialService(
      {
        findActiveByEmail: vi.fn(() =>
          Promise.resolve({
            failedAttempts: 4,
            lockedUntil: null,
            passwordHash,
            userId: 'user-id',
          }),
        ),
        recordFailure,
        recordSuccess: vi.fn(),
      },
      () => new Date('2026-08-17T12:00:00.000Z'),
    );

    await expect(service.authenticate('user@example.com', 'wrong-password')).resolves.toBeNull();
    expect(recordFailure).toHaveBeenCalledWith('user-id', 5, new Date('2026-08-17T12:15:00.000Z'));
  });
});
