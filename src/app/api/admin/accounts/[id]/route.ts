/** POST /api/admin/accounts/[id] — admin actions on one account. Secrets only appear in that one response. */
import {
  generatePassword,
  getAccount,
  issueActivationToken,
  listDevices,
  resetAccess,
  setPasswordHash,
  setStatus,
} from "@/lib/auth/accounts";
import { hashPassword } from "@/lib/auth/password";
import { authBackend, requireAdmin, sameOrigin } from "@/lib/auth/server";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const ID_PATTERN = /^[\w-]{1,64}$/;
const ACTIONS = ["reset", "new_link", "revoke", "restore", "rotate_password"] as const;
type Action = (typeof ACTIONS)[number];
const REVIEWER_ONLY: Action[] = ["reset", "new_link"];

const fail = (status: number, error: string) => Response.json({ error }, { status, headers: NO_STORE });
const ok = (body: Record<string, unknown> = {}) => Response.json({ ok: true, ...body }, { headers: NO_STORE });

function activationBase(request: Request): string {
  const configured = process.env.SPARKO_PUBLIC_URL?.trim().replace(/\/+$/, "");
  return configured || new URL(request.url).origin;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  if (!sameOrigin(request)) return fail(403, "Dostop zavrnjen.");

  const { id } = await params;
  if (!ID_PATTERN.test(id)) return fail(400, "Neveljaven račun.");

  type Body = { action?: unknown };
  let body: Body | null = null as Body | null;
  try {
    body = (await request.json()) as Body;
  } catch {
    // handled below
  }
  const action = body?.action;
  if (typeof action !== "string" || !(ACTIONS as readonly string[]).includes(action)) return fail(400, "Neznano dejanje.");
  if (action === "revoke" && id === admin.session.account.id) return fail(400, "Lastnega dostopa ne morete preklicati.");

  const backend = authBackend();
  if (!backend) return fail(503, "Storitev ni na voljo.");

  try {
    const account = await getAccount(backend.store, id);
    if (!account) return fail(404, "Račun ne obstaja.");
    if (REVIEWER_ONLY.includes(action as Action) && account.role !== "reviewer") return fail(400, "Dejanje je mogoče samo za pregledovalce.");

    switch (action as Action) {
      case "reset": {
        const token = await resetAccess(backend.store, account);
        return ok({ activationUrl: `${activationBase(request)}/aktivacija?token=${encodeURIComponent(token)}` });
      }
      case "new_link": {
        // Only for an account without a bound browser (unused/expired link). Moving an activated account
        // to another browser always goes through "reset", which first invalidates the old browser.
        if (account.activatedAt || (await listDevices(backend.store, id)).length) return fail(409, "Račun je že aktiviran. Uporabite »Ponastavi dostop«.");
        const token = await issueActivationToken(backend.store, account);
        return ok({ activationUrl: `${activationBase(request)}/aktivacija?token=${encodeURIComponent(token)}` });
      }
      case "revoke":
        await setStatus(backend.store, id, "revoked");
        return ok();
      case "restore":
        await setStatus(backend.store, id, "active");
        return ok();
      case "rotate_password": {
        const password = generatePassword();
        await setPasswordHash(backend.store, id, await hashPassword(password));
        return ok(id === admin.session.account.id ? { password, signedOut: true } : { password });
      }
    }
  } catch {
    console.error("[admin] action failed: store unavailable");
    return fail(503, "Storitev ni na voljo.");
  }
}
