/**
 * Login attempt limits (per hashed IP, fixed window).
 *
 * Durable when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set (shared by all Vercel
 * instances). Without Upstash, or if Upstash errors, only a best-effort per-instance in-memory
 * limiter applies — it is NOT reliable protection across serverless instances. Either way the
 * password check itself (scrypt) costs a few hundred ms per attempt.
 */
import { createBurstLimiter, hashIp, upstashConfigured, type Env } from "@/lib/assistant/ratelimit";

export const LOGIN_LIMIT = 10;
export const LOGIN_WINDOW_SECONDS = 15 * 60;

const memoryLimiter = createBurstLimiter(LOGIN_LIMIT, LOGIN_WINDOW_SECONDS * 1000);

export type LoginLimitResult = { allowed: boolean; durable: boolean };

export async function checkLoginAttempt(
  ip: string,
  opts: { env?: Env; fetchImpl?: typeof fetch; now?: number } = {},
): Promise<LoginLimitResult> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now();
  const ipHash = hashIp(ip, "sparko-login-v1");
  if (upstashConfigured(env)) {
    const windowId = Math.floor(now / 1000 / LOGIN_WINDOW_SECONDS);
    const key = `sparko:login:${ipHash}:${windowId}`;
    const url = env.UPSTASH_REDIS_REST_URL!.trim().replace(/\/+$/, "");
    try {
      const res = await (opts.fetchImpl ?? fetch)(`${url}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN!.trim()}`, "Content-Type": "application/json" },
        body: JSON.stringify([
          ["INCR", key],
          ["EXPIRE", key, String(LOGIN_WINDOW_SECONDS + 60)],
        ]),
        signal: AbortSignal.timeout(2000),
        cache: "no-store",
      });
      const data = res.ok ? ((await res.json()) as { result?: unknown }[]) : null;
      const count = Number(Array.isArray(data) ? data[0]?.result : NaN);
      if (Number.isFinite(count)) return { allowed: count <= LOGIN_LIMIT, durable: true };
    } catch {
      // fall through to the in-memory limiter
    }
  }
  return { allowed: memoryLimiter.check(ipHash, now).allowed, durable: false };
}
