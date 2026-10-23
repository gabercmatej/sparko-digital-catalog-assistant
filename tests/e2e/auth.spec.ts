import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E_EMAIL, E2E_LOGIN, E2E_PASSWORD, E2E_SECRET } from "./auth-credentials";

// Every test here starts signed out. The server's in-memory login limiter allows 10 attempts per
// IP per 15 min, so each test presents its own (spoofed) client IP via x-forwarded-for.
test.use({ storageState: { cookies: [], origins: [] } });

const ERROR = "Napačno uporabniško ime ali geslo.";
let ipCounter = 0;
const nextIp = () => `10.20.${Math.floor(Math.random() * 200)}.${(++ipCounter % 250) + 1}`;

test.beforeEach(async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
});

const alertWith = (page: Page, text = ERROR) => page.getByRole("alert").filter({ hasText: text });

async function fillLogin(page: Page, identifier: string, password: string) {
  await page.getByLabel("Uporabniško ime ali e-pošta").fill(identifier);
  await page.getByLabel("Geslo", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Prijavi se" }).click();
}

async function signIn(page: Page, path = "/") {
  await page.goto(path);
  await expect(page).toHaveURL(/\/prijava/);
  await fillLogin(page, E2E_LOGIN, E2E_PASSWORD);
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Odpri meni" }).first().click();
  await page.getByRole("button", { name: "Odjava" }).click();
  await expect(page).toHaveURL(/\/prijava/);
}

test("1. / shows the login page when signed out", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/prijava$/);
  await expect(page.getByRole("heading", { name: "Prijava" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Prijavi se" })).toBeVisible();
});

test("2. valid username + password lands on Home", async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/domov$/);
  await expect(page.getByRole("button", { name: "Odpri meni" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Prijava" })).toHaveCount(0);
});

test("3. wrong password shows a generic error and stays on /prijava", async ({ page }) => {
  await page.goto("/prijava");
  await fillLogin(page, E2E_LOGIN, "wrong-password");
  await expect(alertWith(page)).toBeVisible();
  await expect(page).toHaveURL(/\/prijava/);
});

test("4. unknown username fails with the same message", async ({ page }) => {
  await page.goto("/prijava");
  await fillLogin(page, "nobody", E2E_PASSWORD);
  await expect(alertWith(page)).toBeVisible();
  await expect(page).toHaveURL(/\/prijava/);
});

test("5. configured email alias works (case-insensitive)", async ({ page }) => {
  await page.goto("/prijava");
  await fillLogin(page, E2E_EMAIL.toUpperCase(), E2E_PASSWORD);
  await expect(page).toHaveURL(/\/domov$/);
});

test("6. refresh keeps the session", async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/domov$/);
  await page.reload();
  await expect(page).toHaveURL(/\/domov$/);
  await expect(page.getByRole("button", { name: "Odpri meni" }).first()).toBeVisible();
});

test("7. garbage sparko_session cookie is treated as signed out", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "sparko_session", value: "garbage.value", url: baseURL! }]);
  await page.goto("/domov");
  await expect(page).toHaveURL(/\/prijava/);
  await expect(page.getByRole("button", { name: "Prijavi se" })).toBeVisible();
});

