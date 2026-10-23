import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword, parsePasswordHash, verifyPassword } from "@/lib/auth/password";
import { identifierMatches, readAuthConfig, type AuthConfig } from "@/lib/auth/config";
import { SESSION_TTL_SECONDS, createSessionToken, safeNext, verifySessionToken } from "@/lib/auth/session";

const FAST = { N: 2 ** 14, r: 8, p: 1 };
const SECRET = "unit-test-secret-0123456789-abcdefghijkl";
let hash: string;
let hash2: string;

beforeAll(async () => {
  hash = await hashPassword("correct horse", FAST);
  hash2 = await hashPassword("another password", FAST);
});

const env = (over: Record<string, string | undefined> = {}) => ({
  SPARKO_DEMO_LOGIN: "SPAR",
  SPARKO_DEMO_PASSWORD_HASH: hash,
  SPARKO_AUTH_SECRET: SECRET,
  ...over,
});
const cfg = (over: Record<string, string | undefined> = {}): AuthConfig => {
  const r = readAuthConfig(env(over));
  if (!r.ok) throw new Error(r.problems.join());
  return r.config;
};

describe("password hashing", () => {
  it("has the documented format and verifies", async () => {
    expect(hash).toMatch(/^scrypt:16384:8:1:[\w-]+:[\w-]+$/);
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });
  it("uses a fresh salt each time", async () => {
    expect(await hashPassword("correct horse", FAST)).not.toBe(hash);
  });
  it("rejects malformed hashes", async () => {
    const [, , , , salt, h] = hash.split(":");
    const bad = [
      "",
      "plaintext",
      `bcrypt:16384:8:1:${salt}:${h}`,
      `scrypt:16384:8:1:${salt}`,
      `scrypt:16384:8:1:${salt}:${h}:x`,
      `scrypt:1000:8:1:${salt}:${h}`,
      `scrypt:20000:8:1:${salt}:${h}`,
      `scrypt:${2 ** 21}:8:1:${salt}:${h}`,
      `scrypt:16384:0:1:${salt}:${h}`,
      `scrypt:16384:8:9:${salt}:${h}`,
      `scrypt:16384:8:1:abc:${h}`,
      `scrypt:16384:8:1:${salt}:abc`,
      `scrypt:abc:8:1:${salt}:${h}`,
    ];
    for (const b of bad) {
      expect(parsePasswordHash(b), b).toBeNull();
      expect(await verifyPassword("correct horse", b), b).toBe(false);
    }
    expect(parsePasswordHash(undefined)).toBeNull();
    expect(parsePasswordHash(hash)).not.toBeNull();
  });
});

describe("readAuthConfig", () => {
  it("accepts a valid config", () => {
    const r = readAuthConfig(env());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.email).toBeNull();
      expect(r.config.fingerprint).toHaveLength(16);
    }
  });
  it("reports missing variables by name only", () => {
    expect(readAuthConfig({})).toEqual({ ok: false, problems: ["SPARKO_DEMO_LOGIN", "SPARKO_DEMO_PASSWORD_HASH", "SPARKO_AUTH_SECRET"] });
  });
  it("never leaks values in problems", () => {
    const r = readAuthConfig(env({ SPARKO_AUTH_SECRET: "short-secret-value", SPARKO_DEMO_PASSWORD_HASH: "garbage-hash-value" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems).toEqual(["SPARKO_DEMO_PASSWORD_HASH", "SPARKO_AUTH_SECRET"]);
      expect(JSON.stringify(r)).not.toMatch(/short-secret-value|garbage-hash-value/);
    }
  });
  it("rejects a 31-char secret and accepts 32", () => {
    expect(readAuthConfig(env({ SPARKO_AUTH_SECRET: "x".repeat(31) })).ok).toBe(false);
    expect(readAuthConfig(env({ SPARKO_AUTH_SECRET: "x".repeat(32) })).ok).toBe(true);
  });
  it("rejects a malformed email", () => {
    for (const e of ["not-an-email", "a@b", "a b@c.d", "@x.si"]) {
      const r = readAuthConfig(env({ SPARKO_DEMO_EMAIL: e }));
      expect(r.ok, e).toBe(false);
      if (!r.ok) expect(r.problems).toEqual(["SPARKO_DEMO_EMAIL"]);
    }
    expect(readAuthConfig(env({ SPARKO_DEMO_EMAIL: "demo@sparko.si" })).ok).toBe(true);
    expect(readAuthConfig(env({ SPARKO_DEMO_EMAIL: "  " })).ok).toBe(true);
  });
  it("treats whitespace-only login as missing", () => {
    expect(readAuthConfig(env({ SPARKO_DEMO_LOGIN: "   " }))).toMatchObject({ ok: false, problems: ["SPARKO_DEMO_LOGIN"] });
  });
});

