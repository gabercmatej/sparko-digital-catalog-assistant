/**
 * TEST-ONLY credentials and helpers for the Playwright-started server. None of these are real
 * secrets; the server and the store they talk to exist only for the duration of the test run.
 */
import { createAccount, generatePassword, issueActivationToken, type Account } from "../../src/lib/auth/accounts";
import { hashPassword } from "../../src/lib/auth/password";
import { createStore, type Store } from "../../src/lib/auth/store";

export const E2E_UPSTASH_PORT = Number(process.env.E2E_UPSTASH_PORT ?? 3199);
export const E2E_UPSTASH_URL = `http://127.0.0.1:${E2E_UPSTASH_PORT}`;
export const E2E_UPSTASH_TOKEN = "fake-token";
export const E2E_STORE_PREFIX = "e2e:";
export const E2E_SECRET = "e2e-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";

export const E2E_REVIEWER = "e2e-reviewer";
export const E2E_REVIEWER_PASSWORD = "e2e-Reviewer-Pass-2026";
export const E2E_ADMIN = "e2e-admin";
export const E2E_ADMIN_PASSWORD = "e2e-Admin-Pass-2026";

export const AUTH_STATE_FILE = "playwright/.auth/state.json";

export function e2eStore(): Store {
  return createStore({ url: E2E_UPSTASH_URL, token: E2E_UPSTASH_TOKEN, prefix: E2E_STORE_PREFIX });
}

// Fast scrypt parameters (the app verifies with the parameters stored in the hash).
export const fastHash = (password: string) => hashPassword(password, { N: 2 ** 14, r: 8, p: 1 });

export async function provisionAccount(
  store: Store,
  username: string,
  role: "reviewer" | "admin",
  password = generatePassword(),
): Promise<{ account: Account; password: string; token: string | null }> {
  const account = await createAccount(store, { username, role, passwordHash: await fastHash(password) });
  if (!account) throw new Error(`username already taken: ${username}`);
  const token = role === "reviewer" ? await issueActivationToken(store, account) : null;
  return { account, password, token };
}

export type Provisioned = Awaited<ReturnType<typeof provisionAccount>>;
