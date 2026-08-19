import { createSessionToken, hashSessionToken } from './session-token.js';
import type {
  AuthenticatedSession,
  CreatedSession,
  SessionRepository,
  SessionSummary,
} from './types.js';

export class SessionService {
  public constructor(
    private readonly sessions: SessionRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async authenticate(token: string): Promise<AuthenticatedSession | null> {
    if (token.length < 32) return null;

    const session = await this.sessions.findByTokenHash(hashSessionToken(token));
    const currentTime = this.now();

    if (!session || session.revokedAt || session.expiresAt <= currentTime) return null;

    await this.sessions.touch(session.sessionId, currentTime);

    return {
      expiresAt: session.expiresAt,
      permissions: session.permissions,
      sessionId: session.sessionId,
      userId: session.userId,
    };
  }

  public async create(userId: string, durationMs: number): Promise<CreatedSession> {
    const token = createSessionToken();
    const expiresAt = new Date(this.now().getTime() + durationMs);
    const sessionId = await this.sessions.create(userId, hashSessionToken(token), expiresAt);

    return { expiresAt, sessionId, token };
  }

  public async revoke(sessionId: string): Promise<boolean> {
    return this.sessions.revoke(sessionId, this.now());
  }

  public async listForUser(userId: string): Promise<readonly SessionSummary[]> {
    return this.sessions.listForUser(userId, 50);
  }

  public async revokeOwned(sessionId: string, userId: string): Promise<boolean> {
    return this.sessions.revokeOwned(sessionId, userId, this.now());
  }
}
