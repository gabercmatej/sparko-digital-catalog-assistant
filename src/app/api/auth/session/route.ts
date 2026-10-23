/** GET /api/auth/session — { authenticated } for the client (e.g. a page restored from the back/forward cache). */
import { hasValidSession } from "@/lib/auth/server";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ authenticated: await hasValidSession() }, { headers: { "Cache-Control": "no-store" } });
}
