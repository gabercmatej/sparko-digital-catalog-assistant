import { describe, expect, it } from "vitest";
import {
  MAX_DEVICES,
  claimDeviceSlot,
  consumeActivationToken,
  createAccount,
  findAccountByUsername,
  getAccount,
  issueActivationToken,
  listAccounts,
  listDevices,
  peekActivationToken,
  resetAccess,
  setPasswordHash,
  setStatus,
} from "@/lib/auth/accounts";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { FAST, dumpRedis, makeStore, provision } from "./auth-helpers";

describe("provisioning", () => {
  it("provisions LidijaR as reviewer; lookup is case/accent-insensitive", async () => {
    const { store } = makeStore();
    const { account } = await provision(store, "LidijaR");
    expect(account).toMatchObject({ username: "LidijaR", role: "reviewer", status: "active", activatedAt: null });
    for (const n of ["lidijar", "LIDIJAR", " LidijaR "]) expect((await findAccountByUsername(store, n))?.id).toBe(account.id);
    expect(await findAccountByUsername(store, "lidija")).toBeNull();
    expect(await findAccountByUsername(store, "")).toBeNull();
    expect(await findAccountByUsername(store, "x".repeat(65))).toBeNull();
  });

  it("provisions AlešP; alesp / ALEŠP / ' AlešP ' all resolve; duplicate username rejected", async () => {
    const { store } = makeStore();
    const { account } = await provision(store, "AlešP");
    for (const n of ["alesp", "ALEŠP", " AlešP ", "Alesp"]) expect((await findAccountByUsername(store, n))?.id, n).toBe(account.id);
    const hash = await hashPassword("x", FAST);
    expect(await createAccount(store, { username: "alesp", role: "reviewer", passwordHash: hash })).toBeNull();
    expect(await createAccount(store, { username: " ALEŠP ", role: "admin", passwordHash: hash })).toBeNull();
    expect((await listAccounts(store)).length).toBe(1);
  });

  it("concurrent creation of the same username yields exactly one account", async () => {
    const { store } = makeStore();
    const hash = await hashPassword("x", FAST);
    const res = await Promise.all(Array.from({ length: 6 }, () => createAccount(store, { username: "Dup", role: "reviewer", passwordHash: hash })));
    expect(res.filter(Boolean)).toHaveLength(1);
  });

  it("rejects an empty username", async () => {
    const { store } = makeStore();
    await expect(createAccount(store, { username: "  ", role: "reviewer", passwordHash: "x" })).rejects.toThrow();
  });
});

describe("passwords and secrets at rest", () => {
  it("different passwords give different hashes; hashes verify only their own password", async () => {
    const { store } = makeStore();
    const a = await provision(store, "A1");
    const b = await provision(store, "B1");
    expect(a.password).not.toBe(b.password);
    expect(a.account.passwordHash).not.toBe(b.account.passwordHash);
    expect(await verifyPassword(a.password, a.account.passwordHash)).toBe(true);
    expect(await verifyPassword(a.password, b.account.passwordHash)).toBe(false);
  });

  it("no plaintext password or activation token is stored anywhere", async () => {
    const { store, redis } = makeStore();
    const { password, token } = await provision(store, "LidijaR");
    const dump = dumpRedis(redis);
    expect(dump.length).toBeGreaterThan(50);
    expect(dump).not.toContain(password);
    expect(dump).not.toContain(token!);
  });
});

describe("activation tokens", () => {
  it("are unique per account and resolve to their own account", async () => {
    const { store } = makeStore();
    const a = await provision(store, "A1");
    const b = await provision(store, "B1");
    expect(a.token).not.toBe(b.token);
    expect(await peekActivationToken(store, a.token!)).toBe(a.account.id);
    expect(await peekActivationToken(store, b.token!)).toBe(b.account.id);
  });

  it("issuing a new token invalidates the old one", async () => {
    const { store } = makeStore();
    const { account, token } = await provision(store, "A1");
    const fresh = (await getAccount(store, account.id))!;
    const second = await issueActivationToken(store, fresh);
    expect(second).not.toBe(token);
    expect(await peekActivationToken(store, token!)).toBeNull();
    expect(await consumeActivationToken(store, token!, account.id)).toBe(false);
    expect(await consumeActivationToken(store, second, account.id)).toBe(true);
  });

  it("is single use, and a token of another account is not consumed", async () => {
    const { store } = makeStore();
    const a = await provision(store, "A1");
    const b = await provision(store, "B1");
    expect(await consumeActivationToken(store, a.token!, b.account.id)).toBe(false);
    expect(await peekActivationToken(store, a.token!)).toBe(a.account.id);
    expect(await consumeActivationToken(store, a.token!, a.account.id)).toBe(true);
    expect(await consumeActivationToken(store, a.token!, a.account.id)).toBe(false);
  });

  it("rejects malformed tokens without touching the store", async () => {
    const { store, redis } = makeStore();
    const before = redis.commandCount;
    for (const t of ["", "short", "x".repeat(100), "a b".repeat(20)]) expect(await peekActivationToken(store, t)).toBeNull();
    expect(redis.commandCount).toBe(before);
  });

  it("concurrent consumption has exactly one winner", async () => {
    const { store } = makeStore();
    const { account, token } = await provision(store, "A1");
    const res = await Promise.all(Array.from({ length: 8 }, () => consumeActivationToken(store, token!, account.id)));
    expect(res.filter(Boolean)).toHaveLength(1);
  });
});

describe("device slots", () => {
  it("concurrent claims never exceed MAX_DEVICES", async () => {
    const { store } = makeStore();
    const { account } = await provision(store, "A1");
    const res = await Promise.all(Array.from({ length: 8 }, (_, i) => claimDeviceSlot(store, account.id, `hash${i}`)));
    expect(res.filter((s) => s !== null)).toHaveLength(MAX_DEVICES);
    expect(await listDevices(store, account.id)).toHaveLength(MAX_DEVICES);
  });

  it("MAX_DEVICES is 1 and removeDevice no longer exists", async () => {
    const accounts = await import("@/lib/auth/accounts");
    expect(MAX_DEVICES).toBe(1);
    expect((accounts as Record<string, unknown>).removeDevice).toBeUndefined();
  });
});

describe("admin operations", () => {
  it("resetAccess clears devices and activatedAt, bumps gen and issues a fresh token", async () => {
    const { store } = makeStore();
    const { account, token } = await provision(store, "A1");
    await claimDeviceSlot(store, account.id, "h1");
    expect(await claimDeviceSlot(store, account.id, "h2")).toBeNull();
    const before = (await getAccount(store, account.id))!;
    const fresh = await resetAccess(store, before);
    const after = (await getAccount(store, account.id))!;
    expect(after.gen).toBe(before.gen + 1);
    expect(after.activatedAt).toBeNull();
    expect(await listDevices(store, account.id)).toEqual([]);
    expect(await peekActivationToken(store, token!)).toBeNull();
    expect(await peekActivationToken(store, fresh)).toBe(account.id);
  });

  it("setStatus and setPasswordHash bump gen", async () => {
    const { store } = makeStore();
    const { account } = await provision(store, "A1");
    await setStatus(store, account.id, "revoked");
    let a = (await getAccount(store, account.id))!;
    expect(a).toMatchObject({ status: "revoked", gen: account.gen + 1 });
    await setPasswordHash(store, account.id, await hashPassword("n", FAST));
    a = (await getAccount(store, account.id))!;
    expect(a.gen).toBe(account.gen + 2);
  });
});
