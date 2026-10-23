/**
 * POST /api/auth/login — verifies an individual account server-side (see lib/auth/login.ts), binds
 * the browser when needed and issues the session cookie. The one-time activation token comes from the
 * HttpOnly cookie set by /aktivacija (never from the request body or URL).
 * Accepts JSON ({ identifier, password, next }) from the login form, or a plain form post when
 * JavaScript is unavailable (answered with a 303 redirect). Wrong credentials never reveal which field was wrong.
 */
import { NextResponse } from "next/server";
import { clientIp } from "@/lib/assistant/ratelimit";
import { recordActivity } from "@/lib/auth/analytics";
import { authenticate, type LoginFailure } from "@/lib/auth/login";
import { LOGIN_MESSAGES } from "@/lib/auth/messages";
import { authBackend, sameOrigin } from "@/lib/auth/server";
import {
  ACTIVATION_COOKIE,
  DEVICE_COOKIE,
  SESSION_COOKIE,
  activationCookieOptions,
  createSession,
  deviceCookieOptions,
  isSecureRequest,
  safeNext,
  sessionCookieOptions,
} from "@/lib/auth/session";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const MAX_FIELD = 256;

const STATUS: Record<LoginFailure, number> = {
  invalid: 401,
  rate_limited: 429,
  revoked: 403,
  device_limit: 403,
  not_activated: 403,
  activation_invalid: 403,
};

type Fields = { identifier: string; password: string; next: string };

async function readFields(request: Request): Promise<{ fields: Fields; form: boolean } | null> {
  const type = request.headers.get("content-type") ?? "";
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, MAX_FIELD) : "");
  try {
    if (type.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;
      return { fields: { identifier: str(body?.identifier), password: str(body?.password), next: str(body?.next) }, form: false };
    }
    if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
      const fd = await request.formData();
      return { fields: { identifier: str(fd.get("identifier")), password: str(fd.get("password")), next: str(fd.get("next")) }, form: true };
    }
  } catch {
    // malformed body
  }
  return null;
}

function readCookie(request: Request, name: string): string | undefined {
  const raw = request.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > -1 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export async function POST(request: Request) {
  const parsed = await readFields(request);
  const form = parsed?.form ?? false;
  const next = safeNext(parsed?.fields.next);
  const activationToken = readCookie(request, ACTIVATION_COOKIE) ?? null;

  const fail = (status: number, code: LoginFailure | "unavailable" | "bad" | "forbidden") => {
    const message = LOGIN_MESSAGES[code === "forbidden" ? "bad" : code];
    if (form) {
      const url = new URL(activationToken ? "/aktivacija" : "/prijava", request.url);
      url.searchParams.set("napaka", code === "invalid" ? "1" : code === "rate_limited" ? "omejitev" : code);
      if (next !== "/domov") url.searchParams.set("next", next);
      return NextResponse.redirect(url, { status: 303, headers: NO_STORE });
    }
    return NextResponse.json({ error: message, code }, { status, headers: NO_STORE });
  };

  if (!sameOrigin(request)) return fail(403, "forbidden");
  if (!parsed) return fail(400, "bad");

  const backend = authBackend();
  if (!backend) return fail(503, "unavailable");

  const secure = isSecureRequest(request.url);
  try {
    const result = await authenticate(
      backend.store,
      { ...parsed.fields, activationToken, deviceCredential: readCookie(request, DEVICE_COOKIE) ?? null },
      { ip: clientIp(request.headers) },
    );
    if (!result.ok) {
      const res = fail(STATUS[result.code], result.code);
      // A dead link, or one for an account already bound elsewhere, is dropped so it does not linger.
      if (result.code === "activation_invalid" || result.code === "device_limit") res.cookies.set(ACTIVATION_COOKIE, "", { ...activationCookieOptions(secure), maxAge: 0 });
      return res;
    }

    const token = await createSession(backend.store, backend.secret, result.account, result.device);
    await recordActivity(backend.store, result.account.id).catch(() => console.error("[auth] visit not recorded: store unavailable"));
    // Admins land in the normal app too; the dashboard is reached from the menu (Statistika obiskov).
    const res = form
      ? NextResponse.redirect(new URL(next, request.url), { status: 303, headers: NO_STORE })
      : NextResponse.json({ ok: true, redirect: next }, { headers: NO_STORE });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(secure));
    if (result.deviceCredential) res.cookies.set(DEVICE_COOKIE, result.deviceCredential, deviceCookieOptions(secure));
    if (activationToken) res.cookies.set(ACTIVATION_COOKIE, "", { ...activationCookieOptions(secure), maxAge: 0 });
    return res;
  } catch {
    console.error("[auth] sign-in failed: store unavailable");
    return fail(503, "unavailable");
  }
}
