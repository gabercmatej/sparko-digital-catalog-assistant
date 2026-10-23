import { beforeAll, describe, expect, it } from "vitest";
import { MAX_DEVICES, getAccount, issueActivationToken, listDevices, peekActivationToken, randomSecret, resetAccess, setPasswordHash, setStatus, sha256 } from "@/lib/auth/accounts";
import { authenticate, type LoginResult } from "@/lib/auth/login";
import { LOGIN_MESSAGES } from "@/lib/auth/messages";
import { hashPassword } from "@/lib/auth/password";
import { SESSION_TTL_SECONDS, createSession, destroySession, validateSession, unsealSession } from "@/lib/auth/session";
import { StoreError, type Store } from "@/lib/auth/store";
import { FAST, SECRET, dumpRedis, freshIp, makeStore, provision } from "./auth-helpers";

/** A simulated browser: keeps its device cookie and session cookie between sign-ins. */
class Browser {
  device: string | null = null;
  session: string | undefined;
  constructor(private store: Store) {}

  async login(username: string, password: string, opts: { token?: string | null; ip?: string; now?: number } = {}): Promise<LoginResult> {
    const result = await authenticate(
      this.store,
      { identifier: username, password, activationToken: opts.token ?? null, deviceCredential: this.device },
      { ip: opts.ip ?? freshIp(), now: opts.now },
    );
    if (result.ok) {
      if (result.deviceCredential) this.device = result.deviceCredential;
      this.session = await createSession(this.store, SECRET, result.account, result.device, opts.now);
    }
    return result;
  }
  validate() {
    return validateSession(this.store, SECRET, this.session, this.device ?? undefined);
  }
}

beforeAll(async () => {
  // Warm the (slow, default-params) dummy hash so individual tests do not time out.
  const { store } = makeStore();
  await authenticate(store, { identifier: "nobody", password: "x" }, { ip: "203.0.113.200" });
}, 60_000);

const code = (r: LoginResult) => (r.ok ? "ok" : r.code);

