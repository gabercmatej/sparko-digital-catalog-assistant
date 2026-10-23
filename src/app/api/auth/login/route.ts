/**
 * POST /api/auth/login — verifies the single demo account server-side and issues the session cookie.
 * Accepts JSON ({ identifier, password, next }) from the login form, or a plain form post when
 * JavaScript is unavailable (answered with a 303 redirect). Errors never reveal which field was wrong.
 */
import { NextResponse } from "next/server";
import { clientIp } from "@/lib/assistant/ratelimit";
import { identifierMatches, readAuthConfig, warnMisconfigured } from "@/lib/auth/config";
import { verifyPassword } from "@/lib/auth/password";
import { checkLoginAttempt } from "@/lib/auth/ratelimit";
import { SESSION_COOKIE, createSessionToken, isSecureRequest, safeNext, sessionCookieOptions } from "@/lib/auth/session";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_FIELD = 256;

const MESSAGES = {
  invalid: "Napačno uporabniško ime ali geslo.",
  limited: "Preveč poskusov prijave. Poskusite znova čez nekaj minut.",
  unavailable: "Prijava trenutno ni na voljo. Skrbnik mora dokončati nastavitev.",
  bad: "Prijava ni uspela. Osvežite stran in poskusite znova.",
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

/** Rejects cross-site posts (login CSRF); browsers always send Origin on POST. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const parsed = await readFields(request);
  const form = parsed?.form ?? false;
  const next = safeNext(parsed?.fields.next);

  const fail = (status: number, message: string, code: string) => {
    if (form) {
      const url = new URL("/prijava", request.url);
      url.searchParams.set("napaka", status === 429 ? "omejitev" : "1");
      if (next !== "/domov") url.searchParams.set("next", next);
      return NextResponse.redirect(url, { status: 303, headers: NO_STORE });
    }
    return NextResponse.json({ error: message, code }, { status, headers: NO_STORE });
  };

  if (!sameOrigin(request)) return fail(403, MESSAGES.bad, "forbidden");
  if (!parsed) return fail(400, MESSAGES.bad, "bad_request");

  const cfg = readAuthConfig();
  warnMisconfigured(cfg);
  if (!cfg.ok) return fail(503, MESSAGES.unavailable, "not_configured");

  const limit = await checkLoginAttempt(clientIp(request.headers));
  if (!limit.allowed) return fail(429, MESSAGES.limited, "rate_limited");

  const { identifier, password } = parsed.fields;
  // Always run the (slow) password check so unknown usernames take as long as wrong passwords.
  const idOk = identifierMatches(identifier, cfg.config);
  const pwOk = password.length > 0 && (await verifyPassword(password, cfg.config.passwordHash));
  if (!idOk || !pwOk) return fail(401, MESSAGES.invalid, "invalid_credentials");

  const token = await createSessionToken(cfg.config);
  const res = form
    ? NextResponse.redirect(new URL(next, request.url), { status: 303, headers: NO_STORE })
    : NextResponse.json({ ok: true, redirect: next }, { headers: NO_STORE });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(isSecureRequest(request.url)));
  return res;
}
