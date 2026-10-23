import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/login/route";
import { POST as LOGOUT } from "@/app/api/auth/logout/route";
import { ACTIVATION_COOKIE, DEVICE_COOKIE, SESSION_COOKIE, validateSession } from "@/lib/auth/session";
import { authBackend } from "@/lib/auth/server";
import { LOGIN_MESSAGES } from "@/lib/auth/messages";
import { listDevices } from "@/lib/auth/accounts";
import { FakeRedis, FAKE_TOKEN, FAKE_URL, fakeFetch } from "../support/fake-upstash";
import { SECRET, dumpRedis, provision } from "./auth-helpers";

let redis = new FakeRedis();
let fetchFails = false;
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
  vi.stubEnv("SPARKO_STORE_PREFIX", "routetest:");
  vi.stubEnv("VERCEL", "");
}

let n = 0;
beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
beforeEach(() => {
  redis = new FakeRedis();
  fetchFails = false;
  configure();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

type Opts = { headers?: Record<string, string>; url?: string; raw?: string };
const login = (body: unknown, o: Opts = {}) =>
  POST(
    new Request(o.url ?? "http://localhost:3100/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost:3100", "x-forwarded-for": `192.0.2.${++n}`, ...o.headers },
      body: o.raw ?? JSON.stringify(body),
    }),
  );
const cookiesOf = (res: Response) => Object.fromEntries(res.headers.getSetCookie().map((c) => [c.split("=")[0], c]));
const valueOf = (setCookie: string) => decodeURIComponent(setCookie.split(";")[0].split("=").slice(1).join("="));

async function reviewer(username = "LidijaR") {
  return provision(authBackend()!.store, username, "reviewer");
}

