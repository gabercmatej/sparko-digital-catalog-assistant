/**
 * POST /api/auth/logout — clears the session cookie. Sessions are stateless (sealed cookie), so
 * a copied cookie stays valid until it expires; rotating SPARKO_AUTH_SECRET revokes all sessions.
 * Local saved products and conversations (localStorage) are intentionally left untouched.
 */
import { NextResponse } from "next/server";
import { SESSION_COOKIE, isSecureRequest, sessionCookieOptions } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(isSecureRequest(request.url)), maxAge: 0 });
  return res;
}
