import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { and, desc, eq, gt, isNull } from 'drizzle-orm';

import type { Database } from '../index.js';
import { customerLoginTokens } from '../schema/index.js';

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Fifteen minutes: long enough to switch to a mail app, short enough that a leaked link is stale. */
const TOKEN_TTL_MS = 15 * 60 * 1000;

/** How many links one address may request before it has to wait. */
const MAX_REQUESTS_PER_WINDOW = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface CustomerLoginRequestResult {
  /** The raw token to put in the email. Never persisted, never logged. */
  token: string;
  expiresAt: Date;
}

/**
 * Email sign-in links for customers.
 *
 * A link rather than a password: it avoids storing customer passwords at all, removes the
 * forgot-password flow, and proves the address in the same step as signing in — which is exactly
 * what "login por email con correo de confirmación" needs.
 */
export class PostgresCustomerLoginService {
  public constructor(private readonly database: Database) {}

  /**
   * Issues a link for an address.
   *
   * Returns null when the address has asked too many times recently. The caller must respond the
   * same way either way — telling the visitor "too many requests" for one address and "check your
   * mail" for another turns this endpoint into a way to discover who has an account.
   */
  public async requestLogin(email: string): Promise<CustomerLoginRequestResult | null> {
    const emailNormalized = normalizeLoginEmail(email);

    const recent = await this.database
      .select({ id: customerLoginTokens.id })
      .from(customerLoginTokens)
      .where(
        and(
          eq(customerLoginTokens.emailNormalized, emailNormalized),
          gt(customerLoginTokens.createdAt, new Date(Date.now() - RATE_WINDOW_MS)),
        ),
      )
      .limit(MAX_REQUESTS_PER_WINDOW);
    if (recent.length >= MAX_REQUESTS_PER_WINDOW) return null;

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await this.database.insert(customerLoginTokens).values({
      emailNormalized,
      expiresAt,
      tokenHash: hashToken(token),
    });

    return { expiresAt, token };
  }

  /**
   * Consumes a link and reports whose address it proved.
   *
   * Marking it consumed inside the transaction that reads it is what makes a link single-use even
   * if two requests arrive at once — the second finds `consumed_at` already set.
   */
  public async consume(token: string): Promise<{ emailNormalized: string } | null> {
    return this.database.transaction(async (transaction) => {
      const [row] = await transaction
        .select({
          emailNormalized: customerLoginTokens.emailNormalized,
          id: customerLoginTokens.id,
        })
        .from(customerLoginTokens)
        .where(
          and(
            eq(customerLoginTokens.tokenHash, hashToken(token)),
            isNull(customerLoginTokens.consumedAt),
            gt(customerLoginTokens.expiresAt, new Date()),
          ),
        )
        .for('update')
        .limit(1);
      if (!row) return null;

      await transaction
        .update(customerLoginTokens)
        .set({ consumedAt: new Date() })
        .where(eq(customerLoginTokens.id, row.id));

      // Every outstanding link for that address is spent too: the person is in, and a link still
      // sitting in an old email should not work afterwards.
      await this.consumeOthers(transaction, row.emailNormalized, row.id);

      return { emailNormalized: row.emailNormalized };
    });
  }

  private async consumeOthers(
    transaction: DatabaseTransaction,
    emailNormalized: string,
    exceptId: string,
  ): Promise<void> {
    const outstanding = await transaction
      .select({ id: customerLoginTokens.id })
      .from(customerLoginTokens)
      .where(
        and(
          eq(customerLoginTokens.emailNormalized, emailNormalized),
          isNull(customerLoginTokens.consumedAt),
        ),
      )
      .orderBy(desc(customerLoginTokens.createdAt));

    for (const row of outstanding) {
      if (row.id === exceptId) continue;
      await transaction
        .update(customerLoginTokens)
        .set({ consumedAt: new Date() })
        .where(eq(customerLoginTokens.id, row.id));
    }
  }
}

/** Constant-time compare, for callers that need to check a token against a known value. */
export function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(hashToken(a), 'hex');
  const right = Buffer.from(hashToken(b), 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
