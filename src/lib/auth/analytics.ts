/**
 * Per-account visit statistics (durable, by authenticated account id — never by IP).
 *
 * A visit starts with the first authenticated request after ≥ 30 min without activity. Detection is
 * one atomic command: `SET active:<id> <now> EX 1800 GET` refreshes the activity marker and returns
 * its previous value; only a request that finds no marker (expired = 30 min idle) counts a visit, so
 * refreshes, client navigations, API calls and concurrent requests never double-count.
 *
 * Stored: stats:<id> hash { visits, pageViews, lastSeen }, visits:<id> list of visit start times
 * (ms, newest last, capped). No chat content, search terms, IPs or user agents.
 */
import type { Store } from "./store";

export const VISIT_IDLE_SECONDS = 30 * 60;
export const MAX_VISIT_HISTORY = 1000;

export type AccountStats = { visits: number; pageViews: number; lastSeen: number | null };

/** Records activity; `pageView` for full page loads (not API calls or prefetches). Returns true when a new visit started. */
export async function recordActivity(store: Store, accountId: string, opts: { pageView?: boolean; now?: number } = {}): Promise<boolean> {
  const now = opts.now ?? Date.now();
  const stats = store.key("stats", accountId);
  const [previous] = await store.pipeline([
    ["SET", store.key("active", accountId), now, "EX", VISIT_IDLE_SECONDS, "GET"],
    ["HSET", stats, "lastSeen", now],
    ...(opts.pageView ? [["HINCRBY", stats, "pageViews", 1]] : []),
  ]);
  if (previous !== null) return false;
  await store.pipeline([
    ["HINCRBY", stats, "visits", 1],
    ["RPUSH", store.key("visits", accountId), now],
    ["LTRIM", store.key("visits", accountId), -MAX_VISIT_HISTORY, -1],
  ]);
  return true;
}

export async function getStats(store: Store, accountIds: string[]): Promise<Record<string, AccountStats>> {
  if (!accountIds.length) return {};
  const replies = await store.pipeline(accountIds.map((id) => ["HMGET", store.key("stats", id), "visits", "pageViews", "lastSeen"]));
  return Object.fromEntries(
    accountIds.map((id, i) => {
      const [visits, pageViews, lastSeen] = (replies[i] as (string | null)[] | null) ?? [];
      return [id, { visits: Number(visits) || 0, pageViews: Number(pageViews) || 0, lastSeen: lastSeen ? Number(lastSeen) : null }];
    }),
  );
}

/** Visit start times, newest first. */
export async function getVisitHistory(store: Store, accountId: string, limit = 200): Promise<number[]> {
  const raw = (await store.run("LRANGE", store.key("visits", accountId), -limit, -1)) as string[] | null;
  return (raw ?? []).map(Number).filter(Number.isFinite).reverse();
}
