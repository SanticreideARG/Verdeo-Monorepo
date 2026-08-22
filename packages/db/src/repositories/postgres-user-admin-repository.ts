import { eq, inArray } from 'drizzle-orm';

import { AuditService } from '@verdeo/audit';
import {
  computeEffectivePermissions,
  type PermissionCatalogEntry,
  type PermissionOverrideInput,
  type RoleSummary,
  type UserAdminDetail,
  type UserAdminRepository,
  type UserPermissionOverrideEntry,
} from '@verdeo/auth';

import type { Database } from '../index.js';
import {
  permissions,
  roles,
  rolePermissions,
  userPermissionOverrides,
  userRoles,
  users,
} from '../schema/index.js';
import { PostgresAuditSink } from './postgres-audit-sink.js';

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export class PostgresUserAdminRepository implements UserAdminRepository {
  public constructor(private readonly database: Database) {}

  private async loadDetail(
    database: Database | DatabaseTransaction,
    id: string,
  ): Promise<UserAdminDetail | null> {
    const [user] = await database
      .select({
        avatarUrl: users.avatarUrl,
        displayName: users.displayName,
        email: users.emailNormalized,
        id: users.id,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!user) return null;

    const assignedRoles = await database
      .select({
        active: roles.active,
        description: roles.description,
        id: roles.id,
        key: roles.key,
        name: roles.name,
      })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, id))
      .orderBy(roles.name);

    const rolePermissionRows =
      assignedRoles.length === 0
        ? []
        : await database
            .select({ key: permissions.key })
            .from(rolePermissions)
            .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
            .where(
              inArray(
                rolePermissions.roleId,
                assignedRoles.map((role) => role.id),
              ),
            );

    const overrideRows = await database
      .select({
        effect: userPermissionOverrides.effect,
        permissionId: permissions.id,
        permissionKey: permissions.key,
        reason: userPermissionOverrides.reason,
      })
      .from(userPermissionOverrides)
      .innerJoin(permissions, eq(permissions.id, userPermissionOverrides.permissionId))
      .where(eq(userPermissionOverrides.userId, id))
      .orderBy(permissions.key);

    const overrides: UserPermissionOverrideEntry[] = overrideRows.map((row) => ({
      effect: row.effect === 'deny' ? 'deny' : 'allow',
      permissionId: row.permissionId,
      permissionKey: row.permissionKey,
      reason: row.reason,
    }));
    const rolePermissionKeys = rolePermissionRows.map((row) => row.key);

    return {
      ...user,
      effectivePermissions: computeEffectivePermissions(rolePermissionKeys, overrides),
      overrides,
      roles: assignedRoles,
    };
  }

  public async getDetail(id: string): Promise<UserAdminDetail | null> {
    return this.loadDetail(this.database, id);
  }

  public async listRoles(): Promise<readonly RoleSummary[]> {
    return this.database
      .select({
        active: roles.active,
        description: roles.description,
        id: roles.id,
        key: roles.key,
        name: roles.name,
      })
      .from(roles)
      .orderBy(roles.name);
  }

  public async listPermissionsCatalog(): Promise<readonly PermissionCatalogEntry[]> {
    return this.database
      .select({
        description: permissions.description,
        group: permissions.group,
        id: permissions.id,
        key: permissions.key,
      })
      .from(permissions)
      .orderBy(permissions.group, permissions.key);
  }

  public async setStatus(id: string, active: boolean): Promise<UserAdminDetail> {
    return this.database.transaction(async (transaction) => {
      await transaction
        .update(users)
        .set({ status: active ? 'active' : 'disabled', updatedAt: new Date() })
        .where(eq(users.id, id));
      const detail = await this.loadDetail(transaction, id);
      if (!detail) throw new Error(`User not found: ${id}`);
      return detail;
    });
  }

  public async setRoles(
    id: string,
    roleIds: readonly string[],
    actorUserId: string | undefined,
  ): Promise<UserAdminDetail> {
    return this.database.transaction(async (transaction) => {
      const before = await this.loadDetail(transaction, id);
      if (!before) throw new Error(`User not found: ${id}`);

      await transaction.delete(userRoles).where(eq(userRoles.userId, id));
      if (roleIds.length > 0) {
        await transaction.insert(userRoles).values(
          roleIds.map((roleId) => ({
            assignedBy: actorUserId ?? null,
            roleId,
            userId: id,
          })),
        );
      }

      const after = await this.loadDetail(transaction, id);
      if (!after) throw new Error(`User not found: ${id}`);

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'user.roles_updated',
        actor: actorUserId ? { type: 'user', userId: actorUserId } : { type: 'system' },
        after: { roles: after.roles.map((role) => role.key) },
        before: { roles: before.roles.map((role) => role.key) },
        correlationId: id,
        entityId: id,
        entityType: 'user',
        requestId: id,
        source: 'api',
      });

      return after;
    });
  }

  public async setPermissionOverrides(
    id: string,
    overrides: readonly PermissionOverrideInput[],
    actorUserId: string | undefined,
  ): Promise<UserAdminDetail> {
    return this.database.transaction(async (transaction) => {
      const before = await this.loadDetail(transaction, id);
      if (!before) throw new Error(`User not found: ${id}`);

      await transaction
        .delete(userPermissionOverrides)
        .where(eq(userPermissionOverrides.userId, id));
      if (overrides.length > 0) {
        await transaction.insert(userPermissionOverrides).values(
          overrides.map((override) => ({
            effect: override.effect,
            grantedBy: actorUserId ?? null,
            permissionId: override.permissionId,
            reason: override.reason ?? null,
            userId: id,
          })),
        );
      }

      const after = await this.loadDetail(transaction, id);
      if (!after) throw new Error(`User not found: ${id}`);

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'user.permission_overrides_updated',
        actor: actorUserId ? { type: 'user', userId: actorUserId } : { type: 'system' },
        after: {
          overrides: after.overrides.map((override) => ({
            effect: override.effect,
            permissionKey: override.permissionKey,
            reason: override.reason,
          })),
        },
        before: {
          overrides: before.overrides.map((override) => ({
            effect: override.effect,
            permissionKey: override.permissionKey,
            reason: override.reason,
          })),
        },
        correlationId: id,
        entityId: id,
        entityType: 'user',
        requestId: id,
        source: 'api',
      });

      return after;
    });
  }
}
