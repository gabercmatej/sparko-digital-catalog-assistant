import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword, parsePasswordHash, verifyPassword } from "@/lib/auth/password";
import { generatePassword, foldUsername } from "@/lib/auth/accounts";
import { authSecret, safeNext } from "@/lib/auth/session";
import { FAST } from "./auth-helpers";

let hash: string;
beforeAll(async () => {
  hash = await hashPassword("correct horse", FAST);
});

describe("password hashing", () => {
  it("has the documented format and verifies", async () => {
    expect(hash).toMatch(/^scrypt:16384:8:1:[\w-]+:[\w-]+$/);
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });
  it("different passwords and repeated hashing give different hashes (fresh salt)", async () => {
    expect(await hashPassword("correct horse", FAST)).not.toBe(hash);
    expect(await hashPassword("other", FAST)).not.toBe(hash);
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

describe("generatePassword", () => {
  it("has the 4x5 group format with unambiguous characters", () => {
    for (let i = 0; i < 50; i++) expect(generatePassword()).toMatch(/^[a-hj-km-np-zA-HJ-NP-Z2-9]{5}(-[a-hj-km-np-zA-HJ-NP-Z2-9]{5}){3}$/);
  });
  it("is unique across many calls", () => {
    const set = new Set(Array.from({ length: 500 }, generatePassword));
    expect(set.size).toBe(500);
  });
});

describe("foldUsername / authSecret", () => {
  it("folds case, accents and whitespace", () => {
    for (const n of ["AlešP", "alesp", "ALEŠP", " AlešP "]) expect(foldUsername(n)).toBe("alesp");
    expect(foldUsername("   ")).toBe("");
  });
  it("authSecret needs >= 32 chars", () => {
    expect(authSecret({ SPARKO_AUTH_SECRET: "x".repeat(31) })).toBeNull();
    expect(authSecret({ SPARKO_AUTH_SECRET: "x".repeat(32) })).toBe("x".repeat(32));
    expect(authSecret({})).toBeNull();
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
      "/aktivacija",
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
