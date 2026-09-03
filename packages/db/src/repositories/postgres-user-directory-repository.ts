import { asc, eq, gt, inArray } from 'drizzle-orm';

import type {
  UserDirectoryItem,
  UserDirectoryRepository,
  UserProfile,
  UserProfileUpdateInput,
} from '@verdeo/auth';

import type { Database } from '../index.js';
import { roles, userRoles, users } from '../schema/index.js';

export class PostgresUserDirectoryRepository implements UserDirectoryRepository {
  public constructor(private readonly database: Pick<Database, 'select' | 'update'>) {}

  public async findById(id: string): Promise<UserDirectoryItem | null> {
    const [user] = await this.database
      .select({
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
        displayName: users.displayName,
        id: users.id,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) return null;
    return (await this.withRoles([user]))[0] ?? null;
  }

  public async findProfileById(id: string): Promise<UserProfile | null> {
    const [user] = await this.database
      .select({
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
        displayName: users.displayName,
        email: users.emailNormalized,
        id: users.id,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) return null;
    const [withRoles] = await this.withRoles([user]);
    return withRoles ? { ...withRoles, email: user.email } : null;
  }

  public async listAfter(
    afterId: string | undefined,
    limit: number,
  ): Promise<readonly UserDirectoryItem[]> {
    const query = this.database
      .select({
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
        displayName: users.displayName,
        id: users.id,
        status: users.status,
      })
      .from(users)
      .orderBy(asc(users.id))
      .limit(limit);

    const rows = await (afterId ? query.where(gt(users.id, afterId)) : query);
    return this.withRoles(rows);
  }

  /**
   * Attaches each user's roles in one extra query rather than a join, so a user with three roles
   * stays one row instead of three that the caller would have to collapse.
   */
  private async withRoles(
    rows: readonly Omit<UserDirectoryItem, 'roles'>[],
  ): Promise<readonly UserDirectoryItem[]> {
    if (rows.length === 0) return [];
    const assignments = await this.database
      .select({
        displayName: roles.name,
        key: roles.key,
        userId: userRoles.userId,
      })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(
        inArray(
          userRoles.userId,
          rows.map((row) => row.id),
        ),
      );

    return rows.map((row) => ({
      ...row,
      roles: assignments
        .filter((assignment) => assignment.userId === row.id)
        .map(({ displayName, key }) => ({ displayName, key })),
    }));
  }

  public async updateProfile(id: string, input: UserProfileUpdateInput): Promise<UserProfile> {
    const [updated] = await this.database
      .update(users)
      .set({
        ...(input.avatarUrl === undefined ? {} : { avatarUrl: input.avatarUrl }),
        ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning({
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
        displayName: users.displayName,
        email: users.emailNormalized,
        id: users.id,
        status: users.status,
      });
    if (!updated) throw new Error(`User not found: ${id}`);
    const [withRoles] = await this.withRoles([updated]);
    return { ...updated, roles: withRoles?.roles ?? [] };
  }
}
