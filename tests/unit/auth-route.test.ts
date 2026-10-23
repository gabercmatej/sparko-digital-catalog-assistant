import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/login/route";
import { POST as LOGOUT } from "@/app/api/auth/logout/route";
import { proxy } from "@/proxy";
import { hashPassword } from "@/lib/auth/password";
import { readAuthConfig } from "@/lib/auth/config";
import { createSessionToken } from "@/lib/auth/session";

const SECRET = "route-test-secret-0123456789-abcdefghijk";
const PASSWORD = "route-Pass-123";
const GENERIC = "Napačno uporabniško ime ali geslo.";
let hash: string;
let n = 0;

beforeAll(async () => {
  hash = await hashPassword(PASSWORD, { N: 2 ** 14, r: 8, p: 1 });
});
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("SPARKO_DEMO_LOGIN", "SPAR");
  vi.stubEnv("SPARKO_DEMO_PASSWORD_HASH", hash);
  vi.stubEnv("SPARKO_AUTH_SECRET", SECRET);
  vi.stubEnv("SPARKO_DEMO_EMAIL", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const login = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost:3100/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost:3100", "x-forwarded-for": `192.0.2.${++n}`, ...headers },
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/auth/login", () => {
  it("valid credentials -> 200 + HttpOnly SameSite=Lax cookie", async () => {
    const res = await login({ identifier: "spar", password: PASSWORD, next: "/letak" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/letak" });
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^sparko_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=86400/);
    expect(cookie).not.toMatch(/;\s*Secure/i);
  });
  it("sets Secure over https", async () => {
    const res = await POST(
      new Request("https://sparko.example/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", host: "sparko.example", "x-forwarded-for": `192.0.2.${++n}` },
        body: JSON.stringify({ identifier: "SPAR", password: PASSWORD }),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/;\s*Secure/i);
  });
  it("unsafe next falls back to /domov", async () => {
    const res = await login({ identifier: "SPAR", password: PASSWORD, next: "//evil.com" });
    expect((await res.json()).redirect).toBe("/domov");
  });
  it("wrong password -> 401 generic, no cookie", async () => {
    const res = await login({ identifier: "SPAR", password: "nope" });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe(GENERIC);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
  it("unknown user -> 401 with the same message (even with the right password)", async () => {
    const res = await login({ identifier: "nobody", password: PASSWORD });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe(GENERIC);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
  it("arbitrary email rejected; configured email alias accepted", async () => {
    vi.stubEnv("SPARKO_DEMO_EMAIL", "demo@sparko.si");
    expect((await login({ identifier: "other@sparko.si", password: PASSWORD })).status).toBe(401);
    expect((await login({ identifier: "Demo@Sparko.si", password: PASSWORD })).status).toBe(200);
  });
  it("empty / non-string fields -> 401", async () => {
    expect((await login({ identifier: "SPAR", password: "" })).status).toBe(401);
    expect((await login({ identifier: 1, password: 2 })).status).toBe(401);
  });
  it("non-JSON body -> 400", async () => {
    const res = await POST(new Request("http://localhost:3100/api/auth/login", { method: "POST", headers: { "content-type": "text/plain", "x-forwarded-for": `192.0.2.${++n}` }, body: "x" }));
    expect(res.status).toBe(400);
  });
  it("missing config -> 503 and never 200, even with a plausible password", async () => {
    for (const name of ["SPARKO_DEMO_LOGIN", "SPARKO_DEMO_PASSWORD_HASH", "SPARKO_AUTH_SECRET"]) {
      vi.stubEnv(name, "");
      const res = await login({ identifier: "SPAR", password: PASSWORD });
      expect(res.status, name).toBe(503);
      expect(res.headers.get("set-cookie")).toBeNull();
      vi.stubEnv("SPARKO_DEMO_LOGIN", "SPAR");
      vi.stubEnv("SPARKO_DEMO_PASSWORD_HASH", hash);
      vi.stubEnv("SPARKO_AUTH_SECRET", SECRET);
    }
  });
  it("short secret -> 503", async () => {
    vi.stubEnv("SPARKO_AUTH_SECRET", "too-short");
    expect((await login({ identifier: "SPAR", password: PASSWORD })).status).toBe(503);
  });
  it("cross-origin -> 403", async () => {
    const res = await login({ identifier: "SPAR", password: PASSWORD }, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
  it("same-origin Origin header is accepted", async () => {
    expect((await login({ identifier: "SPAR", password: PASSWORD }, { origin: "http://localhost:3100" })).status).toBe(200);
  });
  it("form post failure -> 303 to /prijava?napaka=1", async () => {
    const res = await POST(
      new Request("http://localhost:3100/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", host: "localhost:3100", "x-forwarded-for": `192.0.2.${++n}` },
        body: "identifier=SPAR&password=bad&next=/letak",
      }),
    );
    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/prijava");
    expect(loc.searchParams.get("napaka")).toBe("1");
  });
  it("rate limits one IP after 10 attempts -> 429", async () => {
    const ip = { "x-forwarded-for": "192.0.2.250" };
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await login({ identifier: "SPAR", password: "bad" }, ip)).status;
    expect(last).toBe(429);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the cookie", async () => {
    const res = await LOGOUT(new Request("http://localhost:3100/api/auth/logout", { method: "POST", headers: { host: "localhost:3100" } }));
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("set-cookie")).toMatch(/sparko_session=;|Max-Age=0|Expires=/i);
  });
});

describe("proxy gate", () => {
  const req = (path: string, cookie?: string) => new NextRequest(`http://localhost:3100${path}`, { headers: cookie ? { cookie } : {} });
  const sessionCookie = async () => {
    const cfg = readAuthConfig(process.env);
    if (!cfg.ok) throw new Error("setup");
    return `sparko_session=${await createSessionToken(cfg.config)}`;
  };

  it("unauthenticated page -> redirect to /prijava with next (omitted for /)", async () => {
    const r1 = await proxy(req("/moj-katalog?x=1"));
    expect(r1.status).toBe(307);
    const loc = new URL(r1.headers.get("location")!);
    expect(loc.pathname).toBe("/prijava");
    expect(loc.searchParams.get("next")).toBe("/moj-katalog?x=1");
    expect(new URL((await proxy(req("/"))).headers.get("location")!).search).toBe("");
  });
  it("unauthenticated API and files -> 401", async () => {
    expect((await proxy(req("/api/chat"))).status).toBe(401);
    expect((await proxy(req("/catalog/x.webp"))).status).toBe(401);
    expect((await proxy(req("/products/x.png"))).status).toBe(401);
  });
  it("auth endpoints and /prijava stay public", async () => {
    for (const p of ["/api/auth/login", "/api/auth/logout", "/api/auth/session", "/prijava"]) {
      expect((await proxy(req(p))).headers.get("x-middleware-next"), p).toBe("1");
    }
  });
  it("fails closed with no config, even with a previously valid cookie", async () => {
    const cookie = await sessionCookie();
    vi.stubEnv("SPARKO_AUTH_SECRET", "");
    expect((await proxy(req("/domov", cookie))).status).toBe(307);
    expect((await proxy(req("/api/chat", cookie))).status).toBe(401);
  });
  it("valid cookie passes; signed-in /prijava bounces to the app", async () => {
    const cookie = await sessionCookie();
    expect((await proxy(req("/domov", cookie))).headers.get("x-middleware-next")).toBe("1");
    expect((await proxy(req("/api/chat", cookie))).headers.get("x-middleware-next")).toBe("1");
    const r = await proxy(req("/prijava?next=/letak", cookie));
    expect(new URL(r.headers.get("location")!).pathname).toBe("/letak");
  });
  it("garbage cookie is rejected", async () => {
    expect((await proxy(req("/domov", "sparko_session=garbage"))).status).toBe(307);
  });
});
