import { FakeRedis, FAKE_TOKEN, FAKE_URL, fakeFetch } from "../support/fake-upstash";
import { createAccount, issueActivationToken, generatePassword, type Account, type Role } from "@/lib/auth/accounts";
import { hashPassword } from "@/lib/auth/password";
import { createStore, type Store } from "@/lib/auth/store";

export const FAST = { N: 2 ** 14, r: 8, p: 1 };
export const SECRET = "unit-test-secret-0123456789-abcdefghijkl";

let ipCounter = 0;
/** Fresh IP per call so IP rate limiting never interferes with unrelated tests. */
export const freshIp = () => `198.51.100.${++ipCounter}`;

export function makeStore(opts: { fail?: () => boolean } = {}): { redis: FakeRedis; store: Store } {
  const redis = new FakeRedis();
  const store = createStore({ url: FAKE_URL, token: FAKE_TOKEN, fetchImpl: fakeFetch(redis, opts), prefix: "test:" });
  return { redis, store };
}

export async function provision(
  store: Store,
  username: string,
  role: Role = "reviewer",
  password: string = generatePassword(),
): Promise<{ account: Account; password: string; token: string | null }> {
  const account = await createAccount(store, { username, role, passwordHash: await hashPassword(password, FAST) });
  if (!account) throw new Error("username taken");
  const token = role === "reviewer" ? await issueActivationToken(store, account) : null;
  return { account, password, token };
}

/** Every key and value in the fake redis, as one string (for secret-leak scans). */
export function dumpRedis(redis: FakeRedis): string {
  const out: string[] = [];
  for (const k of redis.keys()) {
    out.push(k);
    for (const cmd of [["GET", k], ["HGETALL", k], ["SMEMBERS", k], ["LRANGE", k, "0", "-1"]]) {
      try {
        out.push(JSON.stringify(redis.exec(cmd)));
      } catch {
        // wrong type for this probe
      }
    }
  }
  return out.join("\n");
}
