import { createAccessToken, hashAccessToken } from './access-token.js';
import type { SessionService } from './session-service.js';
import type { CreatedSession } from './types.js';

export type AccessTokenKind = 'repartidor_access' | 'user_invite';

export interface AccessTokenSummary {
  boundUserDisplayName: string | null;
  createdAt: Date;
  createdByDisplayName: string | null;
  expiresAt: Date;
  id: string;
  kind: AccessTokenKind;
  label: string;
  lastUsedAt: Date | null;
  operatingSiteName: string | null;
  redeemedAt: Date | null;
  revokedAt: Date | null;
  roleKey: string | null;
  useCount: number;
}

export interface IssueAccessTokenInput {
  boundUserId?: string | undefined;
  createdByUserId: string | undefined;
  kind: AccessTokenKind;
  label: string;
  operatingSiteId?: string | undefined;
  roleId?: string | undefined;
  ttlHours: number;
}

export interface IssuedAccessToken {
  expiresAt: Date;
  id: string;
  token: string;
}

export interface AccessTokenRecord {
  boundUserId: string | null;
  expiresAt: Date;
  id: string;
  kind: AccessTokenKind;
  operatingSiteId: string | null;
  redeemedAt: Date | null;
  revokedAt: Date | null;
  roleId: string | null;
}

export interface AccessTokenRepository {
  create(
    input: IssueAccessTokenInput & { expiresAt: Date; tokenHash: string },
  ): Promise<{ id: string }>;
  findActiveByHash(tokenHash: string): Promise<AccessTokenRecord | null>;
  list(filter?: { operatingSiteId?: string }): Promise<readonly AccessTokenSummary[]>;
  markRedeemed(id: string): Promise<void>;
  provisionInviteUser(
    tokenId: string,
    input: { displayName: string; operatingSiteId: string | null; roleId: string },
  ): Promise<{ userId: string }>;
  revoke(id: string): Promise<void>;
}

export type RedeemAccessTokenResult =
  | { kind: AccessTokenKind; ok: true; session: CreatedSession; userId: string }
  | {
      ok: false;
      reason: 'already_used' | 'display_name_required' | 'expired' | 'invalid' | 'revoked';
    };

/** "Acceder con token": redemption creates or reuses a real session through the same
 * SessionService a password login uses, so a token-authenticated user is indistinguishable from
 * any other session downstream — same cookie, same permission resolution, same everything. */
export class AccessTokenService {
  public constructor(
    private readonly repository: AccessTokenRepository,
    private readonly sessions: SessionService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async issue(input: IssueAccessTokenInput): Promise<IssuedAccessToken> {
    const token = createAccessToken();
    const tokenHash = hashAccessToken(token);
    const expiresAt = new Date(this.now().getTime() + input.ttlHours * 60 * 60 * 1000);
    const created = await this.repository.create({ ...input, expiresAt, tokenHash });
    return { expiresAt, id: created.id, token };
  }

  public async redeem(
    rawToken: string,
    extra: { displayName?: string | undefined },
    sessionDurationMs: number,
  ): Promise<RedeemAccessTokenResult> {
    const record = await this.repository.findActiveByHash(hashAccessToken(rawToken));
    if (!record) return { ok: false, reason: 'invalid' };
    if (record.revokedAt) return { ok: false, reason: 'revoked' };
    if (record.expiresAt <= this.now()) return { ok: false, reason: 'expired' };

    let userId: string;
    if (record.kind === 'repartidor_access') {
      if (!record.boundUserId) return { ok: false, reason: 'invalid' };
      userId = record.boundUserId;
      await this.repository.markRedeemed(record.id);
    } else {
      if (record.redeemedAt) return { ok: false, reason: 'already_used' };
      const displayName = extra.displayName?.trim();
      if (!displayName) return { ok: false, reason: 'display_name_required' };
      if (!record.roleId) return { ok: false, reason: 'invalid' };
      const provisioned = await this.repository.provisionInviteUser(record.id, {
        displayName,
        operatingSiteId: record.operatingSiteId,
        roleId: record.roleId,
      });
      userId = provisioned.userId;
      await this.repository.markRedeemed(record.id);
    }

    const session = await this.sessions.create(userId, sessionDurationMs);
    return { kind: record.kind, ok: true, session, userId };
  }

  public async list(filter?: { operatingSiteId?: string }): Promise<readonly AccessTokenSummary[]> {
    return this.repository.list(filter);
  }

  public async revoke(id: string): Promise<void> {
    return this.repository.revoke(id);
  }
}
