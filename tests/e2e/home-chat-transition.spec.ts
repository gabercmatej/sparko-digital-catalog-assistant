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

test("a Home question always starts a NEW conversation; the earlier one stays in History and reopens intact", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await chatInput(page).fill("zaseka");
  await chatInput(page).press("Enter");
  await expect(lastReply(page)).not.toContainText("Sparko piše", { timeout: 15_000 });
  const before = await msgs(page).count();
  expect(before).toBeGreaterThan(0);

  // Bottom-nav Sparko reopens the existing conversation, as before.
  await nav(page).getByRole("link", { name: "Domov" }).click();
  await expectDefaultHome(page);
  await nav(page).getByRole("link", { name: "Sparko" }).click();
  await expect(msgs(page)).toHaveCount(before);

  // A Home question opens a fresh conversation with only that question and its answer.
  await nav(page).getByRole("link", { name: "Domov" }).click();
  await expectDefaultHome(page);
  await homeInput(page).fill("Koliko stane mleko?");
  await homeInput(page).press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await expect(msgs(page)).toHaveCount(2);
  await expect(log(page).locator('[data-role="user"]')).toHaveText(/Koliko stane mleko\?/);
  await expect(log(page)).not.toContainText("zaseka");
  await expect(lastReply(page)).not.toContainText("Sparko piše", { timeout: 15_000 });
  expect(await storedConversations(page)).toBe(2);

  // A follow-up typed in Chat continues the NEW conversation.
  await chatInput(page).fill("In jogurt?");
  await chatInput(page).press("Enter");
  await expect(msgs(page)).toHaveCount(4);
  await expect(lastReply(page)).not.toContainText("Sparko piše", { timeout: 15_000 });
  expect(await storedConversations(page)).toBe(2);

  // History (sidebar) lists both; the earlier one reopens with its own messages, also after a reload.
  await page.reload();
  await page.getByRole("button", { name: "Odpri meni" }).first().click();
  const history = page.getByRole("region", { name: "Tvoji pogovori" });
  await expect(history.getByRole("button")).toHaveCount(2);
  await history.getByRole("button", { name: /zaseka/ }).click();
  await expect(msgs(page)).toHaveCount(before);
  await expect(log(page)).toContainText("zaseka");
  await expect(log(page)).not.toContainText("Koliko stane mleko?");

  // Another Home question = a third conversation.
  await nav(page).getByRole("link", { name: "Domov" }).click();
  await expectDefaultHome(page);
  await homeInput(page).fill("zaseka");
  await homeInput(page).press("Enter");
  await expect(msgs(page)).toHaveCount(2);
  await expect(lastReply(page)).not.toContainText("Sparko piše", { timeout: 15_000 });
  expect(await storedConversations(page)).toBe(3);
});

test("browser back from the chat returns to a normal Home with an empty composer", async ({ page }) => {
  await freshHome(page);
  await homeInput(page).fill("zaseka");
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
  await homeInput(page).fill("zaseka");
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
  await homeInput(page).fill("zaseka");
  await homeInput(page).press("Enter");
  await expect(chatInput(page)).toBeVisible();
  await expect(log(page).locator('[data-role="user"]')).toContainText("zaseka");
  expect(errors).toEqual([]);
});