for (const path of ["/moj-katalog", "/letak", "/domov"]) {
  test(`8. deep link ${path} redirects to login and is honoured after sign-in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/prijava\?next=/);
    expect(new URL(page.url()).searchParams.get("next")).toBe(path);
    await fillLogin(page, E2E_LOGIN, E2E_PASSWORD);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  });
}

test("9. protected API and assets answer 401, brand assets stay public", async ({ request }: { request: APIRequestContext }) => {
  const chat = await request.post("/api/chat", { data: { messages: [{ role: "user", content: "pozdravljen" }] } });
  expect(chat.status()).toBe(401);
  const catalog = await request.get("/catalog/spar-1.webp");
  expect(catalog.status()).toBe(401);
  expect((await request.get("/products/anything.webp")).status()).toBe(401);
  expect((await request.get("/home/promo-cards.webp")).status()).toBe(401);
  expect((await request.get("/api/auth/session")).status()).toBe(200);
  const mascot = await request.get("/brand/sparko-mascot.webp");
  expect(mascot.status()).toBe(200);
});

test("10. logout returns to login; back and refresh do not expose the app", async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/domov$/);
  await logout(page);
  await page.goBack().catch(() => {});
  // Back lands on about:blank or /prijava (history was replaced); if the app page is restored it must bounce to login.
  await expect(page).not.toHaveURL(/\/(domov|letak|moj-katalog)$/);
  await expect(page.getByRole("button", { name: "Odpri meni" })).toHaveCount(0);
  await page.goto("/domov");
  await expect(page).toHaveURL(/\/prijava/);
  await page.reload();
  await expect(page).toHaveURL(/\/prijava/);
  await expect(page.getByRole("button", { name: "Odpri meni" })).toHaveCount(0);
});

test("11. local saved data survives logout and login", async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/domov$/);
  await page.evaluate(() => localStorage.setItem("sparko:e2e-marker", "kept"));
  const before = await page.evaluate(() => localStorage.getItem("sparko:v2"));
  await logout(page);
  expect(await page.evaluate(() => localStorage.getItem("sparko:e2e-marker"))).toBe("kept");
  await fillLogin(page, E2E_LOGIN, E2E_PASSWORD);
  await expect(page).toHaveURL(/\/domov$/);
  expect(await page.evaluate(() => localStorage.getItem("sparko:e2e-marker"))).toBe("kept");
  const after = await page.evaluate(() => localStorage.getItem("sparko:v2"));
  if (before !== null) expect(after).not.toBeNull();
});

test("12. password visibility toggle works", async ({ page }) => {
  await page.goto("/prijava");
  const pw = page.getByLabel("Geslo", { exact: true });
  await pw.fill("secret-value");
  await expect(pw).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Pokaži geslo" }).click();
  await expect(pw).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Skrij geslo" }).click();
  await expect(pw).toHaveAttribute("type", "password");
});

test("12b. registration link only shows an info message", async ({ page }) => {
  await page.goto("/prijava");
  await expect(page.getByText("Še nimate računa?")).toBeVisible();
  await page.getByRole("button", { name: "Registriraj se" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Registracija trenutno ni na voljo. Za dostop se obrnite na skrbnika.",
  );
  await expect(page).toHaveURL(/\/prijava$/);
});

for (const vp of [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 1440, height: 900 },
]) {
  test(`13. login layout ${vp.width}x${vp.height}: no horizontal overflow, submit reachable`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/prijava");
    await expect(page.getByRole("button", { name: "Prijavi se" })).toBeAttached();
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(m.sw).toBeLessThanOrEqual(m.iw);
    const submit = page.getByRole("button", { name: "Prijavi se" });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeVisible();
    await expect(submit).toBeInViewport();
    await page.screenshot({ path: `test-results/login-${vp.width}x${vp.height}.png` });
  });
}

test("14. JS bundles never contain credentials or secret variable names", async ({ page, request }) => {
  const chunkUrls = new Set<string>();
  const collect = (html: string) => {
    for (const m of html.matchAll(/\/_next\/static\/[^"'\s)\\]+?\.js/g)) chunkUrls.add(m[0]);
  };
  const loginHtml = await (await request.get("/prijava")).text();
  collect(loginHtml);
  await signIn(page);
  await expect(page).toHaveURL(/\/domov$/);
  collect(await page.content());
  const authedHtml = await (await page.request.get("/domov")).text();
  collect(authedHtml);
  // Chunks the browser actually loaded (incl. dynamic ones).
  const loaded = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name));
  for (const u of loaded) if (u.includes("/_next/static/") && u.endsWith(".js")) chunkUrls.add(new URL(u).pathname);
  expect(chunkUrls.size).toBeGreaterThan(2);

  const forbidden = [E2E_PASSWORD, E2E_SECRET, "SPARKO_AUTH_SECRET", "SPARKO_DEMO_PASSWORD_HASH"];
  for (const html of [loginHtml, authedHtml]) for (const f of forbidden) expect(html).not.toContain(f);
  for (const url of chunkUrls) {
    const body = await (await request.get(url)).text();
    for (const f of forbidden) expect(body, `${url} contains ${f}`).not.toContain(f);
  }
});