describe("activation and device binding (strictly one browser)", () => {
  it("first activation succeeds: token consumed, slot 1 bound, activatedAt set, device credential returned", async () => {
    const { store } = makeStore();
    const { account, password, token } = await provision(store, "LidijaR");
    const b = new Browser(store);
    const r = await b.login("lidijar", password, { token });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.activated).toBe(true);
    expect(r.device?.slot).toBe(1);
    expect(r.deviceCredential).toMatch(/^[\w-]{40,64}$/);
    const after = (await getAccount(store, account.id))!;
    expect(after.activatedAt).not.toBeNull();
    expect(after.actHash).toBeNull();
    expect(await peekActivationToken(store, token!)).toBeNull();
    expect(await listDevices(store, account.id)).toHaveLength(1);
    expect((await b.validate())?.account.id).toBe(account.id);
  });

  it("MAX_DEVICES is 1", () => {
    expect(MAX_DEVICES).toBe(1);
  });

  it("the same browser re-opens repeatedly: session validates many times", async () => {
    const { store } = makeStore();
    const { account, password, token } = await provision(store, "LidijaR");
    const b = new Browser(store);
    await b.login("LidijaR", password, { token });
    for (let i = 0; i < 15; i++) expect((await b.validate())?.account.id).toBe(account.id);
  });

  it("the same browser re-auths via password without a token (repeatedly) and keeps its single slot", async () => {
    const { store } = makeStore();
    const { account, password, token } = await provision(store, "LidijaR");
    const b = new Browser(store);
    await b.login("LidijaR", password, { token });
    const device = b.device;
    for (let i = 0; i < 4; i++) {
      const r = await b.login("LidijaR", password);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.deviceCredential).toBeNull();
    }
    expect(b.device).toBe(device);
    expect(await listDevices(store, account.id)).toHaveLength(1);
  });

  it("the same browser re-auths via password after its session expired (no token)", async () => {
    const { store, redis } = makeStore();
    const { password, token } = await provision(store, "LidijaR");
    const b = new Browser(store);
    await b.login("LidijaR", password, { token });
    const sealed = (await unsealSession(b.session, SECRET, b.device!))!;
    redis.expireNow(store.key("sess", sha256(sealed.sid)));
    expect(await b.validate()).toBeNull();
    expect((await b.login("LidijaR", password)).ok).toBe(true);
    expect(await b.validate()).not.toBeNull();
  });

  it("a second browser (no device cookie) with the correct password -> device_limit", async () => {
    const { store, redis } = makeStore();
    const { account, password, token } = await provision(store, "LidijaR");
    await new Browser(store).login("LidijaR", password, { token });
    expect(await new Browser(store).login("LidijaR", password)).toEqual({ ok: false, code: "device_limit" });
    expect(await listDevices(store, account.id)).toHaveLength(1);
    expect(redis.keys().filter((k) => k.includes(":dev:"))).toHaveLength(1);
    expect(LOGIN_MESSAGES.device_limit).toBe("Ta račun je že aktiviran v drugem brskalniku ali napravi. Za ponastavitev dostopa se obrnite na skrbnika.");
  });

  it("a different device (own random device cookie) with the correct password -> device_limit, no slot created", async () => {
    const { store } = makeStore();
    const { account, password, token } = await provision(store, "LidijaR");
    const original = new Browser(store);
    await original.login("LidijaR", password, { token });
    const other = new Browser(store);
    other.device = randomSecret();
    expect(await other.login("LidijaR", password)).toEqual({ ok: false, code: "device_limit" });
    expect(other.session).toBeUndefined();
    expect(await listDevices(store, account.id)).toHaveLength(1);
    expect(await original.validate()).not.toBeNull();
  });

  it("a second browser presenting a FRESH unused token while a browser is bound -> device_limit and the token is NOT consumed", async () => {
    const { store } = makeStore();
    const { account, password, token } = await provision(store, "LidijaR");
    await new Browser(store).login("LidijaR", password, { token });
    // A fresh (unused) link issued directly in the store, as a stale/leaked link would be.
    const fresh = await issueActivationToken(store, (await getAccount(store, account.id))!);
    expect(await new Browser(store).login("LidijaR", password, { token: fresh })).toEqual({ ok: false, code: "device_limit" });
    expect(await peekActivationToken(store, fresh)).toBe(account.id);
    expect(await listDevices(store, account.id)).toHaveLength(1);
  });

  it("a used link from another browser while one is bound -> device_limit (never a session)", async () => {
    const { store } = makeStore();
    const { password, token } = await provision(store, "LidijaR");
    await new Browser(store).login("LidijaR", password, { token });
    const other = new Browser(store);
    expect(await other.login("LidijaR", password, { token })).toEqual({ ok: false, code: "device_limit" });
    expect(other.session).toBeUndefined();
  });

  it("clearing cookies in the original browser (no device cookie) -> device_limit; after a reset its old used link is activation_invalid", async () => {
    const { store } = makeStore();
    const { account, password, token } = await provision(store, "LidijaR");
    const b = new Browser(store);
    await b.login("LidijaR", password, { token });
    b.device = null;
    b.session = undefined;
    expect(code(await b.login("LidijaR", password))).toBe("device_limit");
    expect(code(await b.login("LidijaR", password, { token }))).toBe("device_limit");
    expect(await peekActivationToken(store, token!)).toBeNull();
    await resetAccess(store, (await getAccount(store, account.id))!);
    expect(code(await b.login("LidijaR", password, { token }))).toBe("activation_invalid");
  });

  it("a link of another account cannot activate this one", async () => {
    const { store } = makeStore();
    const a = await provision(store, "A1");
    const b = await provision(store, "B1");
    expect(code(await new Browser(store).login("B1", b.password, { token: a.token }))).toBe("activation_invalid");
    expect((await new Browser(store).login("A1", a.password, { token: a.token })).ok).toBe(true);
  });

  it("concurrent first activation: 8 parallel browsers, same token -> exactly one ok and exactly one device key", async () => {
    const { store, redis } = makeStore();
    const { account, password, token } = await provision(store, "LidijaR");
    const results = await Promise.all(Array.from({ length: 8 }, () => new Browser(store).login("LidijaR", password, { token })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && (r.code === "activation_invalid" || r.code === "device_limit"))).toBe(true);
    expect(await listDevices(store, account.id)).toHaveLength(1);
    expect(redis.keys().filter((k) => k.includes(":dev:"))).toHaveLength(1);
  });

  it("concurrent password logins from many fresh browsers after activation never bind another browser", async () => {
    const { store } = makeStore();
    const { account, password, token } = await provision(store, "LidijaR");
    const original = new Browser(store);
    await original.login("LidijaR", password, { token });
    const results = await Promise.all(Array.from({ length: 8 }, () => new Browser(store).login("LidijaR", password)));
    expect(results.every((r) => !r.ok && r.code === "device_limit")).toBe(true);
    expect(await listDevices(store, account.id)).toHaveLength(1);
    expect(await original.validate()).not.toBeNull();
  });

  it("a never-activated account without a token -> not_activated", async () => {
    const { store } = makeStore();
    const { password } = await provision(store, "LidijaR");
    expect(code(await new Browser(store).login("LidijaR", password))).toBe("not_activated");
  });

  it("a wrong password with a valid link does not consume the link", async () => {
    const { store } = makeStore();
    const { password, token } = await provision(store, "LidijaR");
    expect(code(await new Browser(store).login("LidijaR", "wrong", { token }))).toBe("invalid");
    expect((await new Browser(store).login("LidijaR", password, { token })).ok).toBe(true);
  });

  it("no plaintext secrets (password, activation token, device credential) in the store after use", async () => {
    const { store, redis } = makeStore();
    const { password, token } = await provision(store, "LidijaR");
    const b = new Browser(store);
    await b.login("LidijaR", password, { token });
    const dump = dumpRedis(redis);
    for (const secret of [password, token!, b.device!, b.session!]) expect(dump).not.toContain(secret);
  });
});


