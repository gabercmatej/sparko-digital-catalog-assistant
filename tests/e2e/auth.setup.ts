import { expect, test as setup } from "@playwright/test";
import { AUTH_STATE_FILE, E2E_LOGIN, E2E_PASSWORD } from "./auth-credentials";

setup("sign in and save session", async ({ request }) => {
  const res = await request.post("/api/auth/login", {
    data: { identifier: E2E_LOGIN, password: E2E_PASSWORD, next: "/domov" },
    headers: { "x-forwarded-for": "10.99.0.1" },
  });
  expect(res.status(), await res.text()).toBe(200);
  await request.storageState({ path: AUTH_STATE_FILE });
});
