import { expect, test as setup } from "@playwright/test";
import {
  AUTH_STATE_FILE,
  E2E_ADMIN,
  E2E_ADMIN_PASSWORD,
  E2E_REVIEWER,
  E2E_REVIEWER_PASSWORD,
  e2eStore,
  provisionAccount,
} from "./auth-credentials";

setup("provision test accounts, activate reviewer and save session", async ({ request, baseURL }) => {
  // Safety: only ever provision the throwaway fake store behind a local server.
  const host = new URL(baseURL!).hostname;
  expect(["localhost", "127.0.0.1", "[::1]"], `refusing to provision against ${host}`).toContain(host);

  const store = e2eStore();
  await store.run("FLUSHALL");
  const reviewer = await provisionAccount(store, E2E_REVIEWER, "reviewer", E2E_REVIEWER_PASSWORD);
  await provisionAccount(store, E2E_ADMIN, "admin", E2E_ADMIN_PASSWORD);

  // Real activation flow: link -> cookie -> password sign-in.
  const link = await request.get(`/aktivacija?token=${reviewer.token}`, { maxRedirects: 0 });
  expect(link.status()).toBe(307);
  const res = await request.post("/api/auth/login", {
    data: { identifier: E2E_REVIEWER, password: E2E_REVIEWER_PASSWORD, next: "/domov" },
    headers: { "x-forwarded-for": "10.99.0.1" },
  });
  expect(res.status(), await res.text()).toBe(200);
  const state = await request.storageState({ path: AUTH_STATE_FILE });
  const names = state.cookies.map((c) => c.name);
  expect(names).toContain("sparko_session");
  expect(names).toContain("sparko_device");
});
