/**
 * Sessions and browser binding.
 *
 * Two HttpOnly cookies:
 *   sparko_session  iron-session seal { v: 2, sid, a: account id, r: role, dh: device hash, iat }.
 *                   The seal is only a carrier: a session is valid when the durable record
 *                   sess:<sid> exists, matches the account's current gen, and (reviewers) the
 *                   browser's device slot still holds the same device hash.
 *   sparko_device   random 32-byte device credential, long-lived. The store keeps only its SHA-256
 *                   in one of the account's device slots (see accounts.ts).
 *
 * Signed-out sessions and expired sessions do not unbind the browser: on a bound browser the
 * reviewer signs in again with username + password, no activation link needed.
 * This is a practical access restriction, not hardware attestation: someone who copies both
 * cookies out of a browser profile can reuse them until an admin resets the account.
 */
import { sealData, unsealData } from "iron-session";
import { randomSecret, sha256, isWellFormedSecret, type Account, type Role } from "./accounts";
import { hashFromReply, type Env, type Store } from "./store";

export const SESSION_COOKIE = "sparko_session";
export const DEVICE_COOKIE = "sparko_device";
/** One-time activation token carried from /aktivacija?token=… to the login request (never left in the URL). */
export const ACTIVATION_COOKIE = "sparko_activation";

/** 24 h, then sign in again (no new activation on an authorized browser). */
export const SESSION_TTL_SECONDS = 24 * 60 * 60;
/** Browsers cap cookie lifetime at 400 days. */
export const DEVICE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;
export const ACTIVATION_COOKIE_MAX_AGE = 60 * 60;

export const MIN_SECRET_LENGTH = 32;

/** SPARKO_AUTH_SECRET (≥ 32 chars) seals the session cookie; null when missing (fail closed). */
export function authSecret(env: Env = process.env): string | null {
  const s = env.SPARKO_AUTH_SECRET?.trim() ?? "";
  return s.length >= MIN_SECRET_LENGTH ? s : null;
}

export type SealedSession = { v: 2; sid: string; a: string; r: Role; dh: string | null; iat: number };

type SessionRecord = { a: string; r: Role; g: number; s: number | null; dh: string | null; iat: number };

export type ValidSession = { sid: string; account: Account; slot: number | null };

export async function createSession(
  store: Store,
  secret: string,
  account: Account,
  device: { slot: number; hash: string } | null,
  now = Date.now(),
): Promise<string> {
  const sid = randomSecret();
  const iat = Math.floor(now / 1000);
  const record: SessionRecord = { a: account.id, r: account.role, g: account.gen, s: device?.slot ?? null, dh: device?.hash ?? null, iat };
  await store.run("SET", store.key("sess", sha256(sid)), JSON.stringify(record), "EX", SESSION_TTL_SECONDS);
  const sealed: SealedSession = { v: 2, sid, a: account.id, r: account.role, dh: device?.hash ?? null, iat };
  return sealData(sealed, { password: secret, ttl: SESSION_TTL_SECONDS });
}

/**
 * Stateless check of the seal + device cookie (no store call). Used for static files, and by logout
 * with `skipDevice` (ending a session must work even when the device cookie is missing).
 */
export async function unsealSession(
  token: string | undefined,
  secret: string,
  deviceCredential: string | undefined,
  now = Date.now(),
  opts: { skipDevice?: boolean } = {},
): Promise<SealedSession | null> {
  if (!token || token.length > 4096) return null;
  try {
    const data = await unsealData<Partial<SealedSession>>(token, { password: secret, ttl: SESSION_TTL_SECONDS });
    if (data?.v !== 2 || !isWellFormedSecret(data.sid) || typeof data.a !== "string" || typeof data.iat !== "number") return null;
    const age = Math.floor(now / 1000) - data.iat;
    if (age < -60 || age >= SESSION_TTL_SECONDS) return null;
    if (data.dh && !opts.skipDevice && (!isWellFormedSecret(deviceCredential) || sha256(deviceCredential) !== data.dh)) return null;
    return data as SealedSession;
  } catch {
    return null;
  }
}

/**
 * Full check against durable state. Returns null for any mismatch (revoked account, bumped gen,
 * removed browser, copied session cookie without its device cookie, expired record).
 * Throws StoreError when the store is unreachable — callers treat that as signed out.
 */
export async function validateSession(
  store: Store,
  secret: string,
  token: string | undefined,
  deviceCredential: string | undefined,
  now = Date.now(),
): Promise<ValidSession | null> {
  const sealed = await unsealSession(token, secret, deviceCredential, now);
  if (!sealed) return null;
  const [rawRecord, rawAccount] = await store.pipeline([
    ["GET", store.key("sess", sha256(sealed.sid))],
    ["HGETALL", store.key("acct", sealed.a)],
  ]);
  if (typeof rawRecord !== "string") return null;
  let record: SessionRecord;
  try {
    record = JSON.parse(rawRecord) as SessionRecord;
  } catch {
    return null;
  }
  const h = hashFromReply(rawAccount);
  if (!h || record.a !== sealed.a || h.id !== sealed.a || h.status !== "active" || Number(h.gen) !== record.g) return null;
  if (record.r !== (h.role === "admin" ? "admin" : "reviewer") || record.dh !== sealed.dh) return null;
  if (record.r === "reviewer") {
    if (!record.s || !record.dh) return null;
    const bound = await store.run("GET", store.key("dev", record.a, record.s));
    if (typeof bound !== "string" || bound.split("|")[0] !== record.dh) return null;
  }
  const account: Account = {
    id: h.id,
    username: h.username,
    role: record.r,
    passwordHash: "", // never carried around with a session
    status: "active",
    gen: record.g,
    createdAt: Number(h.createdAt) || 0,
    activatedAt: h.activatedAt ? Number(h.activatedAt) : null,
    actHash: h.actHash || null,
    actIssuedAt: h.actIssuedAt ? Number(h.actIssuedAt) : null,
  };
  return { sid: sealed.sid, account, slot: record.s };
}

export async function destroySession(store: Store, sid: string): Promise<void> {
  await store.run("DEL", store.key("sess", sha256(sid)));
}

/** Cookie attributes. `secure` is on for HTTPS (always on Vercel); plain-http localhost tests need it off. */
export function sessionCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: SESSION_TTL_SECONDS };
}

export function deviceCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: DEVICE_COOKIE_MAX_AGE };
}

export function activationCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: ACTIVATION_COOKIE_MAX_AGE };
}

export function isSecureRequest(url: string, env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL === "1" || new URL(url).protocol === "https:";
}

/** Only same-site relative paths into the app; anything else falls back to Home. */
export function safeNext(next: unknown, fallback = "/domov"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (next.length > 512 || /[\u0000-\u001f]/.test(next)) return fallback;
  const path = next.split(/[?#]/)[0];
  if (path === "/prijava" || path === "/aktivacija" || path.startsWith("/api/") || path.startsWith("/_next/")) return fallback;
  return next;
}
