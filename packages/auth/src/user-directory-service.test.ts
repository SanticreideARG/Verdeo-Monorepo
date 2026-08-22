import { describe, expect, it, vi } from 'vitest';

import { UserDirectoryService, type UserDirectoryRepository } from './user-directory-service.js';

function stubRepository(overrides: Partial<UserDirectoryRepository> = {}): UserDirectoryRepository {
  return {
    findById: vi.fn(),
    findProfileById: vi.fn(),
    listAfter: vi.fn(() => Promise.resolve([])),
    updateProfile: vi.fn(),
    ...overrides,
  };
}

describe('UserDirectoryService', () => {
  it('uses one extra row to produce a stable next cursor', async () => {
    const listAfter = vi.fn<UserDirectoryRepository['listAfter']>();
    listAfter.mockResolvedValue([
      {
        avatarUrl: null,
        createdAt: new Date('2026-08-17T10:00:00Z'),
        displayName: 'Ada',
        id: '00000000-0000-4000-8000-000000000001',
        status: 'active',
      },
      {
        avatarUrl: null,
        createdAt: new Date('2026-08-17T11:00:00Z'),
        displayName: 'Grace',
        id: '00000000-0000-4000-8000-000000000002',
        status: 'active',
      },
    ]);
    const service = new UserDirectoryService(stubRepository({ listAfter }));

    const page = await service.list(undefined, 1);

    expect(listAfter).toHaveBeenCalledWith(undefined, 2);
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('returns the requested user', async () => {
    const user = {
      avatarUrl: null,
      createdAt: new Date('2026-08-17T10:00:00Z'),
      displayName: 'Santiago',
      id: '00000000-0000-4000-8000-000000000001',
      status: 'active',
    };
    const findById = vi.fn<UserDirectoryRepository['findById']>(() => Promise.resolve(user));
    const service = new UserDirectoryService(stubRepository({ findById }));

    await expect(service.findById(user.id)).resolves.toEqual(user);
  });

  it('returns the requested user profile, including email', async () => {
    const profile = {
      avatarUrl: null,
      createdAt: new Date('2026-08-17T10:00:00Z'),
      displayName: 'Santiago',
      email: 'santiago@example.com',
      id: '00000000-0000-4000-8000-000000000001',
      status: 'active',
    };
    const findProfileById = vi.fn<UserDirectoryRepository['findProfileById']>(() =>
      Promise.resolve(profile),
    );
    const service = new UserDirectoryService(stubRepository({ findProfileById }));

    await expect(service.findProfileById(profile.id)).resolves.toEqual(profile);
  });

  it('updates the display name', async () => {
    const updated = {
      avatarUrl: null,
      createdAt: new Date('2026-08-17T10:00:00Z'),
      displayName: 'Santi',
      email: 'santiago@example.com',
      id: '00000000-0000-4000-8000-000000000001',
      status: 'active',
    };
    const updateProfile = vi.fn<UserDirectoryRepository['updateProfile']>(() =>
      Promise.resolve(updated),
    );
    const service = new UserDirectoryService(stubRepository({ updateProfile }));

    await expect(service.updateProfile(updated.id, { displayName: 'Santi' })).resolves.toEqual(
      updated,
    );
    expect(updateProfile).toHaveBeenCalledWith(updated.id, { displayName: 'Santi' });
  });
});
