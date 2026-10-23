/**
 * Generates the demo-login environment values locally:
 *   SPARKO_DEMO_LOGIN, SPARKO_DEMO_PASSWORD_HASH (scrypt), SPARKO_AUTH_SECRET (48 random bytes).
 *
 *   npm run auth:generate -- --login SPAR                 # asks for the password (hidden)
 *   npm run auth:generate -- --login SPAR --out .env.local # writes the file instead of printing
 *   SPARKO_PASSWORD=... npm run auth:generate -- --login SPAR
 *
 * Nothing is sent anywhere. Never commit the output; paste it into Vercel → Settings → Environment Variables.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { hashPassword } from "../../src/lib/auth/password";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

/** Reads a line from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return reject(new Error("No terminal: set SPARKO_PASSWORD instead."));
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (ch: string) => {
      if (ch === "\r" || ch === "\n" || ch === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(value);
      } else if (ch === "\u0003") {
        process.exit(130);
      } else if (ch === "\u007f" || ch === "\b") {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const login = arg("login") ?? "SPAR";
  const email = arg("email");
  const out = arg("out");
  const password = process.env.SPARKO_PASSWORD ?? (await promptHidden("Demo password: "));
  if (!password) throw new Error("Empty password.");

  const lines = [
    `SPARKO_DEMO_LOGIN=${login}`,
    `SPARKO_DEMO_PASSWORD_HASH=${await hashPassword(password)}`,
    `SPARKO_AUTH_SECRET=${randomBytes(48).toString("base64url")}`,
    ...(email ? [`SPARKO_DEMO_EMAIL=${email}`] : []),
  ];

  if (out) {
    // Replace earlier SPARKO_* auth lines, keep everything else in the file.
    const keep = existsSync(out)
      ? readFileSync(out, "utf8").split(/\r?\n/).filter((l) => l && !/^SPARKO_(DEMO_LOGIN|DEMO_PASSWORD_HASH|AUTH_SECRET|DEMO_EMAIL)=/.test(l))
      : [];
    writeFileSync(out, [...keep, ...lines].join("\n") + "\n");
    console.log(`Wrote ${lines.length} auth variables to ${out} (values not printed).`);
  } else {
    console.log(lines.join("\n"));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
