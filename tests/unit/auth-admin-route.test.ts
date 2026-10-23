import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ cookies: {} as Record<string, string> }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name in jar.cookies ? { name, value: jar.cookies[name] } : undefined) }),
}));

import { POST } from "@/app/api/admin/accounts/[id]/route";
import { authenticate } from "@/lib/auth/login";
import { createSession, DEVICE_COOKIE, SESSION_COOKIE, validateSession } from "@/lib/auth/session";
import { authBackend } from "@/lib/auth/server";
import { getAccount, listDevices, peekActivationToken } from "@/lib/auth/accounts";
import { FakeRedis, FAKE_TOKEN, FAKE_URL, fakeFetch } from "../support/fake-upstash";
import { SECRET, freshIp, provision } from "./auth-helpers";

let redis = new FakeRedis();
vi.stubGlobal("fetch", ((input: RequestInfo | URL, init?: RequestInit) => fakeFetch(redis)(input, init)) as typeof fetch);

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
beforeEach(() => {
  redis = new FakeRedis();
  jar.cookies = {};
  vi.stubEnv("UPSTASH_REDIS_REST_URL", FAKE_URL);
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", FAKE_TOKEN);
  vi.stubEnv("KV_REST_API_URL", "");
  vi.stubEnv("KV_REST_API_TOKEN", "");
  vi.stubEnv("SPARKO_AUTH_SECRET", SECRET);
  vi.stubEnv("SPARKO_STORE_PREFIX", "adminroute:");
  vi.stubEnv("SPARKO_PUBLIC_URL", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function signIn(username: string, role: "reviewer" | "admin") {
  const backend = authBackend()!;
  const p = await provision(backend.store, username, role);
  const r = await authenticate(backend.store, { identifier: username, password: p.password, activationToken: p.token }, { ip: freshIp() });
  if (!r.ok) throw new Error(r.code);
  const session = await createSession(backend.store, backend.secret, r.account, r.device);
  const cookies: Record<string, string> = { [SESSION_COOKIE]: session };
  if (r.deviceCredential) cookies[DEVICE_COOKIE] = r.deviceCredential;
  return { cookies, ...p, account: r.account };
}

const act = (id: string, action: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request(`http://localhost:3100/api/admin/accounts/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost:3100", ...headers },
      body: JSON.stringify({ action }),
    }),
    { params: Promise.resolve({ id }) },
  );

async function asAdmin() {
  const admin = await signIn("Skrbnik", "admin");
  jar.cookies = admin.cookies;
}

describe("POST /api/admin/accounts/[id]", () => {
  it("requires an admin: 401 anonymous, 403 reviewer", async () => {
    const rev = await signIn("LidijaR", "reviewer");
    expect((await act(rev.account.id, "reset")).status).toBe(401);
    jar.cookies = rev.cookies;
    expect((await act(rev.account.id, "reset")).status).toBe(403);
  });

  it("remove_device is gone -> 400", async () => {
    const rev = await provision(authBackend()!.store, "LidijaR", "reviewer");
    await asAdmin();
    expect((await act(rev.account.id, "remove_device")).status).toBe(400);
  });

  it("new_link on a not-activated account -> ok with a usable link (old one invalidated)", async () => {
    const backend = authBackend()!;
    const rev = await provision(backend.store, "LidijaR", "reviewer");
    await asAdmin();
    const res = await act(rev.account.id, "new_link");
    expect(res.status).toBe(200);
    const url = new URL((await res.json()).activationUrl);
    expect(url.pathname).toBe("/aktivacija");
    const fresh = url.searchParams.get("token")!;
    expect(fresh).not.toBe(rev.token);
    expect(await peekActivationToken(backend.store, rev.token!)).toBeNull();
    expect(await peekActivationToken(backend.store, fresh)).toBe(rev.account.id);
  });

  it("new_link on an activated account -> 409 and nothing changes", async () => {
    const backend = authBackend()!;
    const rev = await signIn("LidijaR", "reviewer");
    await asAdmin();
    const res = await act(rev.account.id, "new_link");
    expect(res.status).toBe(409);
    expect((await getAccount(backend.store, rev.account.id))?.actHash).toBeNull();
    expect(await listDevices(backend.store, rev.account.id)).toHaveLength(1);
    jar.cookies = rev.cookies;
    expect(await validateSession(backend.store, SECRET, rev.cookies[SESSION_COOKIE], rev.cookies[DEVICE_COOKIE])).not.toBeNull();
  });

  it("reset on an activated account signs out its browser and returns a new link", async () => {
    const backend = authBackend()!;
    const rev = await signIn("LidijaR", "reviewer");
    await asAdmin();
    const res = await act(rev.account.id, "reset");
    expect(res.status).toBe(200);
    const token = new URL((await res.json()).activationUrl).searchParams.get("token")!;
    expect(await peekActivationToken(backend.store, token)).toBe(rev.account.id);
    expect(await validateSession(backend.store, SECRET, rev.cookies[SESSION_COOKIE], rev.cookies[DEVICE_COOKIE])).toBeNull();
    expect(await listDevices(backend.store, rev.account.id)).toHaveLength(0);
  });

  it("reviewer-only actions are rejected for admins, unknown ids 404, bad ids 400, cross-origin 403", async () => {
    const backend = authBackend()!;
    await asAdmin();
    const adm = (await import("@/lib/auth/accounts")).findAccountByUsername(backend.store, "Skrbnik");
    expect((await act((await adm)!.id, "reset")).status).toBe(400);
    expect((await act("r_missing", "reset")).status).toBe(404);
    expect((await act("bad id!", "reset")).status).toBe(400);
    expect((await act("r_missing", "reset", { origin: "https://evil.example" })).status).toBe(403);
  });

  it("an admin cannot revoke themselves; revoke/restore work for reviewers", async () => {
    const backend = authBackend()!;
    const rev = await signIn("LidijaR", "reviewer");
    const admin = await signIn("Skrbnik", "admin");
    jar.cookies = admin.cookies;
    expect((await act(admin.account.id, "revoke")).status).toBe(400);
    expect((await act(rev.account.id, "revoke")).status).toBe(200);
    expect((await getAccount(backend.store, rev.account.id))?.status).toBe("revoked");
    expect((await act(rev.account.id, "restore")).status).toBe(200);
    expect((await getAccount(backend.store, rev.account.id))?.status).toBe("active");
  });

  it("rotate_password returns a new password once, never stores it in plaintext", async () => {
    const backend = authBackend()!;
    const rev = await signIn("LidijaR", "reviewer");
    await asAdmin();
    const res = await act(rev.account.id, "rotate_password");
    const { password } = await res.json();
    expect(password).toMatch(/^[\w]{5}(-[\w]{5}){3}$/);
    const { dumpRedis } = await import("./auth-helpers");
    expect(dumpRedis(redis)).not.toContain(password);
    expect(await validateSession(backend.store, SECRET, rev.cookies[SESSION_COOKIE], rev.cookies[DEVICE_COOKIE])).toBeNull();
  });
});