describe("credentials and rate limiting", () => {
  it("invalid password and unknown user give the same code", async () => {
    const { store } = makeStore();
    const { token } = await provision(store, "LidijaR");
    const wrongPw = await authenticate(store, { identifier: "LidijaR", password: "nope", activationToken: token }, { ip: freshIp() });
    const unknown = await authenticate(store, { identifier: "ghost", password: "nope" }, { ip: freshIp() });
    expect(wrongPw).toEqual({ ok: false, code: "invalid" });
    expect(unknown).toEqual({ ok: false, code: "invalid" });
    expect(code(await authenticate(store, { identifier: "LidijaR", password: "" }, { ip: freshIp() }))).toBe("invalid");
  });

  it("per-username failure limit -> rate_limited, even for the right password afterwards", async () => {
    const { store } = makeStore();
    const { password, token } = await provision(store, "LidijaR");
    for (let i = 0; i < 10; i++) expect(code(await authenticate(store, { identifier: "LIDIJAR", password: "bad" }, { ip: freshIp() }))).toBe("invalid");
    expect(code(await authenticate(store, { identifier: "lidijar", password, activationToken: token }, { ip: freshIp() }))).toBe("rate_limited");
    // another account is unaffected
    const other = await provision(store, "Other");
    expect((await authenticate(store, { identifier: "Other", password: other.password, activationToken: other.token }, { ip: freshIp() })).ok).toBe(true);
  });

  it("unknown usernames are rate limited too (no enumeration via the limiter)", async () => {
    const { store } = makeStore();
    for (let i = 0; i < 10; i++) await authenticate(store, { identifier: "ghost", password: "bad" }, { ip: freshIp() });
    expect(code(await authenticate(store, { identifier: "ghost", password: "bad" }, { ip: freshIp() }))).toBe("rate_limited");
  }, 60_000);

  it("per-IP limit -> rate_limited after 20 attempts regardless of username", async () => {
    const { store } = makeStore();
    // Known accounts keep the (fast) test hash; unknown users would use the slow default-cost dummy hash.
    await provision(store, "U1");
    await provision(store, "U2");
    const ip = freshIp();
    for (let i = 0; i < 20; i++) expect(code(await authenticate(store, { identifier: i % 2 ? "U1" : "U2", password: "bad" }, { ip }))).toBe("invalid");
    expect(code(await authenticate(store, { identifier: "u99", password: "bad" }, { ip }))).toBe("rate_limited");
    expect(code(await authenticate(store, { identifier: "U1", password: "bad" }, { ip: freshIp() }))).toBe("rate_limited"); // U1 hit its own 10-failure cap
    expect(code(await authenticate(store, { identifier: "u99", password: "bad" }, { ip: freshIp() }))).toBe("invalid");
  });

  it("limits recover in the next window", async () => {
    const { store } = makeStore();
    const ip = freshIp();
    const now = 1_700_000_000_000;
    await provision(store, "X1");
    await provision(store, "X2");
    for (let i = 0; i < 20; i++) await authenticate(store, { identifier: i % 2 ? "X1" : "X2", password: "bad" }, { ip, now });
    expect(code(await authenticate(store, { identifier: "X1", password: "bad" }, { ip, now }))).toBe("rate_limited");
    expect(code(await authenticate(store, { identifier: "X1", password: "bad" }, { ip, now: now + 16 * 60_000 }))).toBe("invalid");
  });

  it("store failure throws (fail closed) and never succeeds", async () => {
    let down = false;
    const { store } = makeStore({ fail: () => down });
    const { password, token } = await provision(store, "LidijaR");
    down = true;
    await expect(authenticate(store, { identifier: "LidijaR", password, activationToken: token }, { ip: freshIp() })).rejects.toBeInstanceOf(StoreError);
  });

  it("a store failure mid-login (after the rate check) also throws, never succeeds", async () => {
    let calls = 0;
    let failAfter = Infinity;
    const { store } = makeStore({ fail: () => ++calls > failAfter });
    const { password, token } = await provision(store, "LidijaR");
    calls = 0;
    failAfter = 2; // rate-limit pipeline + account lookup succeed, then the store dies
    await expect(authenticate(store, { identifier: "LidijaR", password, activationToken: token }, { ip: freshIp() })).rejects.toBeInstanceOf(StoreError);
  });
});

