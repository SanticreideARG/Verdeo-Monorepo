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

export interface SessionRepository {
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  touch(sessionId: string, seenAt: Date): Promise<void>;
}
