import { hashSessionToken } from './session-token.js';
import type { AuthenticatedSession, SessionRepository } from './types.js';

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
}
