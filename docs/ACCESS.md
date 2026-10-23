# SPARko access: operator guide

Individual reviewer access to the SPARko demo. Read the **Security limitations** section before promising anyone confidentiality.

## How it works

- **Individual accounts.** Each reviewer has their own username and a unique random password (only an scrypt hash is stored). Admins (role `admin`) manage access at `/skrbnik`.
- **One-time activation link.** A reviewer's first sign-in is through `/aktivacija?token=...`. The link works once (atomic consume; concurrent attempts have exactly one winner). Unused links expire after 90 days.
- **Exactly one authorized browser per reviewer.** The browser that redeems the link receives a random device credential (HttpOnly cookie; only its SHA-256 is stored) and is the only one that can ever sign in to that account. Every other browser or device is rejected even with the correct password: another browser on the same phone, an incognito window, another profile, or the same browser after its cookies were cleared. Only an admin reset (which first invalidates the old credential and all sessions) issues a new link. There is no second slot.
- **Validated on every protected request**, not only at login: the session must exist in the store, match the account's current generation, and the browser's device credential must match the stored binding.
- **Durable state in Upstash Redis.** Accounts, browser bindings, activation tokens and visit statistics live in the store. There is no in-memory fallback: if the store or `SPARKO_AUTH_SECRET` is missing, nobody can sign in (fail closed).
- **Sessions last 24 hours.** After that the reviewer signs in again with the password, only in the authorized browser (no new link needed).
- **Visit counting.** A new visit starts with the first authenticated request after at least 30 minutes of inactivity. Only counts and times are stored (no chat content, IPs or user agents). Times are shown in Europe/Ljubljana.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | yes (or the pair below) | Store |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | alternative | Names set by the Vercel Marketplace integration |
| `SPARKO_AUTH_SECRET` | yes | At least 32 random characters; seals the session cookie |
| `SPARKO_PUBLIC_URL` | optional | Public https URL of the deployment |
| `SPARKO_STORE_PREFIX` | optional | Key namespace (default `sparko:v2:`); use another for staging/tests |

## Setup

1. In Vercel: Marketplace, add **Upstash for Redis** (free plan) and connect it to the SPARko project. This adds the `KV_REST_API_*` variables.
2. Generate the secret and add it as `SPARKO_AUTH_SECRET` (Production, Sensitive):
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
3. Redeploy (env changes only apply to new deployments).
4. Pull the variables locally for provisioning: `vercel env pull .env.local`.

## Provisioning reviewers

```bash
npm run auth:provision -- create --reviewer LidijaR --reviewer AlešP --admin sedem-admin \
  --base-url https://<deployment> --env-file .env.local
```

- Each account gets a unique random password; reviewers also get an activation link. Existing usernames are skipped (add `--rotate` to issue a new password and, for reviewers, a fresh link).
- Passwords and links are written **only** to `.secrets/sparko-credentials-<timestamp>.txt` (git-ignored, owner-only permissions on POSIX). The terminal shows usernames and status, never secrets. `--out` must be under `.secrets/` or outside the repository.
- The file also contains a ready-to-send Slovenian message per reviewer. Send each person only their own block (ideally link and password through different channels), then delete the file.
- Usernames: 1 to 64 characters, no whitespace, case- and accent-insensitive (`AlešP` = `alesp`).

Other commands (all accept `--env-file`, `--prefix`, `--out`):

| Command | Purpose |
| --- | --- |
| `status` | Non-secret table: role, status, activation time, browser bound, visits, last visit |
| `reset --user <name> --base-url <url>` | Unbind the browser, sign out, issue a new activation link |
| `rotate-password --user <name>` | New password (signs the account out; browser bindings stay) |

## Admin operations (`/skrbnik`)

Reset access (invalidates the bound browser and all sessions, then issues a new link), issue a new activation link (only for accounts not yet activated), revoke/restore an account, rotate a password, and view visits and history. Revoking or rotating signs the account out.

## Security limitations

- **A link protects only after first use.** Whoever opens it first becomes the authorized browser. Send it over a channel you trust and check `status` afterwards (activated: yes, browser bound).
- **This is browser binding, not physical-device verification.** A web app cannot prove which physical device it runs on (no IP, user-agent or fingerprinting is used). The binding is a cookie credential: someone who deliberately copies or steals the cookies of the authorized browser profile can reuse them until an admin resets the account. Conversely, Chrome and Safari on the same phone are two different browsers, and only one of them can be authorized.
- **Static leaflet images and product photos are checked statelessly** (session seal plus device cookie, without a store lookup), so revocation reaches them within 24 hours, not instantly.
- **Catalog data shipped in client JavaScript bundles** is visible to every signed-in user and to anything they share.
- **Failed sign-ins lock a username for up to 15 minutes** (10 attempts per username, 20 per IP, durable). Someone who knows a username can deliberately trigger this. It recovers on its own.
- **Admin accounts are not browser-bound** (password only, still rate-limited, sessions revocable).
- **`noindex` and no-cache headers are not confidentiality guarantees.** They discourage indexing and caching only.

Treat this as access control for a review of a demo, not protection for data that must stay secret.
