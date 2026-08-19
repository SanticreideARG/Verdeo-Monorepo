import { asc, eq, gt } from 'drizzle-orm';

import type { UserDirectoryItem, UserDirectoryRepository } from '@verdeo/auth';

import type { Database } from '../index.js';
import { users } from '../schema/index.js';

export class PostgresUserDirectoryRepository implements UserDirectoryRepository {
  public constructor(private readonly database: Pick<Database, 'select'>) {}

  public async findById(id: string): Promise<UserDirectoryItem | null> {
    const [user] = await this.database
      .select({
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

  public async listAfter(
    afterId: string | undefined,
    limit: number,
  ): Promise<readonly UserDirectoryItem[]> {
    const query = this.database
      .select({
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
}