describe("admin and revoked accounts", () => {
  it("admin login works without device binding and has role admin", async () => {
    const { store } = makeStore();
    const { password } = await provision(store, "Skrbnik", "admin");
    const b = new Browser(store);
    const r = await b.login("skrbnik", password);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.device).toBeNull();
    expect(r.deviceCredential).toBeNull();
    expect(r.account.role).toBe("admin");
    const v = await b.validate();
    expect(v?.account.role).toBe("admin");
    expect(v?.slot).toBeNull();
    // works from many browsers
    for (let i = 0; i < 4; i++) expect((await new Browser(store).login("Skrbnik", password)).ok).toBe(true);
  });

  it("revoked: existing sessions become invalid, login -> revoked, restore works", async () => {
    const { store } = makeStore();
    const { account, password, token } = await provision(store, "LidijaR");
    const b = new Browser(store);
    await b.login("LidijaR", password, { token });
    expect(await b.validate()).not.toBeNull();
    await setStatus(store, account.id, "revoked");
    expect(await b.validate()).toBeNull();
    expect(code(await b.login("LidijaR", password))).toBe("revoked");
    await setStatus(store, account.id, "active");
    // the old session stays dead (gen bumped); a fresh sign-in on the bound browser works
    expect(await b.validate()).toBeNull();
    expect((await b.login("LidijaR", password)).ok).toBe(true);
    expect(await b.validate()).not.toBeNull();
  });

  it("revoked status is checked only after the password (no status leak to wrong password)", async () => {
    const { store } = makeStore();
    const { account } = await provision(store, "LidijaR");
    await setStatus(store, account.id, "revoked");
    expect(code(await new Browser(store).login("LidijaR", "wrong"))).toBe("invalid");
  });
});

