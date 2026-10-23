/**
 * TEST-ONLY: standalone fake Upstash REST server for the Playwright run (`npx tsx tests/support/fake-upstash-server.ts`).
 * Port from E2E_UPSTASH_PORT (default 3199), token "fake-token". Binds to 127.0.0.1 only.
 */
import { FAKE_TOKEN, startFakeUpstash } from "./fake-upstash";

const port = Number(process.env.E2E_UPSTASH_PORT ?? 3199);

startFakeUpstash(port, FAKE_TOKEN).then(({ server }) => {
  console.log(`fake-upstash ready on http://127.0.0.1:${port}`);
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
});
