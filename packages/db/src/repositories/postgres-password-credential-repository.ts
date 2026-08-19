import { and, eq } from 'drizzle-orm';

import type { PasswordCredentialRecord, PasswordCredentialRepository } from '@verdeo/auth';

import type { Database } from '../index.js';
import { passwordCredentials, users } from '../schema/index.js';

export class PostgresPasswordCredentialRepository implements PasswordCredentialRepository {
  public constructor(private readonly database: Pick<Database, 'select' | 'update'>) {}

  public async findActiveByEmail(
    emailNormalized: string,
  ): Promise<PasswordCredentialRecord | null> {
    const [credential] = await this.database
      .select({
        failedAttempts: passwordCredentials.failedAttempts,
        lockedUntil: passwordCredentials.lockedUntil,
        passwordHash: passwordCredentials.passwordHash,
        userId: passwordCredentials.userId,
      })
      .from(passwordCredentials)
      .innerJoin(
        users,
        and(
          eq(users.id, passwordCredentials.userId),
          eq(users.emailNormalized, emailNormalized),
          eq(users.status, 'active'),
        ),
      )
      .limit(1);

    return credential ?? null;
  }

  public async recordFailure(
    userId: string,
    failedAttempts: number,
    lockedUntil: Date | null,
  ): Promise<void> {
    await this.database
      .update(passwordCredentials)
      .set({ failedAttempts, lockedUntil, updatedAt: new Date() })
      .where(eq(passwordCredentials.userId, userId));
  }

  public async recordSuccess(userId: string): Promise<void> {
    await this.database
      .update(passwordCredentials)
      .set({ failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(passwordCredentials.userId, userId));
  }
}
