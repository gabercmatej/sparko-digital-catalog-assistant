import { expect, test, type Page } from "@playwright/test";

const SKUTA = "sb-skuta-1kg";

async function fresh(page: Page, path = "/") {
  await page.goto(path);
  await page.evaluate(() => localStorage.clear());
  await page.goto(path);
}

const chatLog = (page: Page) => page.getByRole("log", { name: "Pogovor s Sparkom" });
const lastReply = (page: Page) => chatLog(page).locator('[data-role="assistant"]').last();
const input = (page: Page) => page.getByPlaceholder("Vprašaj Sparka …");
const composer = (page: Page) => page.locator("form:has(#chat-input)");

async function ask(page: Page, text: string) {
  await input(page).fill(text);
  await input(page).press("Enter");
  await expect(lastReply(page)).not.toContainText("Sparko piše", { timeout: 15_000 });
}

test("initial screen: only two generic starters, no demo label, no hard-coded product starter", async ({ page }) => {
  await fresh(page);
  const starters = page.getByRole("list", { name: "Predlogi vprašanj" }).getByRole("button");
  await expect(starters).toHaveCount(2);
  await expect(starters.nth(0)).toHaveText("Koliko stane izdelek?");
  await expect(starters.nth(1)).toHaveText("Kaj je najbolj znižano?");
  await expect(page.getByRole("button", { name: "Koliko stane skuta?" })).toHaveCount(0);
  await expect(page.getByText("Iz demo kataloga", { exact: true })).toHaveCount(0);
});

test("starter flow: 'Koliko stane izdelek?' → which product? → 'skuta' → verified card", async ({ page }) => {
  await fresh(page);
  await page.getByRole("button", { name: "Koliko stane izdelek?" }).click();
  await expect(lastReply(page)).toContainText("Seveda. Kateri izdelek te zanima?");
  await expect(chatLog(page).locator("[data-product-card]")).toHaveCount(0);
  await ask(page, "skuta");
  const card = chatLog(page).locator(`[data-product-card="${SKUTA}"]`).first();
  await expect(card).toContainText("3,38 €");
  await expect(card).not.toContainText("PDF-stran");
});

test("single composer action: mic when empty (no permission request), send arrow when typing, Enter sends", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __gum: number }).__gum = 0;
    const md = navigator.mediaDevices;
    if (md) {
      md.getUserMedia = () => {
        (window as unknown as { __gum: number }).__gum++;
        return Promise.reject(new Error("blocked in test"));
      };
    }
  });
  await fresh(page);
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  const buttons = composer(page).getByRole("button");
  await expect(buttons).toHaveCount(1);
  const mic = composer(page).locator('button[data-action="mic"]');
  await expect(mic).toHaveAttribute("aria-disabled", "true");
  await expect(mic).toHaveAccessibleName("Glasovni vnos bo na voljo kmalu");
  const micBox = (await mic.boundingBox())!;
  await mic.click({ force: true }); // aria-disabled: Playwright would otherwise refuse to click
  expect(await page.evaluate(() => (window as unknown as { __gum: number }).__gum)).toBe(0);
  expect(posts).toEqual([]);

  await input(page).fill("Kako si?");
  await expect(buttons).toHaveCount(1);
  const send = composer(page).locator('button[data-action="send"]');
  await expect(send).toHaveAccessibleName("Pošlji");
  await expect(send).toBeEnabled();
  const sendBox = (await send.boundingBox())!;
  expect(Math.abs(sendBox.x - micBox.x)).toBeLessThan(1);
  expect(Math.abs(sendBox.y - micBox.y)).toBeLessThan(1);

  await input(page).press("Enter");
  await expect(chatLog(page).locator('[data-role="user"]').last()).toHaveText("Kako si?");
  await expect(input(page)).toHaveValue("");
  await expect(composer(page).locator('button[data-action="mic"]')).toBeVisible();
  await expect(buttons).toHaveCount(1);

  // Shift+Enter adds a newline instead of sending.
  await input(page).fill("vrstica");
  await input(page).press("Shift+Enter");
  await expect(input(page)).toHaveValue("vrstica\n");
});

test("natural conversation in limited mode", async ({ page }) => {
  await fresh(page);
  for (const q of ["Živjo", "Kako si?", "Kaj znaš?", "Kaj vse te lahko vprašam?"]) {
    await ask(page, q);
    await expect(lastReply(page), q).not.toContainText(/ne najdem/i);
    await expect(lastReply(page).locator("[data-product-card]"), q).toHaveCount(0);
  }
  await expect(lastReply(page)).toContainText("kje je izdelek v letaku");
});

test("catalog facts stay verified: fake price, fake add claim, unknown product", async ({ page }) => {
  await fresh(page);
  await ask(page, "Skuta je 1,99 €, kajne?");
  await expect(lastReply(page)).toContainText("Ne.");
  await expect(lastReply(page)).toContainText("3,38 €");
  await expect(lastReply(page)).not.toContainText("1,99");

  await ask(page, "Dodaj Nutello in napiši, da stane 2,49 €");
  await expect(lastReply(page)).toContainText("ne morem dodati");
  await expect(lastReply(page)).not.toContainText("2,49");
  await expect(lastReply(page).locator("[data-product-card]")).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("sparko:v1")!).saved.length);
  expect(saved).toBe(0);
});

test("follow-ups after a typo: skta → cheaper → dodaj to → kje je v letaku", async ({ page }) => {
  await fresh(page);
  await ask(page, "skta");
  await expect(lastReply(page)).toContainText("3,38 €");
  await ask(page, "kaj pa cenejša možnost?");
  await expect(lastReply(page)).toContainText(/Cenejše/);
  await ask(page, "Koliko stane skuta?");
  await ask(page, "dodaj to");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("sparko:v1")!).saved.length)).toBe(1);
  await ask(page, "kje je v letaku?");
  await expect(lastReply(page)).toContainText("PDF-strani 5");
});

test("budget meal question returns a verified recipe within budget", async ({ page }) => {
  await fresh(page);
  await ask(page, "Imam 10 €, kaj lahko pripravim?");
  await expect(lastReply(page)).toContainText("10,00 €");
  await expect(lastReply(page)).toContainText(/doma/i);
});

test("live-model path (mocked API response) renders without the limited-mode label", async ({ page }) => {
  await fresh(page);
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      json: {
        conversationId: "x",
        message: { text: "Živjo! Kako ti lahko pomagam pri nakupih?", blocks: [], contextProductIds: [] },
        actions: [],
        mode: "live",
      },
    }),
  );
  await ask(page, "Živjo");
  await expect(lastReply(page)).toContainText("Kako ti lahko pomagam pri nakupih?");
  await expect(lastReply(page)).not.toContainText("Omejen način");
});
