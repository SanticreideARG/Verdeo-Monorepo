import { describe, expect, it } from 'vitest';

import { initialPermissionCatalog } from './permission-catalog.js';
import { hasPermission, resolvePermissions } from './resolve-permissions.js';

describe('resolvePermissions', () => {
  it('combines permissions from all roles', () => {
    const result = resolvePermissions({
      rolePermissions: ['orders.read', 'orders.edit'],
      overrides: [],
    });

    expect([...result]).toEqual(['orders.read', 'orders.edit']);
  });

  it('applies an individual deny after role grants', () => {
    expect(
      hasPermission(
        {
          rolePermissions: ['orders.read', 'orders.cancel'],
          overrides: [{ permission: 'orders.cancel', effect: 'deny' }],
        },
        'orders.cancel',
      ),
    ).toBe(false);
  });

  it('allows an individual grant without checking a role name', () => {
    expect(
      hasPermission(
        {
          rolePermissions: [],
          overrides: [{ permission: 'users.edit', effect: 'allow' }],
        },
        'users.edit',
      ),
    ).toBe(true);
  });

  it('keeps seed permission keys unique', () => {
    const keys = initialPermissionCatalog.map(({ key }) => key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
