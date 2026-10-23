/**
 * TEST-ONLY in-memory stand-in for the Upstash Redis REST API (the subset of commands the app uses).
 * Commands run synchronously one at a time, so each is atomic exactly like on real Redis — which is
 * what the concurrency tests rely on. Use `fakeFetch` in unit tests or `startFakeUpstash` for a
 * real HTTP server (E2E). Never used by application code.
 */
import { createServer, type Server } from "node:http";

type Value = { type: "string"; v: string } | { type: "hash"; v: Map<string, string> } | { type: "set"; v: Set<string> } | { type: "list"; v: string[] };
type Entry = { value: Value; expiresAt: number | null };

export class FakeRedis {
  private data = new Map<string, Entry>();
  /** Total commands executed (lets tests assert there is no per-request write amplification). */
  commandCount = 0;
  now = () => Date.now();

  private live(key: string): Entry | undefined {
    const e = this.data.get(key);
    if (e && e.expiresAt !== null && e.expiresAt <= this.now()) {
      this.data.delete(key);
      return undefined;
    }
    return e;
  }
  private get<T extends Value["type"]>(key: string, type: T): Extract<Value, { type: T }> | undefined {
    const e = this.live(key);
    if (!e) return undefined;
    if (e.value.type !== type) throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    return e.value as Extract<Value, { type: T }>;
  }
  private ensure<T extends Value["type"]>(key: string, type: T, make: () => Extract<Value, { type: T }>): Extract<Value, { type: T }> {
    const found = this.get(key, type);
    if (found) return found;
    const value = make();
    this.data.set(key, { value, expiresAt: null });
    return value;
  }

  flush() {
    this.data.clear();
  }
  keys(): string[] {
    return [...this.data.keys()].filter((k) => this.live(k));
  }
  ttl(key: string): number | null {
    const e = this.live(key);
    return e?.expiresAt ? Math.ceil((e.expiresAt - this.now()) / 1000) : null;
  }
  /** Simulates time passing for TTL-based logic without touching the real clock. */
  expireNow(key: string) {
    this.data.delete(key);
  }

