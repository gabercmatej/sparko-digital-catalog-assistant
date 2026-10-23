/**
 * Individual accounts, one-time activation links and authorized-browser slots (durable, in the store).
 *
 * Keys (all under the store prefix):
 *   acct:<id>            hash  id, username, role, passwordHash, status, gen, createdAt,
 *                              activatedAt?, actHash?, actIssuedAt?
 *   user:<folded name>   → id  (claimed with SET NX, so usernames are unique)
 *   accounts             set of ids
 *   act:<sha256(token)>  → id  one-time activation token; consumed with GETDEL (exactly one winner)
 *   dev:<id>:1           → "<sha256(device credential)>|<boundAt ms>"  the single authorized browser,
 *                              claimed with SET NX (one winner; MAX_DEVICES = 1)
 *
 * Only hashes of passwords (scrypt), activation tokens and device credentials (SHA-256 of 32 random
 * bytes) are stored. `gen` is bumped on revoke, password change and full reset: sessions carry the
 * gen they were issued under, so bumping it signs out every browser of that account.
 */
import { createHash, randomBytes } from "node:crypto";
import { hashFromReply, type Store } from "./store";

export type Role = "reviewer" | "admin";
export type Status = "active" | "revoked";

export type Account = {
  id: string;
  username: string;
  role: Role;
  passwordHash: string;
  status: Status;
  gen: number;
  createdAt: number;
  activatedAt: number | null;
  /** Hash of the currently valid activation token (null once consumed or never issued). */
  actHash: string | null;
  actIssuedAt: number | null;
};

export type DeviceSlot = { slot: number; hash: string; boundAt: number };

/** Strictly one authorized browser per reviewer account (only an admin reset moves it). */
export const MAX_DEVICES = 1;
/** Unused activation links stop working after 90 days (the admin can issue a new one). */
export const ACTIVATION_TTL_SECONDS = 90 * 24 * 60 * 60;

/** Case-, accent- and whitespace-insensitive username key: "AlešP", "alesp" and " ALEŠP " match. */
export function foldUsername(name: string): string {
  return name.normalize("NFKD").replace(/\p{M}+/gu, "").trim().toLowerCase();
}

export const sha256 = (value: string) => createHash("sha256").update(value).digest("base64url");
export const randomSecret = (bytes = 32) => randomBytes(bytes).toString("base64url");
/** Activation tokens, device credentials and session ids are all 32 random bytes in base64url. */
export const isWellFormedSecret = (v: unknown): v is string => typeof v === "string" && /^[\w-]{40,64}$/.test(v);

function toAccount(h: Record<string, string> | null): Account | null {
  if (!h?.id || !h.username || !h.passwordHash) return null;
  const num = (v: string | undefined) => (v ? Number(v) : null);
  return {
    id: h.id,
    username: h.username,
    role: h.role === "admin" ? "admin" : "reviewer",
    passwordHash: h.passwordHash,
    status: h.status === "active" ? "active" : "revoked",
    gen: Number(h.gen) || 0,
    createdAt: Number(h.createdAt) || 0,
    activatedAt: num(h.activatedAt),
    actHash: h.actHash || null,
    actIssuedAt: num(h.actIssuedAt),
  };
}

export async function getAccount(store: Store, id: string): Promise<Account | null> {
  return toAccount(hashFromReply(await store.run("HGETALL", store.key("acct", id))));
}

export async function findAccountByUsername(store: Store, username: string): Promise<Account | null> {
  const folded = foldUsername(username);
  if (!folded || folded.length > 64) return null;
  const id = await store.run("GET", store.key("user", folded));
  return typeof id === "string" ? getAccount(store, id) : null;
}

export async function listAccounts(store: Store): Promise<Account[]> {
  const ids = (await store.run("SMEMBERS", store.key("accounts"))) as string[] | null;
  if (!ids?.length) return [];
  const replies = await store.pipeline(ids.map((id) => ["HGETALL", store.key("acct", id)]));
  return replies
    .map((r) => toAccount(hashFromReply(r)))
    .filter((a): a is Account => a !== null)
    .sort((a, b) => (a.role === b.role ? a.createdAt - b.createdAt : a.role === "reviewer" ? -1 : 1));
}

/** Creates an account. Returns null when the username is already taken. */
export async function createAccount(
  store: Store,
  input: { username: string; role: Role; passwordHash: string },
  now = Date.now(),
): Promise<Account | null> {
  const folded = foldUsername(input.username);
  if (!folded) throw new Error("empty username");
  const id = `${input.role === "admin" ? "a" : "r"}_${randomBytes(6).toString("hex")}`;
  const claimed = await store.run("SET", store.key("user", folded), id, "NX");
  if (claimed !== "OK") return null;
  const fields = { id, username: input.username.trim(), role: input.role, passwordHash: input.passwordHash, status: "active", gen: 1, createdAt: now };
  await store.pipeline([
    ["HSET", store.key("acct", id), ...Object.entries(fields).flat()],
    ["SADD", store.key("accounts"), id],
  ]);
  return getAccount(store, id);
}

