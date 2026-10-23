/**
 * Durable sign-in attempt limits (fixed windows in the store, shared by all Vercel instances):
 *   - per client IP (hashed): every attempt counts, LOGIN_IP_LIMIT per window;
 *   - per username (hashed, also unknown ones): every attempt is counted atomically BEFORE the password
 *     check (so parallel bursts cannot overshoot), and a successful sign-in gives its attempt back —
 *     effectively LOGIN_ACCOUNT_LIMIT failures per window.
 * The store is required: if it errors, sign-in is refused (fail closed). The scrypt check itself
 * also costs a few hundred ms per attempt.
 */
import { hashIp } from "@/lib/assistant/ratelimit";
import { foldUsername, sha256 } from "./accounts";
import type { Store } from "./store";

export const LOGIN_IP_LIMIT = 20;
export const LOGIN_ACCOUNT_LIMIT = 10;
export const LOGIN_WINDOW_SECONDS = 15 * 60;

const windowId = (now: number) => Math.floor(now / 1000 / LOGIN_WINDOW_SECONDS);
const accountKey = (store: Store, identifier: string, now: number) =>
  store.key("rl", "acct", sha256(`sparko-login:${foldUsername(identifier)}`).slice(0, 32), windowId(now));

/** Counts this attempt against the IP and checks the username's failure budget. Throws StoreError. */
export async function checkLoginAttempt(store: Store, ip: string, identifier: string, now = Date.now()): Promise<boolean> {
  const ipKey = store.key("rl", "ip", hashIp(ip, "sparko-login-v2"), windowId(now));
  const acctKey = accountKey(store, identifier, now);
  const [ipCount, , attempts] = await store.pipeline([
    ["INCR", ipKey],
    ["EXPIRE", ipKey, LOGIN_WINDOW_SECONDS + 60],
    ["INCR", acctKey],
    ["EXPIRE", acctKey, LOGIN_WINDOW_SECONDS + 60],
  ]);
  return Number(ipCount) <= LOGIN_IP_LIMIT && Number(attempts) <= LOGIN_ACCOUNT_LIMIT;
}

/** Gives a successful sign-in's attempt back, so only failures use up the username's budget. */
export async function refundLoginAttempt(store: Store, identifier: string, now = Date.now()): Promise<void> {
  await store.run("DECR", accountKey(store, identifier, now));
}
