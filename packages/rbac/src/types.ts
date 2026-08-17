export type PermissionKey = string;

export interface PermissionOverride {
  permission: PermissionKey;
  effect: 'allow' | 'deny';
}

export interface PermissionSnapshot {
  rolePermissions: readonly PermissionKey[];
  overrides: readonly PermissionOverride[];
}
