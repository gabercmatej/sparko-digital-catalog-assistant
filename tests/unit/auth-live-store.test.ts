/**
 * Opt-in check against the REAL Upstash store (skipped unless SPARKO_LIVE_STORE_TEST=1 and
 * KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN are set). Uses an isolated random key prefix
 * and deletes every key it created, so it never touches production accounts (prefix sparko:v2:).
 *
 *   SPARKO_LIVE_STORE_TEST=1 npx vitest run tests/unit/auth-live-store.test.ts   (env from .env.upstash.local)
 */
import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createAccount, issueActivationToken, peekActivationToken, resetAccess } from "@/lib/auth/accounts";
import { getStats, getVisitHistory, recordActivity } from "@/lib/auth/analytics";
import { authenticate } from "@/lib/auth/login";
import { hashPassword } from "@/lib/auth/password";
import { createSession, validateSession } from "@/lib/auth/session";
import { createStore, storeCredentials } from "@/lib/auth/store";

const creds = storeCredentials(process.env);
const live = process.env.SPARKO_LIVE_STORE_TEST === "1" && creds !== null;
const prefix = `sparko:livetest:${randomBytes(4).toString("hex")}:`;
const SECRET = "live-test-secret-0123456789-abcdefghijklmnop";
const FAST = { N: 2 ** 14, r: 8, p: 1 };

describe.skipIf(!live)("live Upstash store (isolated prefix)", () => {
  const store = createStore({ ...creds!, prefix });
  const ip = () => `203.0.113.${Math.floor(Math.random() * 250)}`;

  afterAll(async () => {
    let cursor = "0";
    do {
      const [next, keys] = (await store.run("SCAN", cursor, "MATCH", `${prefix}*`, "COUNT", 200)) as [string, string[]];
      if (keys.length) await store.run("DEL", ...keys);
      cursor = next;
    } while (cursor !== "0");
    const [, left] = (await store.run("SCAN", "0", "MATCH", `${prefix}*`, "COUNT", 1000)) as [string, string[]];
    expect(left).toEqual([]);
  });

  it("strict single-browser activation, re-auth, rejection, concurrency and reset", async () => {
    const acct = (await createAccount(store, { username: "LiveReviewer", role: "reviewer", passwordHash: await hashPassword("live-pw-1", FAST) }))!;
    const token = await issueActivationToken(store, acct);

    // Concurrent first activation: exactly one browser wins.
    const race = await Promise.all(Array.from({ length: 5 }, () => authenticate(store, { identifier: "livereviewer", password: "live-pw-1", activationToken: token }, { ip: ip() })));
    const winners = race.filter((r) => r.ok);
    expect(winners).toHaveLength(1);
    const win = winners[0];
    if (!win.ok) throw new Error("unreachable");
    const device = win.deviceCredential!;

    // Same browser: session valid, repeated re-auth by password works without a link.
    const session = await createSession(store, SECRET, win.account, win.device);
    for (let i = 0; i < 3; i++) expect(await validateSession(store, SECRET, session, device)).not.toBeNull();
    const again = await authenticate(store, { identifier: "LiveReviewer", password: "live-pw-1", deviceCredential: device }, { ip: ip() });
    expect(again.ok).toBe(true);

    // Any other browser (or cleared cookies) is rejected even with the right password; a fresh link is not burned.
    expect(await authenticate(store, { identifier: "LiveReviewer", password: "live-pw-1" }, { ip: ip() })).toEqual({ ok: false, code: "device_limit" });
    const spare = await issueActivationToken(store, (await createAccount(store, { username: "Unused", role: "reviewer", passwordHash: await hashPassword("x", FAST) }))!);
    expect(await peekActivationToken(store, spare)).not.toBeNull();
    expect(await authenticate(store, { identifier: "LiveReviewer", password: "live-pw-1", activationToken: token }, { ip: ip() })).toMatchObject({ ok: false });

    // Reset: old browser's session and credential are dead, a new link binds a new browser.
    const fresh = await resetAccess(store, win.account);
    expect(await validateSession(store, SECRET, session, device)).toBeNull();
    expect(await authenticate(store, { identifier: "LiveReviewer", password: "live-pw-1", deviceCredential: device }, { ip: ip() })).toEqual({ ok: false, code: "not_activated" });
    const rebound = await authenticate(store, { identifier: "LiveReviewer", password: "live-pw-1", activationToken: fresh, deviceCredential: device }, { ip: ip() });
    expect(rebound.ok).toBe(true);
    if (rebound.ok) expect(rebound.deviceCredential).not.toBe(device);

    // Visit counting: repeated activity within 30 min is one visit.
    for (let i = 0; i < 4; i++) await recordActivity(store, acct.id, { pageView: true });
    const stats = (await getStats(store, [acct.id]))[acct.id];
    expect(stats.visits).toBe(1);
    expect(stats.pageViews).toBe(4);
    expect(await getVisitHistory(store, acct.id)).toHaveLength(1);
  }, 60_000);
});
