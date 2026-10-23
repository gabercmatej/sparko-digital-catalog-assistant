/**
 * Session checks next to sensitive server code (layouts, route handlers). The proxy is the first
 * gate; these keep data protected even if a matcher change ever let a request past it.
 */
import { cookies } from "next/headers";
import { readAuthConfig, warnMisconfigured } from "./config";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/** Server components / server functions: is the current request signed in? Fails closed. */
export async function hasValidSession(): Promise<boolean> {
  const cfg = readAuthConfig();
  warnMisconfigured(cfg);
  if (!cfg.ok) return false;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token, cfg.config);
}

/** Route handlers: 401 response when the request has no valid session, otherwise null. */
export async function rejectUnauthenticated(): Promise<Response | null> {
  if (await hasValidSession()) return null;
  return Response.json({ error: "Za dostop se prijavite.", code: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
}
