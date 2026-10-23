/**
 * POST /api/auth/logout — deletes the durable session record and clears the session cookie.
 * The device cookie stays: this browser remains authorized, so signing in again needs only the
 * username and password. Local saved products and conversations (localStorage) are left untouched.
 */
import { NextResponse } from "next/server";
import { authBackend, sameOrigin } from "@/lib/auth/server";
import { SESSION_COOKIE, destroySession, isSecureRequest, sessionCookieOptions, unsealSession } from "@/lib/auth/session";

export const runtime = "nodejs";

/** Raw session cookie value from the request (works for plain Request objects too). */
function sessionCookie(request: Request): string | undefined {
  const part = (request.headers.get("cookie") ?? "").split(";").map((p) => p.trim()).find((p) => p.startsWith(`${SESSION_COOKIE}=`));
  return part?.slice(SESSION_COOKIE.length + 1);
}

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!sameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403, headers });
  const backend = authBackend();
  if (backend) {
    const sealed = await unsealSession(sessionCookie(request), backend.secret, undefined, Date.now(), { skipDevice: true });
    if (sealed) await destroySession(backend.store, sealed.sid).catch(() => console.error("[auth] logout: store unavailable"));
  }
  const res = NextResponse.json({ ok: true }, { headers });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(isSecureRequest(request.url)), maxAge: 0 });
  return res;
}
