/** GET /api/admin/accounts — account overview for the admin dashboard (no secrets or hashes). */
import { listAccounts, listDevices, MAX_DEVICES } from "@/lib/auth/accounts";
import { getStats } from "@/lib/auth/analytics";
import { authBackend, requireAdmin } from "@/lib/auth/server";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const backend = authBackend();
  if (!backend) return Response.json({ error: "Storitev ni na voljo." }, { status: 503, headers: NO_STORE });
  try {
    const accounts = await listAccounts(backend.store);
    const [stats, devices] = await Promise.all([
      getStats(backend.store, accounts.map((a) => a.id)),
      Promise.all(accounts.map((a) => (a.role === "reviewer" ? listDevices(backend.store, a.id) : Promise.resolve([])))),
    ]);
    const rows = accounts.map((a, i) => ({
      id: a.id,
      username: a.username,
      role: a.role,
      status: a.status,
      activatedAt: a.activatedAt,
      activationPending: a.actHash !== null,
      activationIssuedAt: a.actIssuedAt,
      devices: devices[i].map((d) => ({ slot: d.slot, boundAt: d.boundAt })),
      maxDevices: MAX_DEVICES,
      stats: stats[a.id] ?? { visits: 0, pageViews: 0, lastSeen: null },
    }));
    const totals = {
      visits: rows.reduce((n, r) => n + r.stats.visits, 0),
      activatedReviewers: rows.filter((r) => r.role === "reviewer" && r.activatedAt !== null).length,
    };
    return Response.json({ accounts: rows, totals }, { headers: NO_STORE });
  } catch {
    console.error("[admin] list accounts failed: store unavailable");
    return Response.json({ error: "Storitev ni na voljo." }, { status: 503, headers: NO_STORE });
  }
}
