/**
 * Demo-login configuration, read from server-only environment variables:
 *   SPARKO_DEMO_LOGIN          username (e.g. SPAR), matched case-insensitively
 *   SPARKO_DEMO_PASSWORD_HASH  scrypt hash from `npm run auth:generate`
 *   SPARKO_AUTH_SECRET         ≥32 random characters; seals the session cookie
 *   SPARKO_DEMO_EMAIL          optional email alias accepted instead of the username
 *
 * Missing or invalid values never disable authentication: callers treat `ok: false` as
 * "nobody can sign in" (fail closed). Problems are reported by variable name only, never by value.
 */
import { createHash } from "node:crypto";
import { parsePasswordHash } from "./password";

export type Env = Record<string, string | undefined>;

export type AuthConfig = {
  login: string;
  email: string | null;
  passwordHash: string;
  secret: string;
  /** Short fingerprint of login + hash: rotating the password or login invalidates existing sessions. */
  fingerprint: string;
};

export type AuthConfigResult = { ok: true; config: AuthConfig } | { ok: false; problems: string[] };

export const MIN_SECRET_LENGTH = 32;

export function readAuthConfig(env: Env = process.env): AuthConfigResult {
  const login = env.SPARKO_DEMO_LOGIN?.trim() ?? "";
  const passwordHash = env.SPARKO_DEMO_PASSWORD_HASH?.trim() ?? "";
  const secret = env.SPARKO_AUTH_SECRET?.trim() ?? "";
  const email = env.SPARKO_DEMO_EMAIL?.trim() || null;

  const problems: string[] = [];
  if (!login) problems.push("SPARKO_DEMO_LOGIN");
  if (!parsePasswordHash(passwordHash)) problems.push("SPARKO_DEMO_PASSWORD_HASH");
  if (secret.length < MIN_SECRET_LENGTH) problems.push("SPARKO_AUTH_SECRET");
  if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push("SPARKO_DEMO_EMAIL");
  if (problems.length) return { ok: false, problems };

  const fingerprint = createHash("sha256").update(`${login.toLowerCase()}\n${passwordHash}`).digest("base64url").slice(0, 16);
  return { ok: true, config: { login, email, passwordHash, secret, fingerprint } };
}

const fold = (s: string) => s.trim().normalize("NFC").toLowerCase();

/** True when the identifier is the configured username or the explicitly configured email alias. */
export function identifierMatches(identifier: string, config: AuthConfig): boolean {
  const id = fold(identifier);
  if (!id) return false;
  return id === fold(config.login) || (config.email !== null && id === fold(config.email));
}

let warned = false;
/** Logs the names (never the values) of missing/invalid variables once per instance. */
export function warnMisconfigured(result: AuthConfigResult) {
  if (result.ok || warned) return;
  warned = true;
  console.error(`[auth] login disabled: missing or invalid ${result.problems.join(", ")}`);
}
