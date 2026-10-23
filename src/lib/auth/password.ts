/**
 * Password hashing for the demo login: scrypt from node:crypto (no custom crypto).
 *
 * Stored format (colon-separated, no `$` so it survives dotenv expansion in .env files):
 *   scrypt:<N>:<r>:<p>:<salt base64url>:<hash base64url>
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const scrypt = (password: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))));

/** OWASP-recommended scrypt cost (N=2^17, r=8, p=1 ≈ 128 MiB, a few hundred ms per login). */
export const DEFAULT_PARAMS = { N: 2 ** 17, r: 8, p: 1 };
const KEY_LEN = 32;
const SALT_LEN = 16;

type Parsed = { N: number; r: number; p: number; salt: Buffer; hash: Buffer };

/** Parses a stored hash; null when malformed or when parameters are outside sane bounds. */
export function parsePasswordHash(stored: string | undefined): Parsed | null {
  const parts = stored?.trim().split(":");
  if (!parts || parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  const isPow2 = Number.isInteger(N) && N > 1 && (N & (N - 1)) === 0;
  if (!isPow2 || N < 2 ** 14 || N > 2 ** 20 || !Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p) || p < 1 || p > 4) return null;
  const salt = Buffer.from(parts[4], "base64url");
  const hash = Buffer.from(parts[5], "base64url");
  if (salt.length < 16 || hash.length < 32) return null;
  return { N, r, p, salt, hash };
}

const scryptOpts = (N: number, r: number, p: number): ScryptOptions => ({ N, r, p, maxmem: 256 * N * r + 1024 * 1024 });

export async function hashPassword(password: string, params = DEFAULT_PARAMS): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const hash = await scrypt(password.normalize("NFC"), salt, KEY_LEN, scryptOpts(params.N, params.r, params.p));
  return ["scrypt", params.N, params.r, params.p, salt.toString("base64url"), hash.toString("base64url")].join(":");
}

/** Constant-time comparison against a stored hash. Returns false for malformed hashes. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parsePasswordHash(stored);
  if (!parsed) return false;
  const candidate = await scrypt(password.normalize("NFC"), parsed.salt, parsed.hash.length, scryptOpts(parsed.N, parsed.r, parsed.p));
  return timingSafeEqual(candidate, parsed.hash);
}
