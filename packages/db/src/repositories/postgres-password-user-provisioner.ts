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
  roleKey: string;
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

  public async provision(input: ProvisionPasswordUserInput): Promise<ProvisionedPasswordUser> {
    const email = normalizeEmail(input.email);
    const password = createRandomPassword();
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
        actorType: 'system',
        after: { status: 'active' },
        correlationId,
        entityId: createdUser.id,
        entityType: 'user',
        metadata: { authenticationProvider: 'password', roleKey: input.roleKey },
        requestId: correlationId,
        source: 'provisioning-cli',
      });

      return createdUser.id;
    });

    return { email, password, roleKey: input.roleKey, userId };
  }
}
