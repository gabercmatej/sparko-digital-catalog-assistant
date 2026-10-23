/**
 * First authentication gate for every request except framework chunks and brand images.
 *
 * - Login page and /api/auth/* are public (signed-in visitors of /prijava go straight to the app).
 * - Without a valid session: pages redirect to /prijava (keeping the deep link in ?next=),
 *   /api/* answer 401 JSON, and files (leaflet pages, product photos, …) answer 401.
 * - Missing/invalid auth configuration counts as "not signed in" (fail closed).
 *
 * Server code re-checks the session itself (app layout, /api/chat); this is not the only check.
 */
import { NextResponse, type NextRequest } from "next/server";
import { readAuthConfig, warnMisconfigured } from "@/lib/auth/config";
import { SESSION_COOKIE, safeNext, verifySessionToken } from "@/lib/auth/session";

const PUBLIC_API = new Set(["/api/auth/login", "/api/auth/logout", "/api/auth/session"]);

export async function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;
  if (PUBLIC_API.has(pathname)) return NextResponse.next();

  const cfg = readAuthConfig();
  warnMisconfigured(cfg);
  const signedIn = cfg.ok && (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, cfg.config));

  if (pathname === "/prijava") {
    if (signedIn) return NextResponse.redirect(new URL(safeNext(searchParams.get("next")), request.url));
    return NextResponse.next();
  }
  if (signedIn) return NextResponse.next();

  const noStore = { "Cache-Control": "no-store" };
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Za dostop se prijavite.", code: "unauthorized" }, { status: 401, headers: noStore });
  }
  // Files (have an extension) and image-optimizer requests are never redirected to an HTML page.
  if (/\.[a-z0-9]+$/i.test(pathname) || pathname.startsWith("/_next/")) {
    return new NextResponse("Unauthorized", { status: 401, headers: noStore });
  }
  const login = new URL("/prijava", request.url);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login, { headers: noStore });
}

export const config = {
  // Everything except build chunks (shared with the login page), favicon, manifest and brand images.
  matcher: ["/((?!_next/static|favicon\\.ico|manifest\\.webmanifest|brand/).*)"],
};
