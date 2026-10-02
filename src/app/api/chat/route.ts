/**
 * POST /api/chat — Sparko assistant. Non-streaming, structured ChatResponse.
 * Secrets stay server-side; errors never expose internals; logs contain only categories.
 */
import { providerFromEnv } from "@/lib/assistant/anthropic";
import { BAD_REQUEST_TEXT, handleChat } from "@/lib/assistant/orchestrate";
import { burstLimiter, checkLiveQuota, clientIp, hashIp } from "@/lib/assistant/ratelimit";
import type { ChatErrorResponse } from "@/lib/types";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 32 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };

function error(status: number, body: ChatErrorResponse, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

export async function POST(request: Request) {
  const ipHash = hashIp(clientIp(request.headers));
  const burst = burstLimiter.check(ipHash);
  if (!burst.allowed) {
    return error(429, { error: "Prejel sem preveč vprašanj naenkrat. Počakaj nekaj sekund in poskusi znova.", code: "rate_limited" }, { "Retry-After": String(burst.retryAfterSec) });
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return error(413, { error: "Sporočilo je predolgo.", code: "bad_request" });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return error(413, { error: "Sporočilo je predolgo.", code: "bad_request" });
    body = JSON.parse(raw);
  } catch {
    return error(400, { error: BAD_REQUEST_TEXT, code: "bad_request" });
  }

  try {
    const result = await handleChat(body, {
      provider: providerFromEnv(),
      liveQuota: () => checkLiveQuota(ipHash),
      onEvent: (e) => {
        if (e.type === "fallback" && e.category !== "no_provider") console.warn(`[chat] fallback: ${e.category}${"reason" in e && e.reason ? ` (${e.reason})` : ""}`);
      },
    });
    return Response.json(result.body, { status: result.status, headers: NO_STORE });
  } catch (err) {
    console.error(`[chat] server_error: ${err instanceof Error ? err.name : "unknown"}`);
    return error(500, { error: "Sparko trenutno ne more odgovoriti. Poskusi znova čez trenutek.", code: "server_error" });
  }
}
