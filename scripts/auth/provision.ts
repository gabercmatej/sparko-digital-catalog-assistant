/**
 * Provisioning CLI for individual reviewer access (accounts live in Upstash Redis).
 *
 *   npm run auth:provision -- create --reviewer LidijaR --reviewer AlešP --admin sedem-admin --base-url https://sparko.vercel.app
 *   npm run auth:provision -- status
 *   npm run auth:provision -- reset --user LidijaR --base-url https://...
 *   npm run auth:provision -- rotate-password --user LidijaR
 *
 * Passwords and activation tokens are written ONLY to a file under .secrets/ (git-ignored, mode 0600).
 * Stdout never contains them. See docs/ACCESS.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  createAccount,
  findAccountByUsername,
  foldUsername,
  generatePassword,
  issueActivationToken,
  listAccounts,
  listDevices,
  resetAccess,
  setPasswordHash,
  type Account,
  type Role,
} from "../../src/lib/auth/accounts";
import { getStats } from "../../src/lib/auth/analytics";
import { hashPassword } from "../../src/lib/auth/password";
import { DEFAULT_PREFIX, createStore, storeCredentials, type Store } from "../../src/lib/auth/store";

const HELP = `SPARko access provisioning

Usage: npm run auth:provision -- <command> [options]

Commands
  create   --reviewer <name> [--reviewer <name> ...] [--admin <name>] --base-url <https://...> [--rotate]
           Creates accounts with unique random passwords; reviewers get a one-time activation link.
           Existing usernames are skipped (with --rotate: new password, and for reviewers a new link).
  status   Non-secret overview: role, status, activation, browsers, visits, last visit.
  reset    --user <name> --base-url <https://...>   Unbind the browser, sign out, new activation link.
  rotate-password --user <name>                      New password (signs the account out).

Common options
  --env-file <path>   Load KEY=VALUE lines (does not override variables already set)
  --prefix <prefix>   Store key prefix (overrides SPARKO_STORE_PREFIX)
  --out <path>        Credentials file (must be under .secrets/ or outside the repository)
  --help

Required env: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL + KV_REST_API_TOKEN).
Credentials go to .secrets/sparko-credentials-<timestamp>.txt; stdout never shows passwords or links.`;

class UsageError extends Error {}

type Args = { command: string; opts: Map<string, string[]>; flags: Set<string> };

const FLAG_OPTIONS = new Set(["rotate", "help"]);

function parseArgs(argv: string[]): Args {
  const opts = new Map<string, string[]>();
  const flags = new Set<string>();
  let command = "";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const name = a.slice(2);
      if (FLAG_OPTIONS.has(name)) {
        flags.add(name);
        continue;
      }
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw new UsageError(`Option --${name} needs a value.`);
      opts.set(name, [...(opts.get(name) ?? []), value]);
    } else if (!command) {
      command = a;
    } else {
      throw new UsageError(`Unexpected argument: ${a}`);
    }
  }
  return { command, opts, flags };
}

const one = (args: Args, name: string) => args.opts.get(name)?.at(-1);

/** Loads simple KEY=VALUE lines (optionally quoted, `export ` and comments allowed); never overrides set variables. */
function loadEnvFile(path: string) {
  if (!existsSync(path)) throw new UsageError(`Env file not found: ${path}`);
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    const q = value[0];
    if ((q === '"' || q === "'") && value.lastIndexOf(q) > 0) value = value.slice(1, value.lastIndexOf(q));
    else value = value.replace(/\s+#.*$/, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

function validateUsername(name: string): string {
  const v = name.trim();
  if (v.length < 1 || v.length > 64 || /\s/.test(v)) throw new UsageError(`Invalid username "${name}": 1-64 characters, no whitespace.`);
  return v;
}

function validateBaseUrl(raw: string | undefined): string {
  if (!raw) throw new UsageError("--base-url <https://...> is required.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UsageError(`Invalid --base-url "${raw}".`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new UsageError("--base-url must be http(s).");
  return url.origin;
}

const repoRoot = process.cwd();
const pad = (n: number) => String(n).padStart(2, "0");

function outputPath(args: Args): string {
  const custom = one(args, "out");
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const path = resolve(custom ?? `.secrets/sparko-credentials-${stamp}.txt`);
  const rel = relative(repoRoot, path);
  const insideRepo = !rel.startsWith("..") && !isAbsolute(rel);
  if (insideRepo && rel.split(/[\\/]/)[0] !== ".secrets") {
    throw new UsageError("--out inside the repository must be under .secrets/ (git-ignored).");
  }
  if (existsSync(path)) throw new UsageError(`Refusing to overwrite existing file: ${path}`);
  return path;
}

function writeSecretsFile(path: string, content: string) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(path, content, { mode: 0o600, flag: "wx" });
}

const fmtTime = (ms: number | null | undefined) =>
  ms
    ? new Intl.DateTimeFormat("sl-SI", { timeZone: "Europe/Ljubljana", dateStyle: "short", timeStyle: "short" }).format(new Date(ms))
    : "-";

function openStore(args: Args): Store {
  const prefix = one(args, "prefix") ?? (process.env.SPARKO_STORE_PREFIX?.trim() || DEFAULT_PREFIX);
  const creds = storeCredentials(process.env);
  if (!creds) {
    throw new UsageError(
      "Store not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL and KV_REST_API_TOKEN), e.g. via --env-file .env.local.",
    );
  }
  return createStore({ ...creds, prefix, timeoutMs: 15000 });
}

type Entry = { account: Account; password: string | null; token?: string };

function messageFor(e: Entry, baseUrl: string): string {
  return [
    "Pozdravljeni!",
    "",
    "Za vpogled v SPARko vas vabimo, da se prijavite prek spodnje osebne povezave. Povezava deluje samo enkrat. Dostop bo vezan izključno na brskalnik, v katerem jo prvič odprete, zato jo odprite v brskalniku in na napravi, ki ju boste uporabljali (ne v zasebnem/incognito oknu).",
    "",
    `Povezava: ${baseUrl}/aktivacija?token=${e.token}`,
    `Uporabniško ime: ${e.account.username}`,
    `Geslo: ${e.password ?? "(nespremenjeno, uporabite svoje obstoječe geslo)"}`,
    "",
    "Pozneje se v aplikacijo vračate na običajnem naslovu v istem brskalniku; ob poteku seje se ponovno prijavite z uporabniškim imenom in geslom. Prijava iz drugega brskalnika ali naprave ni mogoča (tudi drug brskalnik na istem telefonu). Če zamenjate brskalnik ali izbrišete piškotke, se obrnite na skrbnika za ponastavitev dostopa.",
    "",
    "Lep pozdrav",
  ].join("\n");
}

function renderFile(title: string, entries: Entry[], baseUrl: string | null): string {
  const out = [
    `SPARko credentials - ${title}`,
    `Generated: ${new Date().toISOString()}`,
    "CONFIDENTIAL. Send each person only their own block, then delete this file.",
    "",
  ];
  for (const e of entries) {
    out.push("=".repeat(60), `Username: ${e.account.username}`, `Role: ${e.account.role}`);
    out.push(e.password ? `Password: ${e.password}` : "Password: (unchanged)");
    if (e.token && baseUrl) out.push(`Activation URL: ${baseUrl}/aktivacija?token=${e.token}`);
    out.push("");
    if (e.account.role === "reviewer" && e.token && baseUrl) out.push("--- Message (Slovenian) ---", messageFor(e, baseUrl), "");
  }
  return out.join("\n");
}

function finish(path: string, title: string, entries: Entry[], baseUrl: string | null) {
  if (!entries.length) {
    console.log("Nothing to write.");
    return;
  }
  writeSecretsFile(path, renderFile(title, entries, baseUrl));
  console.log(`\nCredentials written to ${path}`);
  console.log("Send each person only their own details, then delete the file. Nothing secret was printed here.");
}

async function cmdCreate(args: Args, store: Store) {
  const reviewers = (args.opts.get("reviewer") ?? []).map(validateUsername);
  const admins = (args.opts.get("admin") ?? []).map(validateUsername);
  if (!reviewers.length && !admins.length) throw new UsageError("create needs at least one --reviewer or --admin.");
  const baseUrl = reviewers.length || one(args, "base-url") ? validateBaseUrl(one(args, "base-url")) : null;
  const rotate = args.flags.has("rotate");
  const path = outputPath(args);
  const wanted: { name: string; role: Role }[] = [
    ...reviewers.map((name) => ({ name, role: "reviewer" as const })),
    ...admins.map((name) => ({ name, role: "admin" as const })),
  ];
  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const { name, role } of wanted) {
    const key = foldUsername(name);
    if (seen.has(key)) {
      console.log(`skip     ${name}: listed twice`);
      continue;
    }
    seen.add(key);
    const existing = await findAccountByUsername(store, name);
    if (existing && !rotate) {
      console.log(`skip     ${existing.username}: already exists (use --rotate, or the reset / rotate-password commands)`);
      continue;
    }
    const password = generatePassword();
    if (existing) {
      await setPasswordHash(store, existing.id, await hashPassword(password));
      const token = existing.role === "reviewer" ? await resetAccess(store, existing) : undefined;
      entries.push({ account: existing, password, token });
      console.log(`rotated  ${existing.username} (${existing.role})`);
      continue;
    }
    const account = await createAccount(store, { username: name, role, passwordHash: await hashPassword(password) });
    if (!account) {
      console.log(`skip     ${name}: already exists`);
      continue;
    }
    const token = role === "reviewer" ? await issueActivationToken(store, account) : undefined;
    entries.push({ account, password, token });
    console.log(`created  ${account.username} (${role})`);
  }
  finish(path, "create", entries, baseUrl);
}

async function requireUser(args: Args, store: Store): Promise<Account> {
  const name = one(args, "user");
  if (!name) throw new UsageError("--user <username> is required.");
  const account = await findAccountByUsername(store, validateUsername(name));
  if (!account) throw new UsageError(`No such user: ${name}`);
  return account;
}

async function cmdReset(args: Args, store: Store) {
  const baseUrl = validateBaseUrl(one(args, "base-url"));
  const path = outputPath(args);
  const account = await requireUser(args, store);
  if (account.role !== "reviewer") throw new UsageError("reset applies to reviewer accounts only.");
  const token = await resetAccess(store, account);
  console.log(`reset    ${account.username}: browser unbound, sessions ended, new activation link issued`);
  finish(path, "reset", [{ account, password: null, token }], baseUrl);
}

async function cmdRotate(args: Args, store: Store) {
  const path = outputPath(args);
  const account = await requireUser(args, store);
  const password = generatePassword();
  await setPasswordHash(store, account.id, await hashPassword(password));
  console.log(`rotated  ${account.username}: password changed, sessions ended`);
  finish(path, "rotate-password", [{ account, password }], null);
}

async function cmdStatus(store: Store) {
  const accounts = await listAccounts(store);
  if (!accounts.length) return console.log("No accounts yet.");
  const stats = await getStats(store, accounts.map((a) => a.id));
  const rows = [["username", "role", "status", "activated", "browser", "visits", "last visit"]];
  for (const a of accounts) {
    const devices = await listDevices(store, a.id);
    const s = stats[a.id];
    rows.push([
      a.username,
      a.role,
      a.status,
      a.activatedAt ? `yes ${fmtTime(a.activatedAt)}` : "no",
      devices.length ? "bound" : "-",
      String(s?.visits ?? 0),
      fmtTime(s?.lastSeen),
    ]);
  }
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => [...r[i]].length)));
  for (const r of rows) console.log(r.map((c, i) => c + " ".repeat(widths[i] - [...c].length)).join("  ").trimEnd());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.flags.has("help") || !args.command || args.command === "help") return console.log(HELP);
  const envFile = one(args, "env-file");
  if (envFile) loadEnvFile(envFile);
  if (!["create", "status", "reset", "rotate-password"].includes(args.command)) throw new UsageError(`Unknown command: ${args.command}`);
  const store = openStore(args);
  if (args.command === "create") await cmdCreate(args, store);
  else if (args.command === "status") await cmdStatus(store);
  else if (args.command === "reset") await cmdReset(args, store);
  else await cmdRotate(args, store);
}

main().catch((err) => {
  if (err instanceof UsageError) console.error(`${err.message}\n(run with --help for usage)`);
  else console.error(`Failed: ${err instanceof Error ? err.message : "unknown error"}`);
  process.exit(1);
});
