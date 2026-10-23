/** TEST-ONLY credentials for the Playwright-started server. Never the real demo password. */
import { randomBytes, scryptSync } from "node:crypto";

export const E2E_LOGIN = "e2e-user";
export const E2E_EMAIL = "e2e@example.test";
export const E2E_PASSWORD = "e2e-Test-Pass-2026";
export const E2E_SECRET = "e2e-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";

export function e2ePasswordHash(): string {
  const salt = randomBytes(16);
  const hash = scryptSync(E2E_PASSWORD, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", 16384, 8, 1, salt.toString("base64url"), hash.toString("base64url")].join(":");
}

export const AUTH_STATE_FILE = "playwright/.auth/state.json";
