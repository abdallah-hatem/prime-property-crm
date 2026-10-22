import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing with Node's built-in scrypt (no native dependency, runs on Vercel).
 * Stored format: `scrypt$<N>$<r>$<p>$<salt b64url>$<hash b64url>`, so the cost can be raised
 * later without breaking existing hashes.
 */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEM = 64 * 1024 * 1024;

function derive(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
  length: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      length,
      { N: n, r, p, maxmem: MAX_MEM },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, N, R, P, KEY_LENGTH);
  return [
    'scrypt',
    N,
    R,
    P,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

/** Constant-time check; false (never a throw) for a malformed stored hash. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  if (![n, r, p].every((v) => Number.isInteger(v) && v > 0)) return false;
  const salt = Buffer.from(parts[4], 'base64url');
  const expected = Buffer.from(parts[5], 'base64url');
  if (expected.length === 0) return false;
  const actual = await derive(password, salt, n, r, p, expected.length);
  return timingSafeEqual(actual, expected);
}
