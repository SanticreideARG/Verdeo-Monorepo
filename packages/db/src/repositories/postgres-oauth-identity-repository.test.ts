import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../index.js';
import { PostgresOAuthIdentityRepository } from './postgres-oauth-identity-repository.js';

function selectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    limit: vi.fn(() => Promise.resolve(rows)),
    where: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function databaseMock(input: {
  insert: unknown;
  select: unknown;
}): Pick<Database, 'insert' | 'select'> {
  return input as Pick<Database, 'insert' | 'select'>;
}

describe('PostgresOAuthIdentityRepository', () => {
  it('resolves an existing active provider identity without relinking it', async () => {
    const select = vi.fn(() => selectChain([{ userId: 'existing-user-id' }]));
    const insert = vi.fn();
    const repository = new PostgresOAuthIdentityRepository(databaseMock({ insert, select }));

    await expect(
      repository.resolveOrLink({
        email: 'staff@example.com',
        provider: 'supabase',
        providerSubject: 'supabase-user-id',
      }),
    ).resolves.toEqual({ linked: false, userId: 'existing-user-id' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('links a verified identity to an active preprovisioned email', async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ userId: 'preprovisioned-user-id' }]));
    const returning = vi.fn(() => Promise.resolve([{ userId: 'preprovisioned-user-id' }]));
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const insert = vi.fn(() => ({ values }));
    const repository = new PostgresOAuthIdentityRepository(databaseMock({ insert, select }));

    await expect(
      repository.resolveOrLink({
        email: ' Staff@Example.com ',
        provider: 'supabase',
        providerSubject: 'supabase-user-id',
      }),
    ).resolves.toEqual({ linked: true, userId: 'preprovisioned-user-id' });
    expect(values).toHaveBeenCalledWith({
      provider: 'supabase',
      providerSubject: 'supabase-user-id',
      userId: 'preprovisioned-user-id',
    });
  });

  it('denies a verified identity without an active preprovisioned user', async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([]));
    const insert = vi.fn();
    const repository = new PostgresOAuthIdentityRepository(databaseMock({ insert, select }));

    await expect(
      repository.resolveOrLink({
        email: 'unknown@example.com',
        provider: 'supabase',
        providerSubject: 'unknown-subject',
      }),
    ).resolves.toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });
});
