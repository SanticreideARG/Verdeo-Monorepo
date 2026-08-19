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
      create: vi.fn(),
      findByTokenHash,
      listForUser: vi.fn(),
      revoke: vi.fn(),
      revokeOwned: vi.fn(),
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
      create: vi.fn(),
      findByTokenHash,
      listForUser: vi.fn(),
      revoke: vi.fn(),
      revokeOwned: vi.fn(),
      touch,
    };
    const service = new SessionService(repository, () => new Date('2026-08-17T12:00:00Z'));

    await expect(service.authenticate(token)).resolves.toBeNull();
    expect(touch).not.toHaveBeenCalled();
  });

  it('revokes a session at the current service time', async () => {
    const revoke = vi.fn<SessionRepository['revoke']>();
    revoke.mockResolvedValue(true);
    const repository: SessionRepository = {
      create: vi.fn(),
      findByTokenHash: vi.fn(),
      listForUser: vi.fn(),
      revoke,
      revokeOwned: vi.fn(),
      touch: vi.fn(),
    };
    const service = new SessionService(repository, () => new Date('2026-08-17T12:00:00Z'));

    await expect(service.revoke('session-id')).resolves.toBe(true);

    expect(revoke).toHaveBeenCalledWith('session-id', new Date('2026-08-17T12:00:00Z'));
  });

  it('lists a bounded set of sessions owned by the user', async () => {
    const listForUser = vi.fn<SessionRepository['listForUser']>();
    listForUser.mockResolvedValue([]);
    const repository: SessionRepository = {
      create: vi.fn(),
      findByTokenHash: vi.fn(),
      listForUser,
      revoke: vi.fn(),
      revokeOwned: vi.fn(),
      touch: vi.fn(),
    };
    const service = new SessionService(repository);

    await expect(service.listForUser('user-id')).resolves.toEqual([]);
    expect(listForUser).toHaveBeenCalledWith('user-id', 50);
  });

  it('requires ownership when revoking another session', async () => {
    const revokeOwned = vi.fn<SessionRepository['revokeOwned']>();
    revokeOwned.mockResolvedValue(false);
    const repository: SessionRepository = {
      create: vi.fn(),
      findByTokenHash: vi.fn(),
      listForUser: vi.fn(),
      revoke: vi.fn(),
      revokeOwned,
      touch: vi.fn(),
    };
    const service = new SessionService(repository, () => new Date('2026-08-17T12:00:00Z'));

    await expect(service.revokeOwned('session-id', 'user-id')).resolves.toBe(false);
    expect(revokeOwned).toHaveBeenCalledWith(
      'session-id',
      'user-id',
      new Date('2026-08-17T12:00:00Z'),
    );
  });

  it('creates an opaque session while persisting only its hash', async () => {
    const create = vi.fn<SessionRepository['create']>();
    create.mockResolvedValue('session-id');
    const repository: SessionRepository = {
      create,
      findByTokenHash: vi.fn(),
      listForUser: vi.fn(),
      revoke: vi.fn(),
      revokeOwned: vi.fn(),
      touch: vi.fn(),
    };
    const service = new SessionService(repository, () => new Date('2026-08-17T12:00:00.000Z'));

    const result = await service.create('user-id', 8 * 60 * 60 * 1000);

    expect(result.sessionId).toBe('session-id');
    expect(result.token).toHaveLength(43);
    expect(result.expiresAt).toEqual(new Date('2026-08-17T20:00:00.000Z'));
    expect(create).toHaveBeenCalledWith(
      'user-id',
      expect.not.stringContaining(result.token),
      result.expiresAt,
    );
  });
});
