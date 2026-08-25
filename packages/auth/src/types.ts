export interface AuthenticatedSession {
  // Set only for a customer-account session (see `customer_logins` in packages/db) — undefined/null
  // for every staff/colaborador session. Optional (not required) so every existing session-mock
  // literal across the test suite keeps compiling; production sessions always resolve it via the
  // repository join, never omit it.
  customerId?: string | null | undefined;
  expiresAt: Date;
  permissions: readonly string[];
  sessionId: string;
  userId: string;
}

export interface SessionRecord extends AuthenticatedSession {
  revokedAt: Date | null;
  tokenHash: string;
}

export interface SessionSummary {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  lastSeenAt: Date;
  revokedAt: Date | null;
}

export interface CreatedSession {
  expiresAt: Date;
  sessionId: string;
  token: string;
}

export interface SessionRepository {
  create(userId: string, tokenHash: string, expiresAt: Date): Promise<string>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  listForUser(userId: string, limit: number): Promise<readonly SessionSummary[]>;
  revoke(sessionId: string, revokedAt: Date): Promise<boolean>;
  revokeOwned(sessionId: string, userId: string, revokedAt: Date): Promise<boolean>;
  touch(sessionId: string, seenAt: Date): Promise<void>;
}
