import { hashPassword, verifyPassword } from './password.js';

export interface PasswordCredentialRecord {
  failedAttempts: number;
  lockedUntil: Date | null;
  passwordHash: string;
  userId: string;
}

export interface PasswordCredentialRepository {
  findActiveByEmail(emailNormalized: string): Promise<PasswordCredentialRecord | null>;
  recordFailure(userId: string, failedAttempts: number, lockedUntil: Date | null): Promise<void>;
  recordSuccess(userId: string): Promise<void>;
}

export function normalizeEmail(email: string): string {
  return email.trim().normalize('NFKC').toLowerCase();
}

export class PasswordCredentialService {
  public constructor(
    private readonly credentials: PasswordCredentialRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async authenticate(email: string, password: string): Promise<string | null> {
    const credential = await this.credentials.findActiveByEmail(normalizeEmail(email));
    const currentTime = this.now();

    if (!credential) {
      await hashPassword(password);
      return null;
    }

    if (credential.lockedUntil && credential.lockedUntil > currentTime) {
      await hashPassword(password);
      return null;
    }

    const passwordMatches = await verifyPassword(password, credential.passwordHash);
    if (!passwordMatches) {
      const previousAttempts = credential.lockedUntil ? 0 : credential.failedAttempts;
      const failedAttempts = previousAttempts + 1;
      const lockedUntil =
        failedAttempts >= 5 ? new Date(currentTime.getTime() + 15 * 60 * 1000) : null;

      await this.credentials.recordFailure(credential.userId, failedAttempts, lockedUntil);
      return null;
    }

    await this.credentials.recordSuccess(credential.userId);
    return credential.userId;
  }
}
