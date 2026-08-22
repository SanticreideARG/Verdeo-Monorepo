import { asc, eq, gt } from 'drizzle-orm';

import type {
  UserDirectoryItem,
  UserDirectoryRepository,
  UserProfile,
  UserProfileUpdateInput,
} from '@verdeo/auth';

import type { Database } from '../index.js';
import { users } from '../schema/index.js';

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

    return user ?? null;
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

    return user ?? null;
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

    return afterId ? query.where(gt(users.id, afterId)) : query;
  }

  public async updateProfile(id: string, input: UserProfileUpdateInput): Promise<UserProfile> {
    const [updated] = await this.database
      .update(users)
      .set({
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
    return updated;
  }
}
