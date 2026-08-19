import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const keyLength = 64;
const parameters = { cost: 32_768, blockSize: 8, maxmem: 64 * 1024 * 1024, parallelization: 1 };

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      {
        N: parameters.cost,
        maxmem: parameters.maxmem,
        p: parameters.parallelization,
        r: parameters.blockSize,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt);

  return [
    'scrypt',
    parameters.cost,
    parameters.blockSize,
    parameters.parallelization,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelization, encodedSalt, encodedKey] =
    encodedHash.split('$');

  if (
    algorithm !== 'scrypt' ||
    Number(cost) !== parameters.cost ||
    Number(blockSize) !== parameters.blockSize ||
    Number(parallelization) !== parameters.parallelization ||
    !encodedSalt ||
    !encodedKey
  ) {
    return false;
  }

  try {
    const expectedKey = Buffer.from(encodedKey, 'base64url');
    if (expectedKey.length !== keyLength) return false;

    const actualKey = await deriveKey(password, Buffer.from(encodedSalt, 'base64url'));
    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}

export function createRandomPassword(): string {
  return randomBytes(24).toString('base64url');
}
