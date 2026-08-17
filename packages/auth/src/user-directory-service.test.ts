import { describe, expect, it, vi } from 'vitest';

import { UserDirectoryService, type UserDirectoryRepository } from './user-directory-service.js';

describe('UserDirectoryService', () => {
  it('uses one extra row to produce a stable next cursor', async () => {
    const listAfter = vi.fn<UserDirectoryRepository['listAfter']>();
    listAfter.mockResolvedValue([
      {
        createdAt: new Date('2026-08-17T10:00:00Z'),
        displayName: 'Ada',
        id: '00000000-0000-4000-8000-000000000001',
        status: 'active',
      },
      {
        createdAt: new Date('2026-08-17T11:00:00Z'),
        displayName: 'Grace',
        id: '00000000-0000-4000-8000-000000000002',
        status: 'active',
      },
    ]);
    const service = new UserDirectoryService({ listAfter });

    const page = await service.list(undefined, 1);

    expect(listAfter).toHaveBeenCalledWith(undefined, 2);
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe('00000000-0000-4000-8000-000000000001');
  });
});