describe("identifierMatches", () => {
  it("matches the username case-insensitively", () => {
    const c = cfg();
    for (const id of ["SPAR", "spar", " Spar "]) expect(identifierMatches(id, c)).toBe(true);
    expect(identifierMatches("spar2", c)).toBe(false);
    expect(identifierMatches("", c)).toBe(false);
    expect(identifierMatches("   ", c)).toBe(false);
  });
  it("accepts the email alias only when configured", () => {
    expect(identifierMatches("demo@sparko.si", cfg())).toBe(false);
    const c = cfg({ SPARKO_DEMO_EMAIL: "Demo@Sparko.si" });
    expect(identifierMatches("demo@sparko.si", c)).toBe(true);
    expect(identifierMatches("other@sparko.si", c)).toBe(false);
    expect(identifierMatches("admin@gmail.com", c)).toBe(false);
  });
});

describe("session tokens", () => {
  it("verifies a fresh token", async () => {
    const c = cfg();
    expect(await verifySessionToken(await createSessionToken(c), c)).toBe(true);
  });
  it("rejects missing, garbage, oversized and tampered tokens", async () => {
    const c = cfg();
    const t = await createSessionToken(c);
    expect(await verifySessionToken(undefined, c)).toBe(false);
    expect(await verifySessionToken("", c)).toBe(false);
    expect(await verifySessionToken("garbage", c)).toBe(false);
    expect(await verifySessionToken("a".repeat(5000), c)).toBe(false);
    const i = Math.floor(t.length / 2);
    const tampered = t.slice(0, i) + (t[i] === "A" ? "B" : "A") + t.slice(i + 1);
    expect(await verifySessionToken(tampered, c)).toBe(false);
    expect(await verifySessionToken(t.slice(0, -4), c)).toBe(false);
  });
  it("rejects a token sealed with another secret", async () => {
    const c = cfg();
    const other = cfg({ SPARKO_AUTH_SECRET: "a-different-secret-0123456789-abcdefgh" });
    expect(await verifySessionToken(await createSessionToken(other), c)).toBe(false);
  });
  it("expires after the TTL (via now)", async () => {
    const c = cfg();
    const t = await createSessionToken(c);
    const base = Date.now();
    expect(await verifySessionToken(t, c, base + (SESSION_TTL_SECONDS - 120) * 1000)).toBe(true);
    expect(await verifySessionToken(t, c, base + (SESSION_TTL_SECONDS + 120) * 1000)).toBe(false);
  });
  it("rejects a token issued in the far future", async () => {
    const c = cfg();
    const t = await createSessionToken(c, Date.now() + 3600_000);
    expect(await verifySessionToken(t, c)).toBe(false);
  });
  it("is invalidated by password rotation and login change", async () => {
    const c = cfg();
    const t = await createSessionToken(c);
    expect(await verifySessionToken(t, cfg({ SPARKO_DEMO_PASSWORD_HASH: hash2 }))).toBe(false);
    expect(await verifySessionToken(t, cfg({ SPARKO_DEMO_LOGIN: "OTHER" }))).toBe(false);
    expect(await verifySessionToken(t, cfg({ SPARKO_DEMO_LOGIN: "spar" }))).toBe(true);
  });
});

describe("safeNext", () => {
  it("allows in-app paths", () => {
    for (const p of ["/", "/domov", "/letak?p=2", "/moj-katalog#x", "/domov/sub"]) expect(safeNext(p), p).toBe(p);
  });
  it("falls back for unsafe values", () => {
    const bad = [
      "//evil.com",
      "///evil.com",
      "/\\evil.com",
      "\\\\evil.com",
      "https://evil.com",
      "http://evil.com/domov",
      "javascript:alert(1)",
      "evil",
      "",
      "/api/chat",
      "/api/auth/login",
      "/prijava",
      "/prijava?next=/domov",
      "/_next/static/x.js",
      "/do\nmov",
      "/" + "a".repeat(600),
      undefined,
      null,
      42,
      {},
    ];
    for (const b of bad) expect(safeNext(b), String(b)).toBe("/domov");
    expect(safeNext("//evil", "/x")).toBe("/x");
  });
});
