/**
 * Superadmin user management: view, deactivate, and privileges (role assignment + individual
 * permission overrides). Deliberately separate from UserDirectoryService (self/list reads) — this
 * is the privileged surface, gated behind users.disable/roles.manage/permissions.override in the
 * API layer, never exposed to a plain session.
 */

export interface RoleSummary {
  active: boolean;
  description: string | null;
  id: string;
  key: string;
  name: string;
}

export interface PermissionCatalogEntry {
  description: string;
  group: string;
  id: string;
  key: string;
}

export interface UserPermissionOverrideEntry {
  effect: 'allow' | 'deny';
  permissionId: string;
  permissionKey: string;
  reason: string | null;
}

export interface UserAdminDetail {
  avatarUrl: string | null;
  displayName: string;
  effectivePermissions: readonly string[];
  email: string | null;
  id: string;
  overrides: readonly UserPermissionOverrideEntry[];
  roles: readonly RoleSummary[];
  status: string;
}

export interface PermissionOverrideInput {
  effect: 'allow' | 'deny';
  permissionId: string;
  reason?: string | undefined;
}

export interface UserAdminRepository {
  getDetail(id: string): Promise<UserAdminDetail | null>;
  listPermissionsCatalog(): Promise<readonly PermissionCatalogEntry[]>;
  listRoles(): Promise<readonly RoleSummary[]>;
  setPermissionOverrides(
    id: string,
    overrides: readonly PermissionOverrideInput[],
    actorUserId: string | undefined,
  ): Promise<UserAdminDetail>;
  setRoles(
    id: string,
    roleIds: readonly string[],
    actorUserId: string | undefined,
  ): Promise<UserAdminDetail>;
  setStatus(id: string, active: boolean): Promise<UserAdminDetail>;
}

export class UserAdminService {
  public constructor(private readonly repository: UserAdminRepository) {}

  public async getDetail(id: string): Promise<UserAdminDetail | null> {
    return this.repository.getDetail(id);
  }

  public async listRoles(): Promise<readonly RoleSummary[]> {
    return this.repository.listRoles();
  }

  public async listPermissionsCatalog(): Promise<readonly PermissionCatalogEntry[]> {
    return this.repository.listPermissionsCatalog();
  }

  public async setStatus(id: string, active: boolean): Promise<UserAdminDetail> {
    return this.repository.setStatus(id, active);
  }

  public async setRoles(
    id: string,
    roleIds: readonly string[],
    actorUserId: string | undefined,
  ): Promise<UserAdminDetail> {
    return this.repository.setRoles(id, roleIds, actorUserId);
  }

  public async setPermissionOverrides(
    id: string,
    overrides: readonly PermissionOverrideInput[],
    actorUserId: string | undefined,
  ): Promise<UserAdminDetail> {
    return this.repository.setPermissionOverrides(id, overrides, actorUserId);
  }
}

// Same resolution rule @verdeo/rbac's resolvePermissions applies at login (role grants, then
// overrides in order — a later 'deny' can win over an earlier 'allow'), inlined rather than taking
// a cross-package dependency for one small pure function. Keep this in sync if that one changes.
export function computeEffectivePermissions(
  rolePermissions: readonly string[],
  overrides: readonly UserPermissionOverrideEntry[],
): readonly string[] {
  const resolved = new Set(rolePermissions);
  for (const override of overrides) {
    if (override.effect === 'deny') resolved.delete(override.permissionKey);
    else resolved.add(override.permissionKey);
  }
  return [...resolved].sort();
}
