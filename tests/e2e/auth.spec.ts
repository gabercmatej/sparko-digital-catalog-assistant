import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { E2E_ADMIN, E2E_ADMIN_PASSWORD, e2eStore, provisionAccount, type Provisioned } from "./auth-credentials";

// Every test starts signed out; "different browsers" are separate browser contexts. The login limiter
// allows 20 attempts per IP per 15 min, so each context presents its own (spoofed) x-forwarded-for.
test.use({ storageState: { cookies: [], origins: [] } });

const MSG = {
  invalid: "Napačno uporabniško ime ali geslo.",
  device: "Ta račun je že aktiviran v drugem brskalniku ali napravi. Za ponastavitev dostopa se obrnite na skrbnika.",
  notActivated: "Račun še ni aktiviran.",
  revoked: "Dostop do tega računa ni na voljo.",
};

let ipCounter = 0;
const nextIp = () => `10.${30 + Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 250)}.${(++ipCounter % 250) + 1}`;
let nameCounter = 0;
const uniqueName = (prefix = "rev") => `e2e-${prefix}-${Date.now().toString(36)}${(++nameCounter).toString(36)}`;

const opened: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((c) => c.close().catch(() => {})));
});

async function browserOf(browser: Browser, baseURL: string, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({
    baseURL,
    viewport,
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: { "x-forwarded-for": nextIp() },
  });
  opened.push(context);
  return { context, page: await context.newPage() };
}

const newReviewer = (): Promise<Provisioned> => provisionAccount(e2eStore(), uniqueName(), "reviewer");

async function fillLogin(page: Page, identifier: string, password: string, button = "Prijavi se") {
  await page.getByLabel("Uporabniško ime ali e-pošta").fill(identifier);
  await page.getByLabel("Geslo", { exact: true }).fill(password);
  await page.getByRole("button", { name: button }).click();
}

const activationPath = (token: string) => `/aktivacija?token=${token}`;

async function openActivation(page: Page, token: string) {
  await page.goto(activationPath(token));
  await expect(page).toHaveURL(/\/aktivacija$/);
}

async function activate(page: Page, r: Provisioned) {
  await openActivation(page, r.token!);
  await fillLogin(page, r.account.username, r.password, "Aktiviraj dostop");
  await expect(page).toHaveURL(/\/domov$/);
}

async function signIn(page: Page, username: string, password: string) {
  await page.goto("/prijava");
  await fillLogin(page, username, password);
}

// A dead link on an already-bound account is reported as the device message; a lost race as "link invalid".
const DEAD_LINK = /Aktivacijska povezava ni veljavna ali je že bila uporabljena|že aktiviran v drugem brskalniku ali napravi/;
const alertWith = (page: Page, text: string | RegExp) => page.getByRole("alert").filter({ hasText: text });
const menu = (page: Page) => page.getByRole("button", { name: "Odpri meni" }).first();

async function logout(page: Page) {
  await menu(page).click();
  await page.getByRole("button", { name: "Odjava" }).click();
  await expect(page).toHaveURL(/\/prijava/);
}

/** Simulates session expiry: only the session cookie goes away, the device cookie stays. */
async function dropSession(context: BrowserContext) {
  const keep = (await context.cookies()).filter((c) => c.name !== "sparko_session");
  await context.clearCookies();
  await context.addCookies(keep);
}

async function adminSignIn(browser: Browser, baseURL: string) {
  const b = await browserOf(browser, baseURL, { width: 1280, height: 900 });
  await signIn(b.page, E2E_ADMIN, E2E_ADMIN_PASSWORD);
  await expect(b.page).toHaveURL(/\/skrbnik$/);
  return b;
}

type Row = { id: string; username: string; status: string; stats: { visits: number; pageViews: number } };
async function accountRow(request: APIRequestContext, username: string): Promise<Row> {
  const res = await request.get("/api/admin/accounts");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { accounts: Row[] };
  const row = body.accounts.find((a) => a.username === username);
  expect(row, `account ${username} listed`).toBeTruthy();
  return row!;
}

// ------------------------------------------------------------------------------------- signed out