describe("sessions", () => {
  async function activated() {
    const { store, redis } = makeStore();
    const p = await provision(store, "LidijaR");
    const b = new Browser(store);
    await b.login("LidijaR", p.password, { token: p.token });
    return { store, redis, b, ...p };
  }

  it("expired session record -> validateSession null; re-auth on the bound browser works", async () => {
    const { store, redis, b, password } = await activated();
    const sealed = (await unsealSession(b.session, SECRET, b.device!))!;
    redis.expireNow(store.key("sess", sha256(sealed.sid)));
    expect(await b.validate()).toBeNull();
    expect((await b.login("LidijaR", password)).ok).toBe(true);
    expect(await b.validate()).not.toBeNull();
  });

  it("seal older than SESSION_TTL is rejected even if the record exists", async () => {
    const { store, b, account } = await activated();
    const old = Date.now() - (SESSION_TTL_SECONDS + 120) * 1000;
    const slot = (await listDevices(store, account.id))[0];
    const token = await createSession(store, SECRET, account, { slot: slot.slot, hash: slot.hash }, old);
    expect(await validateSession(store, SECRET, token, b.device!)).toBeNull();
  });

  it("logout (destroySession) invalidates the session but keeps the browser authorized", async () => {
    const { store, b, password, account } = await activated();
    const v = (await b.validate())!;
    await destroySession(store, v.sid);
    expect(await b.validate()).toBeNull();
    expect((await b.login("LidijaR", password)).ok).toBe(true);
    expect(await listDevices(store, account.id)).toHaveLength(1);
  });

  it("session cookie without the device cookie -> null", async () => {
    const { store, b } = await activated();
    expect(await validateSession(store, SECRET, b.session, undefined)).toBeNull();
    expect(await validateSession(store, SECRET, b.session, "")).toBeNull();
  });

  it("session cookie with another browser's device cookie -> null", async () => {
    const { store, b } = await activated();
    expect(await validateSession(store, SECRET, b.session, randomSecret())).toBeNull();
    expect(await b.validate()).not.toBeNull();
  });

  it("tampered or wrong-secret seals -> null", async () => {
    const { store, b } = await activated();
    const t = b.session!;
    const i = Math.floor(t.length / 2);
    const tampered = t.slice(0, i) + (t[i] === "A" ? "B" : "A") + t.slice(i + 1);
    expect(await validateSession(store, SECRET, tampered, b.device!)).toBeNull();
    expect(await validateSession(store, SECRET, t.slice(0, -4), b.device!)).toBeNull();
    expect(await validateSession(store, SECRET, "garbage", b.device!)).toBeNull();
    expect(await validateSession(store, SECRET, "a".repeat(5000), b.device!)).toBeNull();
    expect(await validateSession(store, SECRET, undefined, b.device!)).toBeNull();
    expect(await validateSession(store, "another-secret-0123456789-abcdefghijklmn", t, b.device!)).toBeNull();
  });

  it("a session of account A cannot be used to claim account B", async () => {
    const { store, redis } = makeStore();
    const a = await provision(store, "A1");
    const bb = await provision(store, "B1");
    const ba = new Browser(store);
    await ba.login("A1", a.password, { token: a.token });
    const bbrowser = new Browser(store);
    await bbrowser.login("B1", bb.password, { token: bb.token });
    const va = (await ba.validate())!;
    expect(va.account.id).toBe(a.account.id);
    // A's sid sealed under B's identity (needs the secret, i.e. a forgery) must still fail: the record says A.
    const { sealData } = await import("iron-session");
    const sealedA = (await unsealSession(ba.session, SECRET, ba.device!))!;
    const forged = await sealData({ ...sealedA, a: bb.account.id, dh: sealedA.dh }, { password: SECRET, ttl: SESSION_TTL_SECONDS });
    expect(await validateSession(store, SECRET, forged, ba.device!)).toBeNull();
    // role escalation by forging the seal's role is ignored too
    const forgedRole = await sealData({ ...sealedA, r: "admin" }, { password: SECRET, ttl: SESSION_TTL_SECONDS });
    const v = await validateSession(store, SECRET, forgedRole, ba.device!);
    expect(v === null || v.account.role === "reviewer").toBe(true);
    expect(redis.keys().length).toBeGreaterThan(0);
  });

  it("a reviewer session with a stripped device hash (dh=null) is rejected", async () => {
    const { store, b } = await activated();
    const { sealData } = await import("iron-session");
    const sealed = (await unsealSession(b.session, SECRET, b.device!))!;
    const forged = await sealData({ ...sealed, dh: null }, { password: SECRET, ttl: SESSION_TTL_SECONDS });
    expect(await validateSession(store, SECRET, forged, undefined)).toBeNull();
  });

  it("password rotation (setPasswordHash) signs out sessions; new password works on the bound browser", async () => {
    const { store, b, account } = await activated();
    expect(await b.validate()).not.toBeNull();
    await setPasswordHash(store, account.id, await hashPassword("brand-new-pw", FAST));
    expect(await b.validate()).toBeNull();
    expect(code(await b.login("LidijaR", "old"))).toBe("invalid");
    expect((await b.login("LidijaR", "brand-new-pw")).ok).toBe(true);
  });
});

