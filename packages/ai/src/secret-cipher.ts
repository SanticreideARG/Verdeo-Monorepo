import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

function decodeKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32) throw new Error('AI configuration encryption key must contain 32 bytes');
  return key;
}

export function encryptSecret(secret: string, encodedKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', decodeKey(encodedKey), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptSecret(payload: string, encodedKey: string): string {
  const [version, iv, tag, encrypted] = payload.split('.');
  if (version !== VERSION || !iv || !tag || !encrypted)
    throw new Error('Unsupported encrypted secret');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    decodeKey(encodedKey),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function maskSecret(lastFour: string | null): string | null {
  return lastFour ? `••••••••${lastFour}` : null;
}