test("signed-out / redirects to the login page", async ({ browser, baseURL }) => {
  const { page } = await browserOf(browser, baseURL!);
  await page.goto("/");
  await expect(page).toHaveURL(/\/prijava$/);
  await expect(page.getByRole("heading", { name: "Prijava" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Prijavi se" })).toBeVisible();
});

for (const vp of [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
  { width: 1280, height: 800 },
]) {
  for (const path of ["/prijava", "/aktivacija"]) {
    test(`disclaimer is shown below the info footer on ${path} at ${vp.width}x${vp.height}`, async ({ browser, baseURL }) => {
      const { page } = await browserOf(browser, baseURL!, vp);
      await page.goto(path);
      const info = page.getByText("Podatke za prijavo prejmete od skrbnika.");
      const owner = page.getByText("Demo je last podjetja Sedem d.o.o.");
      const conf = page.getByText("Strictly confidential");
      await conf.scrollIntoViewIfNeeded();
      await expect(owner).toBeVisible();
      await expect(conf).toBeVisible();
      await expect(owner).toBeInViewport();
      await expect(conf).toBeInViewport();
      const ib = (await info.boundingBox())!;
      const ob = (await owner.boundingBox())!;
      const cb = (await conf.boundingBox())!;
      expect(ob.y).toBeGreaterThanOrEqual(ib.y + ib.height - 1);
      expect(cb.y).toBeGreaterThanOrEqual(ib.y + ib.height - 1);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      expect(m.sw).toBeLessThanOrEqual(m.iw);
    });
  }
}

test("login and activation pages are served no-store", async ({ request }) => {
  for (const path of ["/prijava", "/aktivacija"]) {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"] ?? "").toContain("no-store");
  }
});

test("unauthenticated API calls answer 401", async ({ request }) => {
  const chat = await request.post("/api/chat", { data: { messages: [{ role: "user", content: "pozdravljen" }] } });
  expect(chat.status()).toBe(401);
  expect((await request.get("/api/admin/accounts")).status()).toBe(401);
  expect((await request.get("/catalog/spar-1.webp")).status()).toBe(401);
  expect((await request.get("/brand/sparko-mascot.webp")).status()).toBe(200);
});

// ---------------------------------------------------------------------------------- activation

test("first activation via link lands on Home, hides the token and keeps the session", async ({ browser, baseURL }) => {
  const r = await newReviewer();
  const { page, context } = await browserOf(browser, baseURL!);
  const seen: string[] = [];
  page.on("framenavigated", (f) => f === page.mainFrame() && seen.push(f.url()));
  await page.goto(activationPath(r.token!));
  await expect(page).toHaveURL(/\/aktivacija$/);
  await expect(page.getByRole("heading", { name: "Aktivacija" })).toBeVisible();
  await fillLogin(page, r.account.username, r.password, "Aktiviraj dostop");
  await expect(page).toHaveURL(/\/domov$/);
  await expect(menu(page)).toBeVisible();
  // After the proxy redirect the token never shows up in the address bar again.
  for (const u of seen.slice(1)) expect(u).not.toContain(r.token!);
  expect(page.url()).not.toContain(r.token!);
  const names = (await context.cookies()).map((c) => c.name);
  expect(names).toContain("sparko_session");
  expect(names).toContain("sparko_device");

  await page.reload();
  await expect(page).toHaveURL(/\/domov$/);
  await expect(menu(page)).toBeVisible();
  await page.goto("/moj-katalog");
  await expect(page).toHaveURL(/\/moj-katalog$/);
  await page.goto("/letak");
  await expect(page).toHaveURL(/\/letak/);
  await page.goto("/domov");
  await expect(page).toHaveURL(/\/domov$/);
});

test("a reused activation link is rejected in another browser", async ({ browser, baseURL }) => {
  const r = await newReviewer();
  const a = await browserOf(browser, baseURL!);
  await activate(a.page, r);
  const b = await browserOf(browser, baseURL!);
  await openActivation(b.page, r.token!);
  await fillLogin(b.page, r.account.username, r.password, "Aktiviraj dostop");
  await expect(alertWith(b.page, DEAD_LINK)).toBeVisible();
  await expect(b.page).not.toHaveURL(/\/domov/);
});

test("concurrent activation with the same link signs in exactly one browser", async ({ browser, baseURL }) => {
  const r = await newReviewer();
  const a = await browserOf(browser, baseURL!);
  const b = await browserOf(browser, baseURL!);
  await Promise.all([openActivation(a.page, r.token!), openActivation(b.page, r.token!)]);
  for (const p of [a.page, b.page]) {
    await p.getByLabel("Uporabniško ime ali e-pošta").fill(r.account.username);
    await p.getByLabel("Geslo", { exact: true }).fill(r.password);
  }
  await Promise.all([
    a.page.getByRole("button", { name: "Aktiviraj dostop" }).click(),
    b.page.getByRole("button", { name: "Aktiviraj dostop" }).click(),
  ]);
  const settled = async () => {
    let n = 0;
    for (const p of [a.page, b.page]) {
      if (/\/domov$/.test(p.url())) n++;
      else if ((await alertWith(p, DEAD_LINK).count()) > 0) n++;
    }
    return n;
  };
  await expect.poll(settled, { timeout: 15_000 }).toBe(2);
  expect([a.page, b.page].filter((p) => /\/domov$/.test(p.url()))).toHaveLength(1);
});

// ---------------------------------------------------------------------------- sign-in behaviour

test("returning on the original browser after the session expired needs only the password", async ({ browser, baseURL }) => {
  const r = await newReviewer();
  const { page, context } = await browserOf(browser, baseURL!);
  await activate(page, r);
  await dropSession(context);
  await page.goto("/");
  await expect(page).toHaveURL(/\/prijava/);
  await fillLogin(page, r.account.username, r.password);
  await expect(page).toHaveURL(/\/domov$/);
  await expect(menu(page)).toBeVisible();
});

test("the same browser can reopen the app repeatedly (new tab, new page)", async ({ browser, baseURL }) => {
  const r = await newReviewer();
  const { page, context } = await browserOf(browser, baseURL!);
  await activate(page, r);
  for (let i = 0; i < 3; i++) {
    const tab = await context.newPage();
    await tab.goto("/");
    await expect(tab).not.toHaveURL(/\/prijava/);
    await tab.close();
  }
  await page.goto("/domov");
  await expect(menu(page)).toBeVisible();
});

test("a second browser with the correct password is rejected; the first keeps working", async ({ browser, baseURL }) => {
  const r = await newReviewer();
  const a = await browserOf(browser, baseURL!);
  await activate(a.page, r);

  const second = await browserOf(browser, baseURL!);
  await signIn(second.page, r.account.username, r.password);
  await expect(alertWith(second.page, MSG.device)).toBeVisible();
  await expect(second.page).toHaveURL(/\/prijava/);
  expect((await second.context.cookies()).map((c) => c.name)).not.toContain("sparko_session");

  await a.page.reload();
  await expect(a.page).toHaveURL(/\/domov$/);
});

test("clearing all cookies loses the binding: password sign-in is rejected and the used link stays dead", async ({ browser, baseURL }) => {
  const r = await newReviewer();
  const { page, context } = await browserOf(browser, baseURL!);
  await activate(page, r);
  await context.clearCookies();
  await signIn(page, r.account.username, r.password);
  await expect(alertWith(page, MSG.device)).toBeVisible();
  await expect(page).toHaveURL(/\/prijava/);
  await openActivation(page, r.token!);
  await fillLogin(page, r.account.username, r.password, "Aktiviraj dostop");
  await expect(alertWith(page, DEAD_LINK)).toBeVisible();
  await expect(page).not.toHaveURL(/\/domov/);
});

test("wrong password and unknown user show the same generic error", async ({ browser, baseURL }) => {
  const r = await newReviewer();
  const { page } = await browserOf(browser, baseURL!);
  await signIn(page, r.account.username, "wrong-password");
  await expect(alertWith(page, MSG.invalid)).toBeVisible();
  await expect(page).toHaveURL(/\/prijava/);
  await page.reload();
  await fillLogin(page, uniqueName("nobody"), r.password);
  await expect(alertWith(page, MSG.invalid)).toBeVisible();
  await expect(page).toHaveURL(/\/prijava/);
});

test("a never-activated account cannot sign in at /prijava", async ({ browser, baseURL }) => {
  const r = await newReviewer();
  const { page } = await browserOf(browser, baseURL!);
  await signIn(page, r.account.username, r.password);
  await expect(alertWith(page, MSG.notActivated)).toBeVisible();
  await expect(page).toHaveURL(/\/prijava/);
});

test("logout returns to login; Back does not expose the app and signing in again works", async ({ browser, baseURL }) => {
  const r = await newReviewer();
  const { page } = await browserOf(browser, baseURL!);
  await activate(page, r);
  await logout(page);
  await page.goBack().catch(() => {});
  await expect(page).not.toHaveURL(/\/(domov|letak|moj-katalog)$/);
  await expect(page.getByRole("button", { name: "Odpri meni" })).toHaveCount(0);
  await page.goto("/domov");
  await expect(page).toHaveURL(/\/prijava/);
  await fillLogin(page, r.account.username, r.password);
  await expect(page).toHaveURL(/\/domov$/);
});

test("the existing app works after login", async ({ browser, baseURL }) => {
  const r = await newReviewer();
  const { page } = await browserOf(browser, baseURL!);
  await activate(page, r);
  const cards = page.locator("[data-catalog-card]");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveAttribute("href", "/letak");
  await page.goto("/");
  await expect(page.getByPlaceholder("Vprašaj Sparka o katalogu …")).toBeVisible();
});

// ------------------------------------------------------------------------------------------ admin

test("reviewers cannot reach the admin area", async ({ browser, baseURL }) => {
  const r = await newReviewer();
  const { page, context } = await browserOf(browser, baseURL!);
  await activate(page, r);
  await page.goto("/skrbnik");
  await expect(page).toHaveURL(/\/domov$/);
  expect((await context.request.get("/api/admin/accounts")).status()).toBe(403);
});

test("admin dashboard: stats, visit history, reset access, revoke and restore", async ({ browser, baseURL }) => {
  const r = await newReviewer();
  const name = r.account.username;
  const rev = await browserOf(browser, baseURL!);
  await activate(rev.page, r);

  const admin = await adminSignIn(browser, baseURL!);
  const ap = admin.page;
  ap.on("dialog", (d) => void d.accept());
  await expect(ap.getByRole("heading", { name: "Skrbništvo dostopa" })).toBeVisible();
  await expect(ap.getByText("Skupaj obiskov")).toBeVisible();
  await expect(ap.getByText("Aktiviranih pregledovalcev")).toBeVisible();

  const row = ap.locator(`tbody[data-account="${name}"]`);
  await expect(row).toBeVisible();
  await expect(row.getByText("Aktiviran", { exact: true })).toBeVisible();
  const visits = row.locator("tr").first().locator("td").nth(4);
  await expect.poll(async () => Number(await visits.textContent())).toBeGreaterThanOrEqual(1);

  // Visit history shows at least one date.
  await row.getByRole("button", { name: "Zgodovina obiskov" }).click();
  await expect(row.locator("ul li").first()).toContainText(/\d{4}/);

  // Reset: fresh link, old browser signed out, the new link activates a fresh browser.
  await row.getByRole("button", { name: "Ponastavi dostop" }).click();
  const secret = ap.locator('section[aria-label="Enkratna skrivnost"] code');
  await expect(secret).toContainText("/aktivacija?token=");
  const link = (await secret.textContent())!.trim();
  await rev.page.reload();
  await expect(rev.page).toHaveURL(/\/prijava/);
  await fillLogin(rev.page, name, r.password);
  await expect(alertWith(rev.page, "Račun še ni aktiviran.")).toBeVisible();
  await expect(rev.page).not.toHaveURL(/\/domov/);
  const fresh = await browserOf(browser, baseURL!);
  await fresh.page.goto(link);
  await expect(fresh.page).toHaveURL(/\/aktivacija$/);
  await fillLogin(fresh.page, name, r.password, "Aktiviraj dostop");
  await expect(fresh.page).toHaveURL(/\/domov$/);

  // Revoke: the browser is bounced and sign-in explains why.
  await ap.getByRole("button", { name: "Osveži" }).click();
  await row.getByRole("button", { name: "Prekliči dostop" }).click();
  await expect(row.getByText("Preklican", { exact: true })).toBeVisible();
  await fresh.page.reload();
  await expect(fresh.page).toHaveURL(/\/prijava/);
  await fillLogin(fresh.page, name, r.password);
  await expect(alertWith(fresh.page, MSG.revoked)).toBeVisible();

  // Restore: the bound browser can sign in again.
  await row.getByRole("button", { name: "Obnovi dostop" }).click();
  await expect(row.getByText("Aktiviran", { exact: true })).toBeVisible();
  await fresh.page.getByRole("button", { name: "Prijavi se" }).click();
  await expect(fresh.page).toHaveURL(/\/domov$/);
});

test("refreshing the page does not increase the visit count", async ({ browser, baseURL }) => {
  const r = await newReviewer();
  const name = r.account.username;
  const rev = await browserOf(browser, baseURL!);
  await activate(rev.page, r);
  const admin = await adminSignIn(browser, baseURL!);
  const before = await accountRow(admin.context.request, name);
  expect(before.stats.visits).toBeGreaterThanOrEqual(1);
  for (let i = 0; i < 5; i++) {
    await rev.page.reload();
    await expect(menu(rev.page)).toBeVisible();
  }
  await expect
    .poll(async () => (await accountRow(admin.context.request, name)).stats.pageViews, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(before.stats.pageViews + 5);
  const after = await accountRow(admin.context.request, name);
  expect(after.stats.visits).toBe(before.stats.visits);
});
