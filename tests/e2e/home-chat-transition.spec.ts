import { expect, test, type Page } from "@playwright/test";

const ENTRY = (page: Page) => page.getByRole("button", { name: "Pogovor s Sparkom" });
const input = (page: Page) => page.getByPlaceholder("Vprašaj Sparka o katalogu …");
const lastReply = (page: Page) => page.getByRole("log", { name: "Pogovor s Sparkom" }).locator('[data-role="assistant"]').last();

async function freshHome(page: Page) {
  await page.goto("/domov");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/domov");
  await expect(ENTRY(page)).toBeVisible();
}

async function expectDefaultHome(page: Page) {
  await expect(page).toHaveURL(/\/domov$/);
  await expect(page.getByRole("tab", { name: "Katalogi" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-catalog-card]").first()).toBeVisible();
  await expect(page.locator("[data-home-root]")).not.toHaveAttribute("data-exiting", /.*/);
  await expect(ENTRY(page)).toBeVisible();
}

test("entry button opens the chat with an exit animation (top up, bottom down)", async ({ page }) => {
  await freshHome(page);
  const ty = (zone: string) =>
    page.locator(`[data-home-zone="${zone}"]`).evaluate((el) => {
      const m = getComputedStyle(el).transform;
      return m === "none" ? 0 : new DOMMatrix(m).m42;
    });
  await ENTRY(page).click();
  await expect(page.locator("[data-home-root]")).toHaveAttribute("data-exiting", /.*/);
  await page.waitForTimeout(220);
  expect(await ty("top")).toBeLessThan(0);
  expect(await ty("bottom")).toBeGreaterThan(0);
  await expect(page).toHaveURL(/\/$/);
  await expect(input(page)).toBeVisible();
});

const nav = (page: Page) => page.getByRole("navigation", { name: "Glavna navigacija" });
const log = (page: Page) => page.getByRole("log", { name: "Pogovor s Sparkom" }).locator("[data-role]");
const welcome = (page: Page) => page.getByRole("heading", { name: "Tvoj pomočnik Sparko" });
const storedConversations = (page: Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem("sparko:v2") ?? "{}").conversations ?? []).length as number);

test("Pogovor starts a new empty chat; earlier chats stay in the history; bottom-nav Sparko keeps the current chat", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await input(page).fill("šampinjoni");
  await input(page).press("Enter");
  await expect(lastReply(page)).not.toContainText("Sparko piše", { timeout: 15_000 });
  const before = await log(page).count();
  expect(before).toBeGreaterThan(0);

  // Bottom-nav Sparko reopens the existing conversation, as before.
  await nav(page).getByRole("link", { name: "Domov" }).click();
  await expectDefaultHome(page);
  await nav(page).getByRole("link", { name: "Sparko" }).click();
  await expect(input(page)).toBeVisible();
  await expect(log(page)).toHaveCount(before);

  // Home "Pogovor" always opens a fresh chat with the normal welcome and starters.
  await nav(page).getByRole("link", { name: "Domov" }).click();
  await expectDefaultHome(page);
  await ENTRY(page).click();
  await expect(input(page)).toBeVisible();
  await expect(welcome(page)).toBeVisible();
  await expect(log(page)).toHaveCount(0);
  expect(await storedConversations(page)).toBe(1);

  // The earlier conversation is still in the history and opens intact.
  await page.getByRole("button", { name: "Odpri meni" }).first().click();
  const history = page.getByRole("dialog", { name: "Meni" });
  await history.getByRole("button", { name: /šampinjoni/i }).click();
  await expect(log(page)).toHaveCount(before);

  await nav(page).getByRole("link", { name: "Domov" }).click();
  await expectDefaultHome(page);
});

test("browser back from chat returns to a normal Home", async ({ page }) => {
  await freshHome(page);
  await ENTRY(page).click();
  await expect(input(page)).toBeVisible();
  await page.goBack();
  await expectDefaultHome(page);
});

test("rapid repeated clicks navigate once without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await freshHome(page);
  const btn = ENTRY(page);
  await btn.click();
  await btn.click({ force: true, noWaitAfter: true, timeout: 500 }).catch(() => {});
  await btn.click({ force: true, noWaitAfter: true, timeout: 500 }).catch(() => {});
  await expect(input(page)).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(welcome(page)).toBeVisible();
  // Exactly one new conversation: the first message creates it, and nothing else was stored.
  expect(await storedConversations(page)).toBe(0);
  await input(page).fill("Nutella");
  await input(page).press("Enter");
  await expect(lastReply(page)).not.toContainText("Sparko piše", { timeout: 15_000 });
  expect(await storedConversations(page)).toBe(1);
  await page.goBack();
  await expectDefaultHome(page);
  expect(errors).toEqual([]);
});

test("reduced motion navigates without translating zones", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await freshHome(page);
  let maxShift = 0;
  await page.exposeFunction("__report", (v: number) => (maxShift = Math.max(maxShift, Math.abs(v))));
  await page.evaluate(() => {
    const top = document.querySelector('[data-home-zone="top"]');
    const tick = () => {
      if (top) {
        const m = getComputedStyle(top).transform;
        (window as unknown as { __report: (v: number) => void }).__report(m === "none" ? 0 : new DOMMatrix(m).m42);
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
  await ENTRY(page).click();
  await expect(input(page)).toBeVisible();
  expect(maxShift).toBe(0);
});
