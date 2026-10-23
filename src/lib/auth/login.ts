/**
 * Sign-in decision for individual accounts (no HTTP here, so it is unit-testable).
 *
 * Strict rule: ONE reviewer account = ONE authorized browser installation/profile.
 * Reviewer, after username + password are verified:
 *   1. This browser holds the account's bound device credential → signed in (re-auth after an expired
 *      session or logout never needs the activation link again).
 *   2. A one-time activation token is presented and the account has no bound browser → the token is
 *      consumed atomically (GETDEL; one winner), the device slot is claimed with SET NX (one winner),
 *      this browser gets a NEW random device credential, the account is marked activated.
 *   3. Anything else is rejected: a correct password never authorizes another browser. An activated
 *      account → "device_limit"; a never-activated one → "not_activated". Lost cookies, another browser
 *      on the same phone, incognito, another device: all need an admin reset (new link).
 * Admin: password only, not browser-bound (sessions are still durable and revocable).
 */
import {
  claimDeviceSlot,
  consumeActivationToken,
  findAccountByUsername,
  findDeviceSlot,
  isWellFormedSecret,
  listDevices,
  markActivated,
  randomSecret,
  sha256,
  type Account,
} from "./accounts";
import { hashPassword, verifyPassword } from "./password";
import { checkLoginAttempt, refundLoginAttempt } from "./ratelimit";
import type { Store } from "./store";

export type LoginInput = { identifier: string; password: string; activationToken?: string | null; deviceCredential?: string | null };

export type LoginFailure = "invalid" | "rate_limited" | "revoked" | "device_limit" | "not_activated" | "activation_invalid";

export type LoginResult =
  | {
      ok: true;
      account: Account;
      /** Device slot + credential hash this session is bound to (null for admins). */
      device: { slot: number; hash: string } | null;
      /** Device credential to (re)set as the browser's device cookie, or null to leave it. */
      deviceCredential: string | null;
      /** True when this sign-in consumed the activation token. */
      activated: boolean;
    }
  | { ok: false; code: LoginFailure };

// Unknown usernames are checked against this hash so they take as long as a wrong password.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword(randomSecret()));

export async function authenticate(store: Store, input: LoginInput, ctx: { ip: string; now?: number }): Promise<LoginResult> {
  const now = ctx.now ?? Date.now();
  if (!(await checkLoginAttempt(store, ctx.ip, input.identifier, now))) return { ok: false, code: "rate_limited" };

  const account = await findAccountByUsername(store, input.identifier);
  const passwordOk = input.password.length > 0 && (await verifyPassword(input.password, account?.passwordHash ?? (await getDummyHash())));
  if (!account || !passwordOk) return { ok: false, code: "invalid" };
  await refundLoginAttempt(store, input.identifier, now);
  if (account.status !== "active") return { ok: false, code: "revoked" };
  if (account.role === "admin") return { ok: true, account, device: null, deviceCredential: null, activated: false };

  const existing = isWellFormedSecret(input.deviceCredential) ? input.deviceCredential : null;
  if (existing) {
    const slot = await findDeviceSlot(store, account.id, sha256(existing));
    if (slot) return { ok: true, account, device: { slot, hash: sha256(existing) }, deviceCredential: null, activated: false };
  }

  const token = input.activationToken;
  if (!token) return { ok: false, code: account.activatedAt ? "device_limit" : "not_activated" };

  // A link that cannot be consumed (already used, lost a concurrent race, other account) fails, so one
  // link never authorizes two browsers. An account that still has a bound browser is never re-bound by
  // a link (only an admin reset clears the binding); checked before consuming so the link is not burned.
  if ((await listDevices(store, account.id)).length > 0) return { ok: false, code: "device_limit" };
  if (!(await consumeActivationToken(store, token, account.id))) return { ok: false, code: "activation_invalid" };
  // Always a fresh credential: a cookie left over from before a reset can never become valid again.
  const credential = randomSecret();
  const hash = sha256(credential);
  const slot = await claimDeviceSlot(store, account.id, hash, now);
  if (!slot) return { ok: false, code: "device_limit" };
  await markActivated(store, account.id, now);
  return { ok: true, account: { ...account, activatedAt: account.activatedAt ?? now }, device: { slot, hash }, deviceCredential: credential, activated: true };
}
