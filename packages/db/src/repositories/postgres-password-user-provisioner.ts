import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { createRandomPassword, hashPassword, normalizeEmail } from '@verdeo/auth';

import type { Database } from '../index.js';
import {
  auditEvents,
  authIdentities,
  passwordCredentials,
  roles,
  userRoles,
  users,
} from '../schema/index.js';

export interface ProvisionPasswordUserInput {
  displayName: string;
  email: string;
  /**
   * Omitted means one is generated. Generating is the better default — an admin typing a password
   * for someone else tends to pick a memorable one, and it has to be relayed either way.
   */
  password?: string | undefined;
  roleKey: string;
  /** Who is doing this, so the audit trail names a person rather than "the system". */
  actorUserId?: string | undefined;
  /** Where from: the CLI or the admin screen. */
  source?: string | undefined;
}

export interface ProvisionedPasswordUser {
  email: string;
  password: string;
  roleKey: string;
  userId: string;
}

export class UserAlreadyExistsError extends Error {
  public constructor(email: string) {
    super(`A user already exists for ${email}`);
    this.name = 'UserAlreadyExistsError';
  }
}

export class PostgresPasswordUserProvisioner {
  public constructor(private readonly database: Database) {}

  /**
   * Replaces someone's password and clears any lockout, returning the new one to hand over.
   *
   * Separate from provision, which refuses an account that already exists — this is the "somebody
   * is locked out" path, and conflating the two would mean an accidental re-provision could
   * silently reset a colleague's access.
   */
  public async resetPassword(input: {
    actorUserId?: string | undefined;
    password?: string | undefined;
    source?: string | undefined;
    userId: string;
  }): Promise<{ password: string }> {
    const password = input.password ?? createRandomPassword();
    const passwordHash = await hashPassword(password);

    await this.database.transaction(async (transaction) => {
      const [user] = await transaction
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!user) throw new Error('User not found');

      await transaction
        .insert(passwordCredentials)
        .values({ passwordChangedAt: new Date(), passwordHash, userId: input.userId })
        .onConflictDoUpdate({
          set: {
            // Clearing the lockout is the point: a reset that leaves someone locked out has not
            // actually let them back in.
            failedAttempts: 0,
            lockedUntil: null,
            passwordChangedAt: new Date(),
            passwordHash,
          },
          target: passwordCredentials.userId,
        });

      const correlationId = randomUUID();
      await transaction.insert(auditEvents).values({
        action: 'user.password_reset',
        actorType: input.actorUserId ? 'user' : 'system',
        actorUserId: input.actorUserId ?? null,
        correlationId,
        entityId: input.userId,
        entityType: 'user',
        requestId: correlationId,
        source: input.source ?? 'provisioning-cli',
      });
    });

    return { password };
  }

  public async provision(input: ProvisionPasswordUserInput): Promise<ProvisionedPasswordUser> {
    const email = normalizeEmail(input.email);
    const password = input.password ?? createRandomPassword();
    const passwordHash = await hashPassword(password);

    const userId = await this.database.transaction(async (transaction) => {
      const [existingUser] = await transaction
        .select({ id: users.id })
        .from(users)
        .where(eq(users.emailNormalized, email))
        .limit(1);
      if (existingUser) throw new UserAlreadyExistsError(email);

      const [role] = await transaction
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.key, input.roleKey), eq(roles.active, true)))
        .limit(1);
      if (!role) throw new Error(`Active role not found: ${input.roleKey}`);

      const [createdUser] = await transaction
        .insert(users)
        .values({ displayName: input.displayName, emailNormalized: email, status: 'active' })
        .returning({ id: users.id });
      if (!createdUser) throw new Error('User creation did not return an identifier');

      await transaction.insert(authIdentities).values({
        provider: 'password',
        providerSubject: email,
        userId: createdUser.id,
      });
      await transaction.insert(passwordCredentials).values({
        passwordHash,
        userId: createdUser.id,
      });
      await transaction.insert(userRoles).values({
        roleId: role.id,
        userId: createdUser.id,
      });

      const correlationId = randomUUID();
      await transaction.insert(auditEvents).values({
        action: 'user.provisioned',
        actorType: input.actorUserId ? 'user' : 'system',
        actorUserId: input.actorUserId ?? null,
        after: { status: 'active' },
        correlationId,
        entityId: createdUser.id,
        entityType: 'user',
        metadata: { authenticationProvider: 'password', roleKey: input.roleKey },
        requestId: correlationId,
        source: input.source ?? 'provisioning-cli',
      });

      return createdUser.id;
    });

    return { email, password, roleKey: input.roleKey, userId };
  }
}
