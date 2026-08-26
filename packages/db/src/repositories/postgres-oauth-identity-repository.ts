import { and, eq, isNotNull } from 'drizzle-orm';

import { normalizeEmail } from '@verdeo/auth';
import { normalizeCustomerIdentity } from '@verdeo/customers';

import type { Database } from '../index.js';
import {
  authIdentities,
  customerIdentities,
  customerLogins,
  customers,
  roles,
  userRoles,
  users,
} from '../schema/index.js';

export interface ResolveOAuthIdentityInput {
  email: string;
  provider: string;
  providerSubject: string;
}

export interface ResolvedOAuthIdentity {
  linked: boolean;
  userId: string;
}

export interface ResolvedCustomerIdentity {
  customerId: string;
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

  // Public customer OAuth (never shares a code path with resolveOrLink above — that one rejects
  // anyone without a pre-provisioned staff user; this one is the opposite: it creates one). A
  // pre-existing `users` row matched by email is reused rather than duplicated, so a colaborador
  // who is also a customer ends up with one login carrying both roles, not two accounts. The CRM
  // `customers` record is matched the same way orders already match customers: by an active
  // `customer_identities` row of type "email".
  public async resolveOrProvisionCustomer(
    input: ResolveOAuthIdentityInput,
  ): Promise<ResolvedCustomerIdentity> {
    const existingIdentity = await this.findActiveIdentity(input.provider, input.providerSubject);
    if (existingIdentity) {
      const linkedCustomerId = await this.findLinkedCustomerId(existingIdentity.userId);
      if (linkedCustomerId) {
        return { customerId: linkedCustomerId, linked: false, userId: existingIdentity.userId };
      }
      // An identity exists but was never linked to a customer (shouldn't happen in practice) —
      // fall through and treat it like a first-time resolution for that same user.
    }

    const normalizedEmail = normalizeEmail(input.email);
    const userId =
      existingIdentity?.userId ?? (await this.findOrCreateUser(input.email, normalizedEmail));

    if (!existingIdentity) {
      await this.database
        .insert(authIdentities)
        .values({ provider: input.provider, providerSubject: input.providerSubject, userId })
        .onConflictDoNothing({ target: [authIdentities.provider, authIdentities.providerSubject] });
    }

    const customerId = await this.findOrCreateCustomer(userId, input.email);
    return { customerId, linked: !existingIdentity, userId };
  }

  private async findOrCreateUser(email: string, normalizedEmail: string): Promise<string> {
    const [existing] = await this.database
      .select({ userId: users.id })
      .from(users)
      .where(and(eq(users.emailNormalized, normalizedEmail), eq(users.status, 'active')))
      .limit(1);
    if (existing) return existing.userId;

    const [created] = await this.database
      .insert(users)
      .values({ displayName: email.split('@')[0] ?? email, emailNormalized: normalizedEmail })
      // `users_email_normalized_unique` is a partial index (where email_normalized is not null) —
      // Postgres only matches an ON CONFLICT target against a partial index when the same
      // predicate is repeated here, otherwise it can't infer which index to arbitrate against.
      .onConflictDoNothing({
        target: users.emailNormalized,
        where: isNotNull(users.emailNormalized),
      })
      .returning({ userId: users.id });
    if (created) {
      const [clienteRole] = await this.database
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, 'cliente'))
        .limit(1);
      if (clienteRole) {
        await this.database
          .insert(userRoles)
          .values({ roleId: clienteRole.id, userId: created.userId })
          .onConflictDoNothing();
      }
      return created.userId;
    }

    // Raced with another request creating the same user concurrently.
    const [raced] = await this.database
      .select({ userId: users.id })
      .from(users)
      .where(and(eq(users.emailNormalized, normalizedEmail), eq(users.status, 'active')))
      .limit(1);
    if (!raced) throw new Error('Could not resolve or create a user for this email');
    return raced.userId;
  }

  private async findLinkedCustomerId(userId: string): Promise<string | null> {
    const [login] = await this.database
      .select({ customerId: customerLogins.customerId })
      .from(customerLogins)
      .where(eq(customerLogins.userId, userId))
      .limit(1);
    return login?.customerId ?? null;
  }

  private async findOrCreateCustomer(userId: string, email: string): Promise<string> {
    const linked = await this.findLinkedCustomerId(userId);
    if (linked) return linked;

    const normalizedIdentity = normalizeCustomerIdentity('email', email);
    // Only a verified identity proves the CRM record's email is actually this person's — a
    // manually-entered one (source: 'manual', verified: false by default; a phone-intake typo or
    // placeholder address) must never auto-link a stranger who happens to prove ownership of that
    // same address later, or they'd inherit someone else's order history and addresses.
    const [existingIdentity] = await this.database
      .select({ customerId: customerIdentities.customerId })
      .from(customerIdentities)
      .where(
        and(
          eq(customerIdentities.type, 'email'),
          eq(customerIdentities.valueNormalized, normalizedIdentity),
          eq(customerIdentities.active, true),
          eq(customerIdentities.verified, true),
        ),
      )
      .limit(1);

    const customerId = existingIdentity
      ? existingIdentity.customerId
      : await this.createCustomerWithEmail(email, normalizedIdentity);

    await this.database
      .insert(customerLogins)
      .values({ customerId, userId })
      .onConflictDoNothing({ target: customerLogins.customerId });

    // The customer row may already have been claimed by a different user in a race — re-read the
    // authoritative link rather than trusting the value we just tried to insert.
    return (await this.findLinkedCustomerId(userId)) ?? customerId;
  }

  private async createCustomerWithEmail(email: string, normalizedEmail: string): Promise<string> {
    const [customer] = await this.database
      .insert(customers)
      .values({ displayName: email.split('@')[0] ?? email })
      .returning({ id: customers.id });
    if (!customer) throw new Error('Customer insert did not return a row');

    // onConflictDoNothing because the fix above (only auto-link a *verified* identity) means this
    // insert can now legitimately collide: an unverified, active identity for this same email may
    // already sit on a different, unrelated customer (the exact staff-typo/placeholder case that
    // fix routes around). `customer_identities_active_value_unique` only allows one active row per
    // (type, valueNormalized) — losing this race just means the new customer goes without an email
    // identity row; customerLogins still ties the login to it either way.
    await this.database
      .insert(customerIdentities)
      .values({
        customerId: customer.id,
        primary: true,
        source: 'customer_oauth',
        type: 'email',
        valueDisplay: email,
        valueNormalized: normalizedEmail,
        verified: true,
      })
      .onConflictDoNothing({
        target: [customerIdentities.type, customerIdentities.valueNormalized],
        where: eq(customerIdentities.active, true),
      });

    return customer.id;
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
