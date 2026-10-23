import { describe, expect, it } from "vitest";
import { LOGIN_LIMIT, LOGIN_WINDOW_SECONDS, checkLoginAttempt } from "@/lib/auth/ratelimit";

describe("login rate limit (in-memory)", () => {
  it("allows LOGIN_LIMIT attempts then blocks, per IP", async () => {
    const ip = "198.51.100.1";
    const now = 1_000_000_000_000;
    for (let i = 0; i < LOGIN_LIMIT; i++) {
      expect(await checkLoginAttempt(ip, { env: {}, now })).toEqual({ allowed: true, durable: false });
    }
    expect((await checkLoginAttempt(ip, { env: {}, now })).allowed).toBe(false);
    expect((await checkLoginAttempt("198.51.100.2", { env: {}, now })).allowed).toBe(true);
  });
  it("recovers after the window", async () => {
    const ip = "198.51.100.3";
    const now = 2_000_000_000_000;
    for (let i = 0; i <= LOGIN_LIMIT; i++) await checkLoginAttempt(ip, { env: {}, now });
    expect((await checkLoginAttempt(ip, { env: {}, now })).allowed).toBe(false);
    expect((await checkLoginAttempt(ip, { env: {}, now: now + (LOGIN_WINDOW_SECONDS + 1) * 1000 })).allowed).toBe(true);
  });
});

describe("login rate limit (Upstash)", () => {
  const env = { UPSTASH_REDIS_REST_URL: "https://redis.example.test/", UPSTASH_REDIS_REST_TOKEN: "tok" };
  const fake = (count: number, calls: { url: string; init: RequestInit }[] = []) =>
    (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify([{ result: count }, { result: 1 }]), { status: 200 });
    }) as unknown as typeof fetch;

  it("allows up to the limit and blocks above it, durable", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    expect(await checkLoginAttempt("203.0.113.1", { env, fetchImpl: fake(LOGIN_LIMIT, calls), now: 5 })).toEqual({ allowed: true, durable: true });
    expect(await checkLoginAttempt("203.0.113.1", { env, fetchImpl: fake(LOGIN_LIMIT + 1), now: 5 })).toEqual({ allowed: false, durable: true });
    expect(calls[0].url).toBe("https://redis.example.test/pipeline");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body[0][0]).toBe("INCR");
    expect(body[0][1]).not.toContain("203.0.113.1");
  });
  it("falls back to in-memory when Upstash errors", async () => {
    const boom = (async () => {
      throw new Error("net");
    }) as unknown as typeof fetch;
    expect(await checkLoginAttempt("203.0.113.9", { env, fetchImpl: boom })).toEqual({ allowed: true, durable: false });
    const bad = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
    expect((await checkLoginAttempt("203.0.113.9", { env, fetchImpl: bad })).durable).toBe(false);
  });
});
