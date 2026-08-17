import { and, desc, eq, isNull } from 'drizzle-orm';

import type { SessionRecord, SessionRepository } from '@verdeo/auth';
import { resolvePermissions } from '@verdeo/rbac';

import type { Database } from '../index.js';
import {
  permissions,
  rolePermissions,
  roles,
  sessions,
  userPermissionOverrides,
  userRoles,
  users,
} from '../schema/index.js';

export class PostgresSessionRepository implements SessionRepository {
  public constructor(private readonly database: Pick<Database, 'select' | 'update'>) {}

  public async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const [session] = await this.database
      .select({
        expiresAt: sessions.expiresAt,
        revokedAt: sessions.revokedAt,
        sessionId: sessions.id,
        tokenHash: sessions.tokenHash,
        userId: sessions.userId,
      })
      .from(sessions)
      .innerJoin(users, and(eq(users.id, sessions.userId), eq(users.status, 'active')))
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1);

    if (!session) return null;

    const [roleGrantRows, overrideRows] = await Promise.all([
      this.database
        .select({ permission: permissions.key })
        .from(userRoles)
        .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.active, true)))
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(eq(userRoles.userId, session.userId)),
      this.database
        .select({ effect: userPermissionOverrides.effect, permission: permissions.key })
        .from(userPermissionOverrides)
        .innerJoin(permissions, eq(permissions.id, userPermissionOverrides.permissionId))
        .where(eq(userPermissionOverrides.userId, session.userId)),
    ]);

    const resolvedPermissions = resolvePermissions({
      overrides: overrideRows.map((override) => ({
        effect: override.effect === 'allow' ? 'allow' : 'deny',
        permission: override.permission,
      })),
      rolePermissions: roleGrantRows.map(({ permission }) => permission),
    });

    return {
      ...session,
      permissions: [...resolvedPermissions].sort(),
    };
  }

  public async touch(sessionId: string, seenAt: Date): Promise<void> {
    await this.database
      .update(sessions)
      .set({ lastSeenAt: seenAt })
      .where(eq(sessions.id, sessionId));
  }

  public async listForUser(userId: string, limit: number) {
    return this.database
      .select({
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
        id: sessions.id,
        lastSeenAt: sessions.lastSeenAt,
        revokedAt: sessions.revokedAt,
      })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.createdAt))
      .limit(limit);
  }

  public async revoke(sessionId: string, revokedAt: Date): Promise<boolean> {
    const revokedSessions = await this.database
      .update(sessions)
      .set({ revokedAt })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });

    return revokedSessions.length === 1;
  }

  public async revokeOwned(sessionId: string, userId: string, revokedAt: Date): Promise<boolean> {
    const revokedSessions = await this.database
      .update(sessions)
      .set({ revokedAt })
      .where(
        and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)),
      )
      .returning({ id: sessions.id });

    return revokedSessions.length === 1;
  }
}
