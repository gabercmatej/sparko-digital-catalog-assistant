/**
 * Stateless demo session: an iron-session sealed (encrypted + signed) payload in an HttpOnly cookie.
 * Validation needs only SPARKO_AUTH_SECRET, so it works the same in the proxy, route handlers and
 * server components. Expiry is enforced inside the seal (ttl) as well as by the cookie Max-Age.
 */
import { sealData, unsealData } from "iron-session";
import type { AuthConfig } from "./config";

export const SESSION_COOKIE = "sparko_session";
/** 24 h: long enough for a review day, short enough for a shared demo login. */
export const SESSION_TTL_SECONDS = 24 * 60 * 60;

type SessionData = { v: 1; fp: string; iat: number };

export async function createSessionToken(config: AuthConfig, now = Date.now()): Promise<string> {
  const data: SessionData = { v: 1, fp: config.fingerprint, iat: Math.floor(now / 1000) };
  return sealData(data, { password: config.secret, ttl: SESSION_TTL_SECONDS });
}

/** True only for an untampered, unexpired token issued for the current login + password. */
export async function verifySessionToken(token: string | undefined, config: AuthConfig, now = Date.now()): Promise<boolean> {
  if (!token || token.length > 4096) return false;
  try {
    const data = await unsealData<Partial<SessionData>>(token, { password: config.secret, ttl: SESSION_TTL_SECONDS });
    if (data?.v !== 1 || data.fp !== config.fingerprint || typeof data.iat !== "number") return false;
    const age = Math.floor(now / 1000) - data.iat;
    return age >= -60 && age < SESSION_TTL_SECONDS;
  } catch {
    return false;
  }
}

/** Cookie attributes. `secure` is on for HTTPS (always on Vercel); plain-http localhost tests need it off. */
export function sessionCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: SESSION_TTL_SECONDS };
}

export function isSecureRequest(url: string, env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL === "1" || new URL(url).protocol === "https:";
}

/** Only same-site relative paths into the app; anything else falls back to Home. */
export function safeNext(next: unknown, fallback = "/domov"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (next.length > 512 || /[\u0000-\u001f]/.test(next)) return fallback;
  const path = next.split(/[?#]/)[0];
  if (path === "/prijava" || path.startsWith("/api/") || path.startsWith("/_next/")) return fallback;
  return next;
}
