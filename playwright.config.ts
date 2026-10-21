import { defineConfig, devices } from "@playwright/test";

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
    { name: "mobile-390", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    // iOS engine (every iPhone browser, incl. Chrome on iOS, is WebKit). Real phones lose ~150-190 px of
    // height to browser chrome, so the mobile layout specs run here at a realistic visible viewport too.
    {
      name: "webkit-iphone",
      testMatch: /-mobile\.spec\.ts$/,
      use: { browserName: "webkit", viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, hasTouch: true },
    },
  ],
  // Runs against a production build. Build first with `npm run build`.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
        // Ensure the fallback path is exercised deterministically in tests.
        env: { ANTHROPIC_API_KEY: "", NODE_ENV: "production", CHAT_BURST_LIMIT: "200" },
      },
});
