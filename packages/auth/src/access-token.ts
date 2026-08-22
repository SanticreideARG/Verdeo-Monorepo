import { createHash, randomBytes } from 'node:crypto';

// Prefixed so a pasted value is recognisable as a Verdeo access token at a glance, distinct from a
// session cookie value (which is never shown to a user to copy).
const TOKEN_PREFIX = 'vrd_';

export function createAccessToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`;
}

export function hashAccessToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
