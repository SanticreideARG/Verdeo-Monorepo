export interface AuthenticatedSession {
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

export interface SessionRepository {
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  listForUser(userId: string, limit: number): Promise<readonly SessionSummary[]>;
  revoke(sessionId: string, revokedAt: Date): Promise<boolean>;
  revokeOwned(sessionId: string, userId: string, revokedAt: Date): Promise<boolean>;
  touch(sessionId: string, seenAt: Date): Promise<void>;
}