describe("device reset", () => {
  it("resetAccess: old sessions dead, leftover cookie rejected for sessions AND login, replacement gets a DIFFERENT credential", async () => {
    const { store, redis } = makeStore();
    const { account, password, token } = await provision(store, "LidijaR");
    const old = new Browser(store);
    await old.login("LidijaR", password, { token });
    const oldDevice = old.device!;
    expect(await old.validate()).not.toBeNull();

    const newToken = await resetAccess(store, (await getAccount(store, account.id))!);
    expect(redis.keys().filter((k) => k.includes(":dev:"))).toHaveLength(0);
    expect(await old.validate()).toBeNull();
    // leftover cookie without a new link cannot sign in
    expect(code(await old.login("LidijaR", password))).toBe("not_activated");
    expect(await old.validate()).toBeNull();

    // the browser still holding the pre-reset cookie activates with the new link
    const replacement = new Browser(store);
    replacement.device = oldDevice;
    const r = await replacement.login("LidijaR", password, { token: newToken });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.deviceCredential).not.toBe(oldDevice);
    expect(replacement.device).not.toBe(oldDevice);
    expect(await replacement.validate()).not.toBeNull();
    // the stale pre-reset cookie alone never works again, nor does the old session
    expect(await validateSession(store, SECRET, replacement.session, oldDevice)).toBeNull();
    expect(await old.validate()).toBeNull();
    expect(await listDevices(store, account.id)).toHaveLength(1);
  });

  it("reset invalidates old sessions before any new token is used", async () => {
    const { store } = makeStore();
    const { account, password, token } = await provision(store, "LidijaR");
    const old = new Browser(store);
    await old.login("LidijaR", password, { token });
    await resetAccess(store, (await getAccount(store, account.id))!);
    expect(await old.validate()).toBeNull();
  });

  it("after reset, parallel browsers with the new link: exactly one wins", async () => {
    const { store } = makeStore();
    const { account, password, token } = await provision(store, "LidijaR");
    await new Browser(store).login("LidijaR", password, { token });
    const newToken = await resetAccess(store, (await getAccount(store, account.id))!);
    const results = await Promise.all(Array.from({ length: 5 }, () => new Browser(store).login("LidijaR", password, { token: newToken })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await listDevices(store, account.id)).toHaveLength(1);
  });

  it("issuing a fresh link for an activated account does not unbind or sign out anything", async () => {
    const { store } = makeStore();
    const { account, password, token } = await provision(store, "LidijaR");
    const b = new Browser(store);
    await b.login("LidijaR", password, { token });
    await issueActivationToken(store, (await getAccount(store, account.id))!);
    expect(await b.validate()).not.toBeNull();
  });
});
