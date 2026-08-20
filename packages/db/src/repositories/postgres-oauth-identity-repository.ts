import { and, eq } from 'drizzle-orm';

import { normalizeEmail } from '@verdeo/auth';

import type { Database } from '../index.js';
import { authIdentities, users } from '../schema/index.js';

export interface ResolveOAuthIdentityInput {
  email: string;
  provider: string;
  providerSubject: string;
}

export interface ResolvedOAuthIdentity {
  linked: boolean;
  userId: string;
}

export class PostgresOAuthIdentityRepository {
  public constructor(private readonly database: Pick<Database, 'insert' | 'select'>) {}

  public async resolveOrLink(
    input: ResolveOAuthIdentityInput,
  ): Promise<ResolvedOAuthIdentity | null> {
    const existing = await this.findActiveIdentity(input.provider, input.providerSubject);
    if (existing) return { linked: false, userId: existing.userId };

    const [candidate] = await this.database
      .select({ userId: users.id })
      .from(users)
      .where(
        and(eq(users.emailNormalized, normalizeEmail(input.email)), eq(users.status, 'active')),
      )
      .limit(1);
    if (!candidate) return null;

    const [created] = await this.database
      .insert(authIdentities)
      .values({
        provider: input.provider,
        providerSubject: input.providerSubject,
        userId: candidate.userId,
      })
      .onConflictDoNothing({
        target: [authIdentities.provider, authIdentities.providerSubject],
      })
      .returning({ userId: authIdentities.userId });

    if (created) return { linked: true, userId: created.userId };

    const racedIdentity = await this.findActiveIdentity(input.provider, input.providerSubject);
    return racedIdentity?.userId === candidate.userId
      ? { linked: false, userId: candidate.userId }
      : null;
  }

  private async findActiveIdentity(provider: string, providerSubject: string) {
    const [identity] = await this.database
      .select({ userId: authIdentities.userId })
      .from(authIdentities)
      .innerJoin(users, and(eq(users.id, authIdentities.userId), eq(users.status, 'active')))
      .where(
        and(
          eq(authIdentities.provider, provider),
          eq(authIdentities.providerSubject, providerSubject),
        ),
      )
      .limit(1);

    return identity ?? null;
  }
}