/** Issues a new one-time activation token (returned once, in plaintext) and invalidates any earlier one. */
export async function issueActivationToken(store: Store, account: Account, now = Date.now()): Promise<string> {
  const token = randomSecret();
  const hash = sha256(token);
  const cmds: (string | number)[][] = [
    ["SET", store.key("act", hash), account.id, "EX", ACTIVATION_TTL_SECONDS],
    ["HSET", store.key("acct", account.id), "actHash", hash, "actIssuedAt", now],
  ];
  if (account.actHash) cmds.unshift(["DEL", store.key("act", account.actHash)]);
  await store.pipeline(cmds);
  return token;
}

/** Account id an unconsumed activation token belongs to (does not consume it). */
export async function peekActivationToken(store: Store, token: string): Promise<string | null> {
  if (!isWellFormedSecret(token)) return null;
  const id = await store.run("GET", store.key("act", sha256(token)));
  return typeof id === "string" ? id : null;
}

/**
 * Atomically consumes the token for `accountId`. Of any number of concurrent calls with the same
 * token, at most one returns true (GETDEL). A token of another account is left untouched.
 */
export async function consumeActivationToken(store: Store, token: string, accountId: string): Promise<boolean> {
  if ((await peekActivationToken(store, token)) !== accountId) return false;
  const hash = sha256(token);
  const owner = await store.run("GETDEL", store.key("act", hash));
  if (owner !== accountId) return false;
  await store.run("HDEL", store.key("acct", accountId), "actHash");
  return true;
}

const slotKeys = (store: Store, id: string) => Array.from({ length: MAX_DEVICES }, (_, i) => store.key("dev", id, i + 1));

export async function listDevices(store: Store, accountId: string): Promise<DeviceSlot[]> {
  const values = await store.pipeline(slotKeys(store, accountId).map((k) => ["GET", k]));
  return values.flatMap((v, i) => {
    if (typeof v !== "string") return [];
    const [hash, at] = v.split("|");
    return [{ slot: i + 1, hash, boundAt: Number(at) || 0 }];
  });
}

/** Slot already bound to this device credential hash, or null. */
export async function findDeviceSlot(store: Store, accountId: string, deviceHash: string): Promise<number | null> {
  return (await listDevices(store, accountId)).find((d) => d.hash === deviceHash)?.slot ?? null;
}

/** Binds a device to the free slot (SET NX, so concurrent claims never exceed MAX_DEVICES). */
export async function claimDeviceSlot(store: Store, accountId: string, deviceHash: string, now = Date.now()): Promise<number | null> {
  const keys = slotKeys(store, accountId);
  for (let i = 0; i < keys.length; i++) {
    if ((await store.run("SET", keys[i], `${deviceHash}|${now}`, "NX")) === "OK") return i + 1;
  }
  return null;
}

/** First activation time is kept from the very first activation (HSETNX). */
export async function markActivated(store: Store, accountId: string, now = Date.now()): Promise<void> {
  await store.run("HSETNX", store.key("acct", accountId), "activatedAt", now);
}

// ------------------------------------------------------------------------------- admin operations

/**
 * Full reset: invalidates the bound device credential and every session (slot deleted, gen bumped)
 * BEFORE the fresh activation token is issued and returned.
 */
export async function resetAccess(store: Store, account: Account, now = Date.now()): Promise<string> {
  await store.pipeline([
    ...slotKeys(store, account.id).map((k) => ["DEL", k]),
    ["HDEL", store.key("acct", account.id), "activatedAt"],
    ["HINCRBY", store.key("acct", account.id), "gen", 1],
  ]);
  return issueActivationToken(store, account, now);
}

export async function setStatus(store: Store, accountId: string, status: Status): Promise<void> {
  await store.pipeline([
    ["HSET", store.key("acct", accountId), "status", status],
    ["HINCRBY", store.key("acct", accountId), "gen", 1],
  ]);
}

/** Replaces the password hash and signs out every session of the account. Device bindings stay. */
export async function setPasswordHash(store: Store, accountId: string, passwordHash: string): Promise<void> {
  await store.pipeline([
    ["HSET", store.key("acct", accountId), "passwordHash", passwordHash],
    ["HINCRBY", store.key("acct", accountId), "gen", 1],
  ]);
}

/** Random password for generated credentials: 4 groups of 5 unambiguous characters (≈ 115 bits). */
export function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(40);
  const chars: string[] = [];
  for (const b of bytes) {
    if (b >= 256 - (256 % alphabet.length)) continue; // no modulo bias
    chars.push(alphabet[b % alphabet.length]);
    if (chars.length === 20) break;
  }
  if (chars.length < 20) return generatePassword();
  return [0, 5, 10, 15].map((i) => chars.slice(i, i + 5).join("")).join("-");
}
