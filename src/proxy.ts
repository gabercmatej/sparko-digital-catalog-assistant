/**
 * First authentication gate for every request except framework chunks and brand images.
 *
 * - /prijava, /aktivacija and /api/auth/* are public (signed-in visitors go straight to the app).
 * - /aktivacija?token=… moves the one-time token into a short-lived HttpOnly cookie and redirects to
 *   /aktivacija without it, so the token never stays in the address bar, history or a Referer.
 * - Pages and /api/*: the session is validated against the durable store (account active, session
 *   not revoked, browser still authorized) and the visit is recorded. /skrbnik and /api/admin/* are
 *   for admin accounts only.
 * - Files (leaflet pages, product photos): seal + device cookie are checked without a store call, so
 *   a revoked browser can still load images it has cached links to until its 24 h seal expires.
 * - Missing store/secret or a store error counts as "not signed in" (fail closed).
 *
 * Server code re-checks the session itself (layouts, route handlers); this is not the only check.
 */
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { recordActivity } from "@/lib/auth/analytics";
import { isWellFormedSecret } from "@/lib/auth/accounts";
import { authBackend } from "@/lib/auth/server";
import {
  ACTIVATION_COOKIE,
  DEVICE_COOKIE,
  SESSION_COOKIE,
  activationCookieOptions,
  isSecureRequest,
  safeNext,
  unsealSession,
  validateSession,
  type ValidSession,
} from "@/lib/auth/session";

const PUBLIC_API = new Set(["/api/auth/login", "/api/auth/logout", "/api/auth/session"]);
const NO_STORE = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };

const isAdminPath = (p: string) => p === "/skrbnik" || p.startsWith("/skrbnik/") || p.startsWith("/api/admin/");
const isFile = (p: string) => !p.startsWith("/api/") && (/\.[a-z0-9]+$/i.test(p) || p.startsWith("/_next/"));
const isPrefetch = (r: NextRequest) => r.headers.get("next-router-prefetch") === "1" || r.headers.get("purpose") === "prefetch";

function withHeaders(res: NextResponse) {
  for (const [k, v] of Object.entries(NO_STORE)) res.headers.set(k, v);
  return res;
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname, search, searchParams } = request.nextUrl;
  if (PUBLIC_API.has(pathname)) return NextResponse.next();

  // Strip the activation token from the URL before anything renders.
  if (pathname === "/aktivacija" && searchParams.has("token")) {
    const res = withHeaders(NextResponse.redirect(new URL("/aktivacija", request.url)));
    const token = searchParams.get("token") ?? "";
    if (isWellFormedSecret(token)) res.cookies.set(ACTIVATION_COOKIE, token, activationCookieOptions(isSecureRequest(request.url)));
    return res;
  }

  const backend = authBackend();
  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
  const deviceCookie = request.cookies.get(DEVICE_COOKIE)?.value;

  if (isFile(pathname)) {
    const sealed = backend && sessionCookie ? await unsealSession(sessionCookie, backend.secret, deviceCookie) : null;
    if (sealed) return NextResponse.next();
    return new NextResponse("Unauthorized", { status: 401, headers: NO_STORE });
  }

  let session: ValidSession | null = null;
  if (backend && sessionCookie) {
    try {
      session = await validateSession(backend.store, backend.secret, sessionCookie, deviceCookie);
    } catch {
      console.error("[auth] proxy session check failed: store unavailable");
    }
  }

  if (pathname === "/prijava" || pathname === "/aktivacija") {
    if (session) return withHeaders(NextResponse.redirect(new URL(safeNext(searchParams.get("next")), request.url)));
    return withHeaders(NextResponse.next());
  }

  if (session) {
    if (isAdminPath(pathname) && session.account.role !== "admin") {
      if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Dostop zavrnjen.", code: "forbidden" }, { status: 403, headers: NO_STORE });
      return withHeaders(NextResponse.redirect(new URL("/domov", request.url)));
    }
    if (!isPrefetch(request) && backend) {
      const pageView = request.headers.get("sec-fetch-dest") === "document";
      event.waitUntil(recordActivity(backend.store, session.account.id, { pageView }).catch(() => console.error("[auth] visit not recorded: store unavailable")));
    }
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    if (isAdminPath(pathname)) res.headers.set("Cache-Control", "no-store, max-age=0");
    return res;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Za dostop se prijavite.", code: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  const login = new URL("/prijava", request.url);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return withHeaders(NextResponse.redirect(login));
}

export const config = {
  // Everything except build chunks (shared with the login page), favicon, manifest and brand images.
  matcher: ["/((?!_next/static|favicon\\.ico|manifest\\.webmanifest|brand/).*)"],
};
