import type { PermissionKey, PermissionSnapshot } from './types.js';

export function resolvePermissions(snapshot: PermissionSnapshot): ReadonlySet<PermissionKey> {
  const resolved = new Set(snapshot.rolePermissions);

  for (const override of snapshot.overrides) {
    if (override.effect === 'deny') {
      resolved.delete(override.permission);
    } else {
      resolved.add(override.permission);
    }
  }

  return resolved;
}

export function hasPermission(snapshot: PermissionSnapshot, permission: PermissionKey): boolean {
  return resolvePermissions(snapshot).has(permission);
}

export function requirePermission(snapshot: PermissionSnapshot, permission: PermissionKey): void {
  if (!hasPermission(snapshot, permission)) {
    throw new PermissionDeniedError(permission);
  }
}

export class PermissionDeniedError extends Error {
  public readonly permission: PermissionKey;

  public constructor(permission: PermissionKey) {
    super(`Missing permission: ${permission}`);
    this.name = 'PermissionDeniedError';
    this.permission = permission;
  }
}
