import { describe, expect, it } from "vitest";
import { LOGIN_ACCOUNT_LIMIT, LOGIN_IP_LIMIT, LOGIN_WINDOW_SECONDS, checkLoginAttempt, refundLoginAttempt } from "@/lib/auth/ratelimit";
import { StoreError } from "@/lib/auth/store";
import { dumpRedis, makeStore } from "./auth-helpers";

describe("login rate limit (durable store)", () => {
  const now = 1_800_000_000_000;

  it("allows LOGIN_IP_LIMIT attempts per IP, then blocks; other IPs unaffected", async () => {
    const { store } = makeStore();
    for (let i = 0; i < LOGIN_IP_LIMIT; i++) expect(await checkLoginAttempt(store, "203.0.113.1", `u${i}`, now)).toBe(true);
    expect(await checkLoginAttempt(store, "203.0.113.1", "fresh", now)).toBe(false);
    expect(await checkLoginAttempt(store, "203.0.113.2", "u", now)).toBe(true);
  });

  it("every attempt counts against a username up front; case/accent-insensitive key", async () => {
    const { store } = makeStore();
    for (let i = 0; i < LOGIN_ACCOUNT_LIMIT; i++) expect(await checkLoginAttempt(store, `203.0.113.${10 + i}`, i % 2 ? "AlešP" : " alesp ", now)).toBe(true);
    expect(await checkLoginAttempt(store, "203.0.113.4", "ALEŠP", now)).toBe(false);
    expect(await checkLoginAttempt(store, "203.0.113.4", "someone-else", now)).toBe(true);
  });

  it("parallel bursts cannot overshoot the username budget", async () => {
    const { store } = makeStore();
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) => checkLoginAttempt(store, `198.51.100.${i}`, "victim", now)));
    expect(results.filter(Boolean)).toHaveLength(LOGIN_ACCOUNT_LIMIT);
  });

  it("successful sign-ins give their attempt back", async () => {
    const { store } = makeStore();
    for (let i = 0; i < LOGIN_ACCOUNT_LIMIT * 2; i++) {
      expect(await checkLoginAttempt(store, `192.0.2.${i}`, "u", now)).toBe(true);
      await refundLoginAttempt(store, "u", now);
    }
  });

  it("recovers in the next window", async () => {
    const { store } = makeStore();
    for (let i = 0; i < LOGIN_ACCOUNT_LIMIT; i++) await checkLoginAttempt(store, `203.0.113.${i}`, "u", now);
    expect(await checkLoginAttempt(store, "203.0.113.5", "u", now)).toBe(false);
    expect(await checkLoginAttempt(store, "203.0.113.5", "u", now + (LOGIN_WINDOW_SECONDS + 1) * 1000)).toBe(true);
  });

  it("keys carry an expiry and never contain the raw IP or username", async () => {
    const { store, redis } = makeStore();
    await checkLoginAttempt(store, "203.0.113.77", "SecretUserName", now);
    const keys = redis.keys();
    expect(keys.length).toBe(2);
    for (const k of keys) expect(redis.ttl(k)).toBeGreaterThan(0);
    const dump = dumpRedis(redis);
    expect(dump).not.toContain("203.0.113.77");
    expect(dump.toLowerCase()).not.toContain("secretusername");
  });

  it("throws StoreError when the store is down (fail closed)", async () => {
    const { store } = makeStore({ fail: () => true });
    await expect(checkLoginAttempt(store, "203.0.113.9", "u", now)).rejects.toBeInstanceOf(StoreError);
    await expect(refundLoginAttempt(store, "u", now)).rejects.toBeInstanceOf(StoreError);
  });
});
