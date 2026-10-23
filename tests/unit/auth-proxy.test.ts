import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";

const jar = vi.hoisted(() => ({ cookies: {} as Record<string, string> }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name in jar.cookies ? { name, value: jar.cookies[name] } : undefined) }),
}));

import { proxy } from "@/proxy";
import { authenticate } from "@/lib/auth/login";
import { createSession, DEVICE_COOKIE, SESSION_COOKIE, ACTIVATION_COOKIE } from "@/lib/auth/session";
import { authBackend, requireAdmin } from "@/lib/auth/server";
import { getStats } from "@/lib/auth/analytics";
import { FakeRedis, FAKE_TOKEN, FAKE_URL, fakeFetch } from "../support/fake-upstash";
import { SECRET, freshIp, provision } from "./auth-helpers";

let redis = new FakeRedis();
let fetchFails = false;
// The store captures `fetch` when first created, so stub a delegating function once, up front.
vi.stubGlobal("fetch", ((input: RequestInfo | URL, init?: RequestInit) => {
  if (fetchFails) return Promise.reject(new TypeError("fetch failed"));
  return fakeFetch(redis)(input, init);
}) as typeof fetch);

function configure(on = true) {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", on ? FAKE_URL : "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", on ? FAKE_TOKEN : "");
  vi.stubEnv("KV_REST_API_URL", "");
  vi.stubEnv("KV_REST_API_TOKEN", "");
  vi.stubEnv("SPARKO_AUTH_SECRET", on ? SECRET : "");
  vi.stubEnv("SPARKO_STORE_PREFIX", "proxytest:");
}

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
beforeEach(() => {
  redis = new FakeRedis();
  fetchFails = false;
  jar.cookies = {};
  configure();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const pending: Promise<unknown>[] = [];
const event = { waitUntil: (p: Promise<unknown>) => void pending.push(p) } as unknown as NextFetchEvent;

async function call(path: string, headers: Record<string, string> = {}) {
  const res = await proxy(new NextRequest(`http://localhost:3100${path}`, { headers }), event);
  await Promise.all(pending.splice(0));
  return res;
}
const location = (res: Response) => new URL(res.headers.get("location")!, "http://localhost:3100");
const cookieHeader = (c: Record<string, string>) => Object.entries(c).map(([k, v]) => `${k}=${v}`).join("; ");

/** Signs a user in directly against the store; returns the cookie header. */
async function signIn(username: string, role: "reviewer" | "admin") {
  const backend = authBackend()!;
  const p = await provision(backend.store, username, role);
  const r = await authenticate(backend.store, { identifier: username, password: p.password, activationToken: p.token }, { ip: freshIp() });
  if (!r.ok) throw new Error(`login failed: ${r.code}`);
  const session = await createSession(backend.store, backend.secret, r.account, r.device);
  const cookies: Record<string, string> = { [SESSION_COOKIE]: session };
  if (r.deviceCredential) cookies[DEVICE_COOKIE] = r.deviceCredential;
  return { cookies, header: cookieHeader(cookies), account: r.account };
}

describe("unauthenticated requests", () => {
  it("/api/chat -> 401 JSON", async () => {
    const res = await call("/api/chat");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "unauthorized" });
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
  it("/domov redirects to /prijava?next=/domov", async () => {
    const res = await call("/domov");
    expect(res.status).toBe(307);
    expect(location(res).pathname).toBe("/prijava");
    expect(location(res).searchParams.get("next")).toBe("/domov");
  });
  it("/ redirects to /prijava without next", async () => {
    const res = await call("/");
    expect(location(res).pathname).toBe("/prijava");
    expect(location(res).searchParams.has("next")).toBe(false);
  });
  it("static file /catalog/x.webp -> 401", async () => {
    const res = await call("/catalog/x.webp");
    expect(res.status).toBe(401);
  });
  it("/prijava and /aktivacija are public", async () => {
    for (const p of ["/prijava", "/aktivacija"]) expect((await call(p)).headers.get("location")).toBeNull();
  });
  it("/skrbnik and /api/admin/accounts require sign-in", async () => {
    expect(location(await call("/skrbnik")).pathname).toBe("/prijava");
    expect((await call("/api/admin/accounts")).status).toBe(401);
  });
  it("garbage session cookie is treated as signed out", async () => {
    expect((await call("/api/chat", { cookie: `${SESSION_COOKIE}=garbage` })).status).toBe(401);
    expect((await call("/catalog/x.webp", { cookie: `${SESSION_COOKIE}=garbage` })).status).toBe(401);
  });
  it("public auth API endpoints pass through", async () => {
    for (const p of ["/api/auth/login", "/api/auth/logout", "/api/auth/session"]) expect((await call(p)).status).toBe(200);
  });
});

describe("store / secret not configured (fail closed)", () => {
  it("everything is unauthenticated, even with a plausible cookie", async () => {
    const { header } = await signIn("LidijaR", "reviewer");
    configure(false);
    expect((await call("/api/chat", { cookie: header })).status).toBe(401);
    expect(location(await call("/domov", { cookie: header })).pathname).toBe("/prijava");
    expect((await call("/catalog/x.webp", { cookie: header })).status).toBe(401);
  });
  it("store outage -> pages and API are treated as signed out", async () => {
    const { header } = await signIn("LidijaR", "reviewer");
    fetchFails = true;
    expect((await call("/api/chat", { cookie: header })).status).toBe(401);
    expect(location(await call("/domov", { cookie: header })).pathname).toBe("/prijava");
  });
});

describe("activation link handling", () => {
  it("valid token -> redirect to /aktivacija with HttpOnly cookie and no token in Location", async () => {
    const token = "A".repeat(43);
    const res = await call(`/aktivacija?token=${token}`);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).not.toContain(token);
    expect(res.headers.get("location")).not.toContain("token");
    expect(location(res).pathname).toBe("/aktivacija");
    const set = res.headers.getSetCookie().find((c) => c.startsWith(`${ACTIVATION_COOKIE}=`))!;
    expect(set).toContain(token);
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=lax/i);
    expect(set).toMatch(/Max-Age=3600/);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
  it("malformed token -> redirect without cookie", async () => {
    for (const t of ["short", "x".repeat(200), "bad token!", ""]) {
      const res = await call(`/aktivacija?token=${encodeURIComponent(t)}`);
      expect(location(res).pathname, t).toBe("/aktivacija");
      expect(location(res).search).toBe("");
      expect(res.headers.getSetCookie(), t).toEqual([]);
    }
  });
  it("token is stripped even for signed-in visitors' requests (no store lookup needed)", async () => {
    const { header } = await signIn("LidijaR", "reviewer");
    const res = await call(`/aktivacija?token=${"B".repeat(43)}`, { cookie: header });
    expect(location(res).search).toBe("");
  });
});

describe("signed-in reviewer", () => {
  it("passes through to pages, API and files", async () => {
    const { header } = await signIn("LidijaR", "reviewer");
    for (const p of ["/domov", "/api/chat", "/catalog/x.webp", "/letak"]) {
      const res = await call(p, { cookie: header });
      expect(res.headers.get("location"), p).toBeNull();
      expect(res.status, p).toBe(200);
    }
  });
  it("is redirected away from /prijava, honoring a safe next only", async () => {
    const { header } = await signIn("LidijaR", "reviewer");
    expect(location(await call("/prijava", { cookie: header })).pathname).toBe("/domov");
    expect(location(await call("/prijava?next=/letak", { cookie: header })).pathname).toBe("/letak");
    const evil = await call("/prijava?next=//evil.com", { cookie: header });
    expect(location(evil).host).toBe("localhost:3100");
    expect(location(evil).pathname).toBe("/domov");
  });
  it("reviewer cannot access admin: /skrbnik -> /domov, /api/admin/accounts -> 403", async () => {
    const { header } = await signIn("LidijaR", "reviewer");
    const page = await call("/skrbnik", { cookie: header });
    expect(location(page).pathname).toBe("/domov");
    expect(location(await call("/skrbnik/x", { cookie: header })).pathname).toBe("/domov");
    const api = await call("/api/admin/accounts", { cookie: header });
    expect(api.status).toBe(403);
    expect(await api.json()).toMatchObject({ code: "forbidden" });
  });
  it("requireAdmin() returns 403 for a reviewer, 401 without session, ok for admin", async () => {
    const reviewer = await signIn("LidijaR", "reviewer");
    jar.cookies = reviewer.cookies;
    const r = await requireAdmin();
    expect(r.response?.status).toBe(403);
    jar.cookies = {};
    expect((await requireAdmin()).response?.status).toBe(401);
    const admin = await signIn("Skrbnik", "admin");
    jar.cookies = admin.cookies;
    const a = await requireAdmin();
    expect(a.response).toBeNull();
    expect(a.session?.account.role).toBe("admin");
  });
  it("a copied session cookie without its device cookie is rejected", async () => {
    const { cookies } = await signIn("LidijaR", "reviewer");
    const stolen = cookieHeader({ [SESSION_COOKIE]: cookies[SESSION_COOKIE] });
    expect((await call("/api/chat", { cookie: stolen })).status).toBe(401);
    expect((await call("/catalog/x.webp", { cookie: stolen })).status).toBe(401);
  });
});

describe("signed-in admin", () => {
  it("can open /skrbnik and /api/admin/*", async () => {
    const { header } = await signIn("Skrbnik", "admin");
    expect((await call("/skrbnik", { cookie: header })).status).toBe(200);
    const api = await call("/api/admin/accounts", { cookie: header });
    expect(api.status).toBe(200);
    expect(api.headers.get("cache-control")).toContain("no-store");
  });
});

describe("visit analytics from the proxy", () => {
  it("counts one visit for many requests; pageViews only for document navigations", async () => {
    const { header, account } = await signIn("LidijaR", "reviewer");
    const backend = authBackend()!;
    await call("/domov", { cookie: header, "sec-fetch-dest": "document" });
    await call("/api/chat", { cookie: header });
    await call("/domov", { cookie: header, "sec-fetch-dest": "document" });
    const stats = (await getStats(backend.store, [account.id]))[account.id];
    expect(stats.visits).toBe(1);
    expect(stats.pageViews).toBe(2);
  });
  it("prefetches and static files are not recorded", async () => {
    const { header, account } = await signIn("LidijaR", "reviewer");
    const backend = authBackend()!;
    const before = (await getStats(backend.store, [account.id]))[account.id];
    redis.expireNow(backend.store.key("active", account.id));
    await call("/letak", { cookie: header, "next-router-prefetch": "1" });
    await call("/catalog/x.webp", { cookie: header });
    const after = (await getStats(backend.store, [account.id]))[account.id];
    expect(after).toEqual(before);
  });
  it("unauthenticated requests are not recorded", async () => {
    const before = redis.commandCount;
    await call("/api/chat");
    expect(redis.commandCount).toBe(before);
  });
});
