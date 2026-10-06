/**
 * Abuse limits for /api/chat.
 *
 * 1) Durable live-AI quota (fixed window, per hashed IP) via Upstash Redis REST using plain fetch,
 *    enabled when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set. Default 20 live
 *    requests / 10 minutes. If Upstash is not configured:
 *      - production (NODE_ENV=production) without ALLOW_UNLIMITED_AI=true → live AI is DISABLED
 *        (deterministic answers keep working, response mode "fallback" with a notice);
 *      - development → live AI allowed.
 *    Upstash errors fail closed for live AI only.
 * 2) Best-effort in-memory burst limiter for ALL requests (default 30 / minute per IP per instance).
 *    It is NOT durable: serverless instances do not share memory and restarts reset it.
 */
import { createHash } from "node:crypto";

export const LIVE_LIMIT = 20;
export const LIVE_WINDOW_SECONDS = 600;
export const BURST_LIMIT = 30;
export const BURST_WINDOW_MS = 60_000;

export type Env = Record<string, string | undefined>;

export function hashIp(ip: string, salt = "sparko-v1"): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/** Client IP from proxy headers (Vercel sets x-forwarded-for). Falls back to a shared bucket. */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim().slice(0, 64) || "unknown";
  return (headers.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}

// ------------------------------------------------------------- in-memory burst limiter (non-durable)

type Bucket = { count: number; resetAt: number };

export function createBurstLimiter(limit = BURST_LIMIT, windowMs = BURST_WINDOW_MS) {
  const buckets = new Map<string, Bucket>();
  return {
    check(key: string, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
      if (buckets.size > 5000) {
        for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
      }
      const b = buckets.get(key);
      if (!b || b.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterSec: 0 };
      }
      b.count += 1;
      if (b.count > limit) return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
      return { allowed: true, retryAfterSec: 0 };
    },
  };
}

/** Shared per-instance limiter used by the route. */
/** CHAT_BURST_LIMIT overrides the per-minute limit (set only by the E2E test server, which sends many requests from one IP). */
export const burstLimiter = createBurstLimiter(Number(process.env.CHAT_BURST_LIMIT) || BURST_LIMIT);

// ------------------------------------------------------------- durable live-AI quota

export type LiveQuotaResult = { allowed: true } | { allowed: false; reason: "quota_exceeded" | "limiter_not_configured" | "limiter_error" };

export function upstashConfigured(env: Env = process.env): boolean {
  return !!(env.UPSTASH_REDIS_REST_URL?.trim() && env.UPSTASH_REDIS_REST_TOKEN?.trim());
}

export async function checkLiveQuota(
  ipHash: string,
  opts: { env?: Env; fetchImpl?: typeof fetch; now?: number; limit?: number; windowSeconds?: number } = {},
): Promise<LiveQuotaResult> {
  const env = opts.env ?? process.env;
  if (!upstashConfigured(env)) {
    const prod = env.NODE_ENV === "production";
    if (prod && env.ALLOW_UNLIMITED_AI !== "true") return { allowed: false, reason: "limiter_not_configured" };
    return { allowed: true };
  }
  const limit = opts.limit ?? LIVE_LIMIT;
  const windowSeconds = opts.windowSeconds ?? LIVE_WINDOW_SECONDS;
  const windowId = Math.floor((opts.now ?? Date.now()) / 1000 / windowSeconds);
  const key = `sparko:ai:${ipHash}:${windowId}`;
  const url = env.UPSTASH_REDIS_REST_URL!.trim().replace(/\/+$/, "");
  try {
    const res = await (opts.fetchImpl ?? fetch)(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN!.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(windowSeconds + 60)],
      ]),
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    if (!res.ok) return { allowed: false, reason: "limiter_error" };
    const data = (await res.json()) as { result?: unknown; error?: string }[];
    const count = Number(Array.isArray(data) ? data[0]?.result : NaN);
    if (!Number.isFinite(count)) return { allowed: false, reason: "limiter_error" };
    return count <= limit ? { allowed: true } : { allowed: false, reason: "quota_exceeded" };
  } catch {
    return { allowed: false, reason: "limiter_error" };
  }
}