describe("POST /api/auth/login", () => {
  it("activation: sets HttpOnly session + device cookies, clears the activation cookie, JSON {ok, redirect}", async () => {
    const { password, token } = await reviewer();
    const res = await login(
      { identifier: "lidijar", password, next: "/letak" },
      { headers: { cookie: `${ACTIVATION_COOKIE}=${token}` } },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/letak" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    const c = cookiesOf(res);
    for (const name of [SESSION_COOKIE, DEVICE_COOKIE]) {
      expect(c[name], name).toMatch(/HttpOnly/i);
      expect(c[name], name).toMatch(/SameSite=lax/i);
      expect(c[name], name).toMatch(/Path=\//);
    }
    expect(c[SESSION_COOKIE]).toMatch(/Max-Age=86400/);
    expect(c[DEVICE_COOKIE]).toMatch(/Max-Age=34560000/);
    expect(c[SESSION_COOKIE]).not.toMatch(/Secure/i); // plain http localhost
    expect(c[ACTIVATION_COOKIE]).toMatch(/Max-Age=0/);
    expect(valueOf(c[ACTIVATION_COOKIE])).toBe("");
    // the cookies really form a valid session
    const v = await validateSession(authBackend()!.store, SECRET, valueOf(c[SESSION_COOKIE]), valueOf(c[DEVICE_COOKIE]));
    expect(v?.account.username).toBe("LidijaR");
  });

  it("is Secure on https and on Vercel", async () => {
    const { password, token } = await reviewer();
    const res = await login({ identifier: "LidijaR", password }, { url: "https://sparko.example/api/auth/login", headers: { cookie: `${ACTIVATION_COOKIE}=${token}`, host: "sparko.example", origin: "https://sparko.example" } });
    expect(res.status).toBe(200);
    expect(cookiesOf(res)[SESSION_COOKIE]).toMatch(/Secure/i);
    expect(cookiesOf(res)[DEVICE_COOKIE]).toMatch(/Secure/i);
  });

  it("returning browser: no new device cookie is set", async () => {
    const { password, token } = await reviewer();
    const first = await login({ identifier: "LidijaR", password }, { headers: { cookie: `${ACTIVATION_COOKIE}=${token}` } });
    const device = valueOf(cookiesOf(first)[DEVICE_COOKIE]);
    const again = await login({ identifier: "LidijaR", password }, { headers: { cookie: `${DEVICE_COOKIE}=${device}` } });
    expect(again.status).toBe(200);
    expect(cookiesOf(again)[DEVICE_COOKIE]).toBeUndefined();
    expect(cookiesOf(again)[SESSION_COOKIE]).toBeDefined();
  });

  it("second browser (correct password, no device cookie) -> 403 device_limit with the exact message, no cookies", async () => {
    const { password, token } = await reviewer();
    await login({ identifier: "LidijaR", password }, { headers: { cookie: `${ACTIVATION_COOKIE}=${token}` } });
    const res = await login({ identifier: "LidijaR", password });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: LOGIN_MESSAGES.device_limit, code: "device_limit" });
    expect(LOGIN_MESSAGES.device_limit).toBe("Ta račun je že aktiviran v drugem brskalniku ali napravi. Za ponastavitev dostopa se obrnite na skrbnika.");
    expect(cookiesOf(res)[SESSION_COOKIE]).toBeUndefined();
    expect(cookiesOf(res)[DEVICE_COOKIE]).toBeUndefined();
  });

  it("used activation link from another browser while one is bound -> 403 device_limit, never a session", async () => {
    const { password, token } = await reviewer();
    await login({ identifier: "LidijaR", password }, { headers: { cookie: `${ACTIVATION_COOKIE}=${token}` } });
    const res = await login({ identifier: "LidijaR", password }, { headers: { cookie: `${ACTIVATION_COOKIE}=${token}` } });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("device_limit");
    expect(cookiesOf(res)[SESSION_COOKIE]).toBeUndefined();
  });

  it("dead activation link on an unbound account -> 403 activation_invalid and the link cookie is cleared", async () => {
    const { password } = await reviewer();
    const res = await login({ identifier: "LidijaR", password }, { headers: { cookie: `${ACTIVATION_COOKIE}=${"Z".repeat(43)}` } });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("activation_invalid");
    expect(cookiesOf(res)[ACTIVATION_COOKIE]).toMatch(/Max-Age=0/);
    expect(cookiesOf(res)[SESSION_COOKIE]).toBeUndefined();
  });

  it("activation token in the request body or query is ignored (cookie only)", async () => {
    const { password, token } = await reviewer();
    const res = await login({ identifier: "LidijaR", password, token, activationToken: token }, { url: `http://localhost:3100/api/auth/login?token=${token}` });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("not_activated");
  });

  it("admin login redirects to /skrbnik and sets no device cookie", async () => {
    const { password } = await provision(authBackend()!.store, "Skrbnik", "admin");
    const res = await login({ identifier: "skrbnik", password });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/skrbnik" });
    expect(cookiesOf(res)[SESSION_COOKIE]).toBeDefined();
    expect(cookiesOf(res)[DEVICE_COOKIE]).toBeUndefined();
  });

  it("admin with an explicit safe next keeps it", async () => {
    const { password } = await provision(authBackend()!.store, "Skrbnik", "admin");
    expect(await (await login({ identifier: "Skrbnik", password, next: "/letak" })).json()).toEqual({ ok: true, redirect: "/letak" });
  });

  it("unsafe next falls back to /domov", async () => {
    const { password, token } = await reviewer();
    const res = await login({ identifier: "LidijaR", password, next: "//evil.com" }, { headers: { cookie: `${ACTIVATION_COOKIE}=${token}` } });
    expect((await res.json()).redirect).toBe("/domov");
  });

  it("wrong password and unknown user -> identical 401 body, no cookies", async () => {
    await reviewer();
    const a = await login({ identifier: "LidijaR", password: "nope" });
    const b = await login({ identifier: "ghost", password: "nope" });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(await a.json()).toEqual(await b.json());
    expect(a.headers.getSetCookie()).toEqual([]);
    expect(a.headers.get("cache-control")).toBe("no-store");
  });

  it("cross-origin Origin -> 403 and nothing is authenticated", async () => {
    const { password, token } = await reviewer();
    const res = await login({ identifier: "LidijaR", password }, { headers: { origin: "https://evil.example", cookie: `${ACTIVATION_COOKIE}=${token}` } });
    expect(res.status).toBe(403);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(valueOf("x=" + token)).toBe(token); // token still unspent:
    const ok = await login({ identifier: "LidijaR", password }, { headers: { origin: "http://localhost:3100", cookie: `${ACTIVATION_COOKIE}=${token}` } });
    expect(ok.status).toBe(200);
  });

  it("malformed Origin -> 403; X-Forwarded-Host is honored for same-origin", async () => {
    const { password, token } = await reviewer();
    expect((await login({ identifier: "LidijaR", password }, { headers: { origin: "not a url" } })).status).toBe(403);
    const res = await login({ identifier: "LidijaR", password }, { headers: { origin: "https://app.example", "x-forwarded-host": "app.example", cookie: `${ACTIVATION_COOKIE}=${token}` } });
    expect(res.status).toBe(200);
  });

  it("malformed or unsupported bodies -> 400", async () => {
    expect((await login(null, { raw: "{not json" })).status).toBe(400);
    expect((await login(null, { raw: "x", headers: { "content-type": "text/plain" } })).status).toBe(400);
  });

  it("non-string fields are coerced to empty and rejected", async () => {
    await reviewer();
    const res = await login({ identifier: { $ne: 1 }, password: ["a"] });
    expect(res.status).toBe(401);
  });

  it("over-long fields are truncated, not crashing", async () => {
    const res = await login({ identifier: "a".repeat(10_000), password: "b".repeat(10_000) });
    expect(res.status).toBe(401);
  });

  it("rate limiting -> 429 with the message", async () => {
    await reviewer();
    for (let i = 0; i < 10; i++) await login({ identifier: "LidijaR", password: "bad" });
    const res = await login({ identifier: "LidijaR", password: "bad" });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("rate_limited");
  });

  it("store not configured -> 503 unavailable, no cookies", async () => {
    configure(false);
    const res = await login({ identifier: "LidijaR", password: "x" });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("unavailable");
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("store outage during sign-in -> 503 (fail closed), never a session", async () => {
    const { password, token } = await reviewer();
    fetchFails = true;
    const res = await login({ identifier: "LidijaR", password }, { headers: { cookie: `${ACTIVATION_COOKIE}=${token}` } });
    expect(res.status).toBe(503);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("form post fallback: 303 redirect with cookies; failures redirect with ?napaka and no secrets in the URL", async () => {
    const { password, token } = await reviewer();
    const form = (fields: Record<string, string>, headers: Record<string, string> = {}) =>
      POST(
        new Request("http://localhost:3100/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", host: "localhost:3100", "x-forwarded-for": `192.0.2.${++n}`, ...headers },
          body: new URLSearchParams(fields).toString(),
        }),
      );
    const bad = await form({ identifier: "LidijaR", password: "wrong-pw-123", next: "/letak" });
    expect(bad.status).toBe(303);
    const loc = new URL(bad.headers.get("location")!);
    expect(loc.pathname).toBe("/prijava");
    expect(loc.searchParams.get("napaka")).toBe("1");
    expect(bad.headers.get("location")).not.toContain("wrong-pw-123");
    const ok = await form({ identifier: "LidijaR", password }, { cookie: `${ACTIVATION_COOKIE}=${token}` });
    expect(ok.status).toBe(303);
    expect(new URL(ok.headers.get("location")!).pathname).toBe("/domov");
    expect(cookiesOf(ok)[SESSION_COOKIE]).toMatch(/HttpOnly/i);
  });

  it("does not leak secrets into console output", async () => {
    const spy = vi.mocked(console.error);
    spy.mockClear();
    const { password, token } = await reviewer();
    fetchFails = true;
    await login({ identifier: "LidijaR", password }, { headers: { cookie: `${ACTIVATION_COOKIE}=${token}` } });
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain(password);
    expect(logged).not.toContain(token!);
  });
});

describe("POST /api/auth/logout", () => {
  it("destroys the durable session, clears the session cookie, keeps the device cookie", async () => {
    const { password, token } = await reviewer();
    const res = await login({ identifier: "LidijaR", password }, { headers: { cookie: `${ACTIVATION_COOKIE}=${token}` } });
    const c = cookiesOf(res);
    const session = valueOf(c[SESSION_COOKIE]);
    const device = valueOf(c[DEVICE_COOKIE]);
    const backend = authBackend()!;
    expect(await validateSession(backend.store, SECRET, session, device)).not.toBeNull();

    const out = await LOGOUT(
      new Request("http://localhost:3100/api/auth/logout", { method: "POST", headers: { cookie: `${SESSION_COOKIE}=${session}; ${DEVICE_COOKIE}=${device}` } }),
    );
    expect(out.status).toBe(200);
    const oc = cookiesOf(out);
    expect(oc[SESSION_COOKIE]).toMatch(/Max-Age=0/);
    expect(oc[DEVICE_COOKIE]).toBeUndefined();
    // the old cookie value is dead server-side, not just cleared in the browser
    expect(await validateSession(backend.store, SECRET, session, device)).toBeNull();
    const acct = (await login({ identifier: "LidijaR", password }, { headers: { cookie: `${DEVICE_COOKIE}=${device}` } }));
    expect(acct.status).toBe(200);
    expect(await listDevices(backend.store, (await validateSession(backend.store, SECRET, valueOf(cookiesOf(acct)[SESSION_COOKIE]), device))!.account.id)).toHaveLength(1);
  });

  it("still clears the cookie when nothing is signed in or the store is down", async () => {
    fetchFails = true;
    const out = await LOGOUT(new Request("http://localhost:3100/api/auth/logout", { method: "POST" }));
    expect(out.status).toBe(200);
    expect(cookiesOf(out)[SESSION_COOKIE]).toMatch(/Max-Age=0/);
  });
});

describe("store contents after route use", () => {
  it("never contain the plaintext password, activation token, device credential or session cookie", async () => {
    const { password, token } = await reviewer();
    const res = await login({ identifier: "LidijaR", password }, { headers: { cookie: `${ACTIVATION_COOKIE}=${token}` } });
    const c = cookiesOf(res);
    const dump = dumpRedis(redis);
    for (const s of [password, token!, valueOf(c[DEVICE_COOKIE]), valueOf(c[SESSION_COOKIE])]) expect(dump).not.toContain(s);
  });
});
