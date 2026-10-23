/**
 * Session checks next to sensitive server code (layouts, route handlers). The proxy is the first
 * gate; these keep data protected even if a matcher change ever let a request past it.
 * Every check goes to the durable store; a missing store/secret or a store error means "signed out".
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { DEVICE_COOKIE, SESSION_COOKIE, authSecret, validateSession, type ValidSession } from "./session";
import { getStore, type Env, type Store } from "./store";

export type AuthBackend = { store: Store; secret: string };

let warned = false;
/** Store + secret, or null (sign-in disabled). Logs variable names — never values — once per instance. */
export function authBackend(env: Env = process.env): AuthBackend | null {
  const store = getStore(env);
  const secret = authSecret(env);
  if (store && secret) return { store, secret };
  if (!warned) {
    warned = true;
    const missing = [!store && "UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN", !secret && "SPARKO_AUTH_SECRET"].filter(Boolean);
    console.error(`[auth] sign-in disabled: missing or invalid ${missing.join(", ")}`);
  }
  return null;
}

/** Validates a session from raw cookie values. Never throws. */
export async function sessionFromCookies(sessionCookie: string | undefined, deviceCookie: string | undefined): Promise<ValidSession | null> {
  const backend = authBackend();
  if (!backend || !sessionCookie) return null;
  try {
    return await validateSession(backend.store, backend.secret, sessionCookie, deviceCookie);
  } catch {
    console.error("[auth] session check failed: store unavailable");
    return null;
  }
}

/** Current request's session (deduplicated per render). */
export const getSession = cache(async (): Promise<ValidSession | null> => {
  const jar = await cookies();
  return sessionFromCookies(jar.get(SESSION_COOKIE)?.value, jar.get(DEVICE_COOKIE)?.value);
});

export async function hasValidSession(): Promise<boolean> {
  return (await getSession()) !== null;
}

const NO_STORE = { "Cache-Control": "no-store" };

/** Route handlers: 401 response when the request has no valid session, otherwise null. */
export async function rejectUnauthenticated(): Promise<Response | null> {
  if (await hasValidSession()) return null;
  return Response.json({ error: "Za dostop se prijavite.", code: "unauthorized" }, { status: 401, headers: NO_STORE });
}

/** Admin route handlers: the admin session, or a 401/403 response. */
export async function requireAdmin(): Promise<{ session: ValidSession; response: null } | { session: null; response: Response }> {
  const session = await getSession();
  if (!session) return { session: null, response: Response.json({ error: "Za dostop se prijavite.", code: "unauthorized" }, { status: 401, headers: NO_STORE }) };
  if (session.account.role !== "admin") return { session: null, response: Response.json({ error: "Dostop zavrnjen.", code: "forbidden" }, { status: 403, headers: NO_STORE }) };
  return { session, response: null };
}

/** Rejects cross-site posts (CSRF); browsers always send Origin on POST. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