  exec(cmd: string[]): unknown {
    this.commandCount++;
    const [name, ...a] = cmd;
    switch (name.toUpperCase()) {
      case "GET":
        return this.get(a[0], "string")?.v ?? null;
      case "SET": {
        const [key, val, ...opts] = a;
        const up = opts.map((o) => o.toUpperCase());
        const prev = this.get(key, "string")?.v ?? null;
        const exists = this.live(key) !== undefined;
        if (up.includes("NX") && exists) return up.includes("GET") ? prev : null;
        if (up.includes("XX") && !exists) return up.includes("GET") ? prev : null;
        const exIdx = up.indexOf("EX");
        const expiresAt = exIdx > -1 ? this.now() + Number(opts[exIdx + 1]) * 1000 : null;
        this.data.set(key, { value: { type: "string", v: val }, expiresAt });
        return up.includes("GET") ? prev : "OK";
      }
      case "GETDEL": {
        const v = this.get(a[0], "string")?.v ?? null;
        if (v !== null) this.data.delete(a[0]);
        return v;
      }
      case "DEL":
        return a.reduce((n, k) => (this.live(k) && this.data.delete(k) ? n + 1 : n), 0);
      case "EXISTS":
        return a.filter((k) => this.live(k)).length;
      case "INCR":
      case "DECR": {
        const s = this.ensure(a[0], "string", () => ({ type: "string", v: "0" }));
        s.v = String(Number(s.v) + (name.toUpperCase() === "INCR" ? 1 : -1));
        return Number(s.v);
      }
      case "EXPIRE": {
        const e = this.live(a[0]);
        if (!e) return 0;
        e.expiresAt = this.now() + Number(a[1]) * 1000;
        return 1;
      }
      case "TTL":
        return this.live(a[0]) ? (this.ttl(a[0]) ?? -1) : -2;
      case "HSET": {
        const h = this.ensure(a[0], "hash", () => ({ type: "hash", v: new Map() }));
        let added = 0;
        for (let i = 1; i + 1 < a.length; i += 2) {
          if (!h.v.has(a[i])) added++;
          h.v.set(a[i], a[i + 1]);
        }
        return added;
      }
      case "HSETNX": {
        const h = this.ensure(a[0], "hash", () => ({ type: "hash", v: new Map() }));
        if (h.v.has(a[1])) return 0;
        h.v.set(a[1], a[2]);
        return 1;
      }
      case "HGET":
        return this.get(a[0], "hash")?.v.get(a[1]) ?? null;
      case "HMGET": {
        const h = this.get(a[0], "hash");
        return a.slice(1).map((f) => h?.v.get(f) ?? null);
      }
      case "HGETALL": {
        const h = this.get(a[0], "hash");
        return h ? [...h.v.entries()].flat() : [];
      }
      case "HDEL": {
        const h = this.get(a[0], "hash");
        if (!h) return 0;
        const n = a.slice(1).filter((f) => h.v.delete(f)).length;
        if (!h.v.size) this.data.delete(a[0]);
        return n;
      }
      case "HINCRBY": {
        const h = this.ensure(a[0], "hash", () => ({ type: "hash", v: new Map() }));
        const v = Number(h.v.get(a[1]) ?? 0) + Number(a[2]);
        h.v.set(a[1], String(v));
        return v;
      }
      case "SADD": {
        const s = this.ensure(a[0], "set", () => ({ type: "set", v: new Set() }));
        return a.slice(1).filter((m) => !s.v.has(m) && s.v.add(m)).length;
      }
      case "SREM": {
        const s = this.get(a[0], "set");
        return s ? a.slice(1).filter((m) => s.v.delete(m)).length : 0;
      }
      case "SMEMBERS":
        return [...(this.get(a[0], "set")?.v ?? [])];
      case "RPUSH": {
        const l = this.ensure(a[0], "list", () => ({ type: "list", v: [] }));
        l.v.push(...a.slice(1));
        return l.v.length;
      }
      case "LLEN":
        return this.get(a[0], "list")?.v.length ?? 0;
      case "LRANGE":
      case "LTRIM": {
        const l = this.get(a[0], "list");
        const len = l?.v.length ?? 0;
        const norm = (i: number) => (i < 0 ? Math.max(0, len + i) : Math.min(i, len));
        const start = norm(Number(a[1]));
        const stopRaw = Number(a[2]);
        const stop = stopRaw < 0 ? len + stopRaw : Math.min(stopRaw, len - 1);
        const slice = l && start <= stop ? l.v.slice(start, stop + 1) : [];
        if (name.toUpperCase() === "LRANGE") return slice;
        if (l) l.v = slice;
        return "OK";
      }
      case "PING":
        return "PONG";
      case "FLUSHALL":
        this.flush();
        return "OK";
      default:
        throw new Error(`ERR unknown command '${name}'`);
    }
  }

  /** Executes an Upstash REST body: one command (`[...]`) or a pipeline (`[[...], ...]`). */
  handle(path: string, body: unknown): unknown {
    const run = (c: unknown) => {
      try {
        return { result: this.exec((c as unknown[]).map(String)) };
      } catch (e) {
        return { error: (e as Error).message };
      }
    };
    if (path.endsWith("/pipeline") || path.endsWith("/multi-exec")) return (body as unknown[]).map(run);
    return run(body);
  }
}

export const FAKE_URL = "https://fake-upstash.test";
export const FAKE_TOKEN = "fake-token";

/** fetch implementation that answers Upstash REST calls from `redis` (optionally failing on demand). */
export function fakeFetch(redis: FakeRedis, opts: { fail?: () => boolean } = {}): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (opts.fail?.()) throw new TypeError("fetch failed");
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const auth = new Headers(init?.headers).get("authorization");
    if (auth !== `Bearer ${FAKE_TOKEN}`) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const body = JSON.parse(String(init?.body ?? "null"));
    return new Response(JSON.stringify(redis.handle(url.pathname, body)), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

/** HTTP server speaking the Upstash REST protocol (for the Playwright-started app server). */
export function startFakeUpstash(port: number, token = FAKE_TOKEN, redis = new FakeRedis()): Promise<{ server: Server; redis: FakeRedis }> {
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
      let body: unknown = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        res.writeHead(400).end(JSON.stringify({ error: "bad json" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(redis.handle(req.url ?? "/", body)));
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, redis })));
}
