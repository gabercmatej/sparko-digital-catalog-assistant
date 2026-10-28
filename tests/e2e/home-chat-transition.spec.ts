import { expect, test, type Page } from "@playwright/test";

// Home composer -> Chat handoff (replaces the old mascot + "Pogovor" button transition).
const homeInput = (page: Page) => page.locator("#home-chat-input");
const chatInput = (page: Page) => page.getByPlaceholder("Vprašaj Sparka o katalogu …");
const log = (page: Page) => page.getByRole("log", { name: "Pogovor s Sparkom" });
const msgs = (page: Page) => log(page).locator("[data-role]");
const lastReply = (page: Page) => log(page).locator('[data-role="assistant"]').last();
const nav = (page: Page) => page.getByRole("navigation", { name: "Glavna navigacija" });
const welcome = (page: Page) => page.getByRole("heading", { name: "Tvoj pomočnik Sparko" });
const storedConversations = (page: Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem("sparko:v2") ?? "{}").conversations ?? []).length as number);

async function freshHome(page: Page) {
  await page.goto("/domov");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/domov");
  await expect(homeInput(page)).toBeVisible();
  await page.waitForLoadState("networkidle"); // hydrated: before that Enter would be a native form submit
}

async function expectDefaultHome(page: Page) {
  await expect(page).toHaveURL(/\/domov$/);
  await expect(page.getByRole("tab", { name: "Katalogi" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-catalog-card]").first()).toBeVisible();
  await expect(homeInput(page)).toBeVisible();
}

test("Home composer hands the question to the Chat tab, which shows it and the answer", async ({ page }) => {
  await freshHome(page);
  await homeInput(page).fill("Koliko stane mleko?");
  await homeInput(page).press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await expect(chatInput(page)).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);
  await expect(msgs(page)).toHaveCount(2);
  await expect(log(page).locator('[data-role="user"]')).toContainText("Koliko stane mleko?");
  await expect(lastReply(page)).not.toContainText("Sparko piše", { timeout: 15_000 });
  expect(await storedConversations(page)).toBe(1);
});

test("an earlier chat is continued from Home (history stays, one conversation)", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await chatInput(page).fill("šampinjoni");
  await chatInput(page).press("Enter");
  await expect(lastReply(page)).not.toContainText("Sparko piše", { timeout: 15_000 });
  const before = await msgs(page).count();
  expect(before).toBeGreaterThan(0);

  // Bottom-nav Sparko reopens the existing conversation, as before.
  await nav(page).getByRole("link", { name: "Domov" }).click();
  await expectDefaultHome(page);
  await nav(page).getByRole("link", { name: "Sparko" }).click();
  await expect(msgs(page)).toHaveCount(before);

  // A Home question is appended to that same conversation.
  await nav(page).getByRole("link", { name: "Domov" }).click();
  await expectDefaultHome(page);
  await homeInput(page).fill("Nutella");
  await homeInput(page).press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await expect(msgs(page)).toHaveCount(before + 2);
  await expect(lastReply(page)).not.toContainText("Sparko piše", { timeout: 15_000 });
  expect(await storedConversations(page)).toBe(1);
  await expect(log(page).locator('[data-role="user"]').first()).toContainText("šampinjoni");

  await nav(page).getByRole("link", { name: "Domov" }).click();
  await expectDefaultHome(page);
});

test("browser back from the chat returns to a normal Home with an empty composer", async ({ page }) => {
  await freshHome(page);
  await homeInput(page).fill("Nutella");
  await homeInput(page).press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await expect(chatInput(page)).toBeVisible();
  await page.goBack();
  await expectDefaultHome(page);
  await expect(homeInput(page)).toHaveValue("");
});

test("rapid repeated Enter / taps send once, create one conversation and raise no errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let requests = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/chat") requests++;
  });
  await freshHome(page);
  await homeInput(page).fill("Nutella");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.locator("[data-home-composer] button").click({ force: true, noWaitAfter: true, timeout: 500 }).catch(() => {});
  await expect(chatInput(page)).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(lastReply(page)).not.toContainText("Sparko piše", { timeout: 15_000 });
  await expect(msgs(page)).toHaveCount(2);
  expect(await storedConversations(page)).toBe(1);
  expect(requests).toBe(1);
  await page.goBack();
  await expectDefaultHome(page);
  expect(errors).toEqual([]);
});

test("an empty Home composer stays on Home and creates nothing", async ({ page }) => {
  await freshHome(page);
  await homeInput(page).press("Enter");
  await page.waitForTimeout(300);
  await expectDefaultHome(page);
  expect(await storedConversations(page)).toBe(0);
});

test("reduced motion hands off without errors", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await freshHome(page);
  await homeInput(page).fill("Nutella");
  await homeInput(page).press("Enter");
  await expect(chatInput(page)).toBeVisible();
  await expect(log(page).locator('[data-role="user"]')).toContainText("Nutella");
  expect(errors).toEqual([]);
});
