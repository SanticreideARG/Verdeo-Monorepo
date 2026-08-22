import { alias } from 'drizzle-orm/pg-core';
import { desc, eq, sql } from 'drizzle-orm';

import type {
  AccessTokenRecord,
  AccessTokenRepository,
  AccessTokenSummary,
  IssueAccessTokenInput,
} from '@verdeo/auth';

import type { Database } from '../index.js';
import {
  accessTokens,
  operatingSites,
  roles,
  userOperatingSites,
  userRoles,
  users,
} from '../schema/index.js';

const boundUser = alias(users, 'bound_user');
const createdByUser = alias(users, 'created_by_user');

export class PostgresAccessTokenRepository implements AccessTokenRepository {
  public constructor(private readonly database: Database) {}

  public async create(
    input: IssueAccessTokenInput & { expiresAt: Date; tokenHash: string },
  ): Promise<{ id: string }> {
    const [created] = await this.database
      .insert(accessTokens)
      .values({
        boundUserId: input.boundUserId ?? null,
        createdByUserId: input.createdByUserId ?? null,
        expiresAt: input.expiresAt,
        kind: input.kind,
        label: input.label,
        operatingSiteId: input.operatingSiteId ?? null,
        roleId: input.roleId ?? null,
        tokenHash: input.tokenHash,
      })
      .returning({ id: accessTokens.id });
    if (!created) throw new Error('Access token creation did not return an identifier');
    return created;
  }

  public async findActiveByHash(tokenHash: string): Promise<AccessTokenRecord | null> {
    const [record] = await this.database
      .select({
        boundUserId: accessTokens.boundUserId,
        expiresAt: accessTokens.expiresAt,
        id: accessTokens.id,
        kind: accessTokens.kind,
        operatingSiteId: accessTokens.operatingSiteId,
        redeemedAt: accessTokens.redeemedAt,
        revokedAt: accessTokens.revokedAt,
        roleId: accessTokens.roleId,
      })
      .from(accessTokens)
      .where(eq(accessTokens.tokenHash, tokenHash))
      .limit(1);
    if (!record) return null;
    return { ...record, kind: record.kind as AccessTokenRecord['kind'] };
  }

  // userId is not needed here: the token already carries who it belongs to (bound at generation
  // for repartidor_access, or just-created for user_invite), so redemption only stamps usage.
  public async markRedeemed(id: string): Promise<void> {
    await this.database
      .update(accessTokens)
      .set({
        lastUsedAt: new Date(),
        redeemedAt: sql`coalesce(${accessTokens.redeemedAt}, now())`,
        useCount: sql`${accessTokens.useCount} + 1`,
      })
      .where(eq(accessTokens.id, id));
  }

  public async provisionInviteUser(
    tokenId: string,
    input: { displayName: string; operatingSiteId: string | null; roleId: string },
  ): Promise<{ userId: string }> {
    const userId = await this.database.transaction(async (transaction) => {
      const [createdUser] = await transaction
        .insert(users)
        .values({ displayName: input.displayName, status: 'active' })
        .returning({ id: users.id });
      if (!createdUser) throw new Error('User creation did not return an identifier');

      await transaction.insert(userRoles).values({ roleId: input.roleId, userId: createdUser.id });
      if (input.operatingSiteId) {
        await transaction.insert(userOperatingSites).values({
          active: true,
          defaultSite: true,
          operatingSiteId: input.operatingSiteId,
          userId: createdUser.id,
        });
      }
      return createdUser.id;
    });
    return { userId };
  }

  public async list(filter?: { operatingSiteId?: string }): Promise<readonly AccessTokenSummary[]> {
    const rows = await this.database
      .select({
        boundUserDisplayName: boundUser.displayName,
        createdAt: accessTokens.createdAt,
        createdByDisplayName: createdByUser.displayName,
        expiresAt: accessTokens.expiresAt,
        id: accessTokens.id,
        kind: accessTokens.kind,
        label: accessTokens.label,
        lastUsedAt: accessTokens.lastUsedAt,
        operatingSiteName: operatingSites.displayName,
        redeemedAt: accessTokens.redeemedAt,
        revokedAt: accessTokens.revokedAt,
        roleKey: roles.key,
        useCount: accessTokens.useCount,
      })
      .from(accessTokens)
      .leftJoin(boundUser, eq(boundUser.id, accessTokens.boundUserId))
      .leftJoin(createdByUser, eq(createdByUser.id, accessTokens.createdByUserId))
      .leftJoin(operatingSites, eq(operatingSites.id, accessTokens.operatingSiteId))
      .leftJoin(roles, eq(roles.id, accessTokens.roleId))
      .where(
        filter?.operatingSiteId
          ? eq(accessTokens.operatingSiteId, filter.operatingSiteId)
          : undefined,
      )
      .orderBy(desc(accessTokens.createdAt));

    return rows.map((row) => ({ ...row, kind: row.kind as AccessTokenSummary['kind'] }));
  }

  public async revoke(id: string): Promise<void> {
    await this.database
      .update(accessTokens)
      .set({ revokedAt: new Date() })
      .where(eq(accessTokens.id, id));
  }
}
