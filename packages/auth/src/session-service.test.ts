import { describe, expect, it, vi } from 'vitest';

import { SessionService } from './session-service.js';
import { hashSessionToken } from './session-token.js';
import type { SessionRepository } from './types.js';

const token = 'valid-session-token-that-is-longer-than-32-characters';

describe('SessionService', () => {
  it('returns an active session without exposing its token hash', async () => {
    const touch = vi.fn<SessionRepository['touch']>();
    const findByTokenHash = vi.fn<SessionRepository['findByTokenHash']>();
    findByTokenHash.mockResolvedValue({
      expiresAt: new Date('2026-08-18T12:00:00Z'),
      permissions: ['orders.read'],
      revokedAt: null,
      sessionId: 'session-id',
      tokenHash: hashSessionToken(token),
      userId: 'user-id',
    });
    const repository: SessionRepository = {
      findByTokenHash,
      revoke: vi.fn(),
      touch,
    };
    const service = new SessionService(repository, () => new Date('2026-08-17T12:00:00Z'));

    const result = await service.authenticate(token);

    expect(findByTokenHash).toHaveBeenCalledWith(hashSessionToken(token));
    expect(result).toEqual({
      expiresAt: new Date('2026-08-18T12:00:00Z'),
      permissions: ['orders.read'],
      sessionId: 'session-id',
      userId: 'user-id',
    });
    expect(touch).toHaveBeenCalledOnce();
  });

  it('rejects revoked sessions', async () => {
    const findByTokenHash = vi.fn<SessionRepository['findByTokenHash']>();
    const touch = vi.fn<SessionRepository['touch']>();
    findByTokenHash.mockResolvedValue({
      expiresAt: new Date('2026-08-18T12:00:00Z'),
      permissions: [],
      revokedAt: new Date('2026-08-17T10:00:00Z'),
      sessionId: 'session-id',
      tokenHash: hashSessionToken(token),
      userId: 'user-id',
    });
    const repository: SessionRepository = {
      findByTokenHash,
      revoke: vi.fn(),
      touch,
    };
    const service = new SessionService(repository, () => new Date('2026-08-17T12:00:00Z'));

    await expect(service.authenticate(token)).resolves.toBeNull();
    expect(touch).not.toHaveBeenCalled();
  });

  it('revokes a session at the current service time', async () => {
    const revoke = vi.fn<SessionRepository['revoke']>();
    const repository: SessionRepository = {
      findByTokenHash: vi.fn(),
      revoke,
      touch: vi.fn(),
    };
    const service = new SessionService(repository, () => new Date('2026-08-17T12:00:00Z'));

    await service.revoke('session-id');

    expect(revoke).toHaveBeenCalledWith('session-id', new Date('2026-08-17T12:00:00Z'));
  });
});
