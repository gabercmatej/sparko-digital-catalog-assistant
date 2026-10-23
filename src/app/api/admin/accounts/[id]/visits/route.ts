/** GET /api/admin/accounts/[id]/visits — visit start times (ms, newest first). */
import { getAccount } from "@/lib/auth/accounts";
import { getVisitHistory } from "@/lib/auth/analytics";
import { authBackend, requireAdmin } from "@/lib/auth/server";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const ID_PATTERN = /^[\w-]{1,64}$/;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const { id } = await params;
  if (!ID_PATTERN.test(id)) return Response.json({ error: "Neveljaven račun." }, { status: 400, headers: NO_STORE });
  const backend = authBackend();
  if (!backend) return Response.json({ error: "Storitev ni na voljo." }, { status: 503, headers: NO_STORE });
  try {
    if (!(await getAccount(backend.store, id))) return Response.json({ error: "Račun ne obstaja." }, { status: 404, headers: NO_STORE });
    const visits = await getVisitHistory(backend.store, id, 200);
    return Response.json({ visits }, { headers: NO_STORE });
  } catch {
    console.error("[admin] visit history failed: store unavailable");
    return Response.json({ error: "Storitev ni na voljo." }, { status: 503, headers: NO_STORE });
  }
}
