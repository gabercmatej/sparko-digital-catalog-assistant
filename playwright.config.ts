import { defineConfig, devices } from "@playwright/test";
import { AUTH_STATE_FILE, E2E_SECRET, E2E_STORE_PREFIX, E2E_UPSTASH_PORT, E2E_UPSTASH_TOKEN, E2E_UPSTASH_URL } from "./tests/e2e/auth-credentials";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    {
      name: "mobile-390",
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts$/,
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: AUTH_STATE_FILE },
    },
    // iOS engine (every iPhone browser, incl. Chrome on iOS, is WebKit). Real phones lose ~150-190 px of
    // height to browser chrome, so the mobile layout specs run here at a realistic visible viewport too.
    {
      name: "webkit-iphone",
      dependencies: ["setup"],
      testMatch: /-mobile\.spec\.ts$/,
      use: { browserName: "webkit", viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, hasTouch: true, storageState: AUTH_STATE_FILE },
    },
  ],
  // Runs against a production build. Build first with `npm run build`.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        // TEST-ONLY in-memory Upstash stand-in (accounts, sessions, stats live here).
        {
          command: "npx tsx tests/support/fake-upstash-server.ts",
          port: E2E_UPSTASH_PORT,
          reuseExistingServer: true,
          timeout: 60_000,
          env: { E2E_UPSTASH_PORT: String(E2E_UPSTASH_PORT) },
        },
        {
          command: `npx next start -p ${PORT}`,
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
          // Ensure the fallback path is exercised deterministically in tests.
          env: {
            ANTHROPIC_API_KEY: "",
            NODE_ENV: "production",
            CHAT_BURST_LIMIT: "200",
            // TEST-ONLY auth backend (applies only when Playwright starts the server itself).
            UPSTASH_REDIS_REST_URL: E2E_UPSTASH_URL,
            UPSTASH_REDIS_REST_TOKEN: E2E_UPSTASH_TOKEN,
            SPARKO_STORE_PREFIX: E2E_STORE_PREFIX,
            SPARKO_AUTH_SECRET: E2E_SECRET,
          },
        },
      ],
});
