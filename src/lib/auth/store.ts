/**
 * Durable server-side store for accounts, device bindings, sessions and visit statistics:
 * Upstash Redis over its REST API (plain fetch, shared by every Vercel instance).
 *
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN   (or the Vercel Marketplace names
 *   KV_REST_API_URL / KV_REST_API_TOKEN)
 *   SPARKO_STORE_PREFIX   optional key namespace (default "sparko:v2:"); tests use their own
 *
 * There is deliberately no in-memory fallback: without the store nobody can sign in (fail closed).
 * Every command used here is atomic on its own (SET NX, GETDEL, SET … GET, INCR), which is what the
 * activation and device-slot logic relies on instead of multi-command transactions.
 */
export type Env = Record<string, string | undefined>;
export type Command = (string | number)[];

export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreError";
  }
}

export type Store = {
  /** Namespaced key. */
  key: (...parts: (string | number)[]) => string;
  /** Runs commands in one round trip (each command atomic, the batch is not a transaction). Throws StoreError. */
  pipeline: (commands: Command[]) => Promise<unknown[]>;
  /** Single command. Throws StoreError. */
  run: (...command: Command) => Promise<unknown>;
};

export const DEFAULT_PREFIX = "sparko:v2:";

export function storeCredentials(env: Env = process.env): { url: string; token: string } | null {
  const url = (env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || "").trim().replace(/\/+$/, "");
  const token = (env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || "").trim();
  if (!url || !token || !/^https?:\/\//.test(url)) return null;
  return { url, token };
}

export function createStore(opts: { url: string; token: string; prefix?: string; fetchImpl?: typeof fetch; timeoutMs?: number }): Store {
  const prefix = opts.prefix ?? DEFAULT_PREFIX;
  const doFetch = opts.fetchImpl ?? fetch;
  const pipeline = async (commands: Command[]): Promise<unknown[]> => {
    if (!commands.length) return [];
    let res: Response;
    try {
      res = await doFetch(`${opts.url}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(commands.map((c) => c.map(String))),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 3000),
        cache: "no-store",
      });
    } catch {
      throw new StoreError("store unreachable");
    }
    if (!res.ok) throw new StoreError(`store HTTP ${res.status}`);
    const data = (await res.json().catch(() => null)) as { result?: unknown; error?: string }[] | null;
    if (!Array.isArray(data) || data.length !== commands.length) throw new StoreError("store bad response");
    // Command names only — keys and values may contain hashes and must not reach logs.
    const failed = data.findIndex((d) => d?.error);
    if (failed > -1) throw new StoreError(`store command ${String(commands[failed][0])} failed`);
    return data.map((d) => d.result ?? null);
  };
  return {
    key: (...parts) => prefix + parts.join(":"),
    pipeline,
    run: async (...command) => (await pipeline([command]))[0],
  };
}

let cached: { sig: string; store: Store } | null = null;

/** The configured store, or null when not configured (callers must then deny access). */
export function getStore(env: Env = process.env): Store | null {
  const creds = storeCredentials(env);
  if (!creds) return null;
  const prefix = env.SPARKO_STORE_PREFIX?.trim() || DEFAULT_PREFIX;
  const sig = `${creds.url}\n${creds.token}\n${prefix}`;
  if (cached?.sig !== sig) cached = { sig, store: createStore({ ...creds, prefix }) };
  return cached.store;
}

/** Upstash returns HGETALL as a flat [field, value, …] array. */
export function hashFromReply(reply: unknown): Record<string, string> | null {
  if (!Array.isArray(reply) || reply.length === 0) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i + 1 < reply.length; i += 2) out[String(reply[i])] = String(reply[i + 1]);
  return out;
}
