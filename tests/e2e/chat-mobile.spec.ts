import { expect, test, type Page } from "@playwright/test";

type Box = { x: number; y: number; width: number; height: number };

async function openChat(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await page.locator("#welcome-title").waitFor();
}

async function box(page: Page, selector: string, nth = 0): Promise<Box> {
  const b = await page.locator(selector).nth(nth).boundingBox();
  expect(b, `${selector} has a box`).not.toBeNull();
  return b!;
}

function inViewport(b: Box, vp: { width: number; height: number }) {
  return b.x >= -0.5 && b.y >= -0.5 && b.x + b.width <= vp.width + 0.5 && b.y + b.height <= vp.height + 0.5;
}

async function expectWelcomeFits(page: Page) {
  const vp = page.viewportSize()!;
  const mascot = await box(page, 'img[alt^="Sparko, nakupovalna"]');
  expect(mascot.height).toBeGreaterThanOrEqual(48);
  expect(inViewport(mascot, vp), "mascot in viewport").toBe(true);

  const title = await box(page, "#welcome-title");
  const sub = await box(page, "#welcome-title ~ p");
  expect(inViewport(title, vp), "title in viewport").toBe(true);
  expect(inViewport(sub, vp), "subtitle in viewport").toBe(true);

  const starters = page.getByRole("list", { name: "Predlogi vprašanj" }).getByRole("button");
  await expect(starters).toHaveCount(4);
  let lastBottom = 0;
  let firstTop = Infinity;
  for (let i = 0; i < 4; i++) {
    const b = (await starters.nth(i).boundingBox())!;
    expect(inViewport(b, vp), `starter ${i} in viewport`).toBe(true);
    lastBottom = Math.max(lastBottom, b.y + b.height);
    firstTop = Math.min(firstTop, b.y);
  }
  expect(title.y + title.height).toBeLessThanOrEqual(firstTop + 0.5);

  const input = (await page.locator("#chat-input").boundingBox())!;
  expect(inViewport(input, vp), "composer in viewport").toBe(true);
  expect(lastBottom).toBeLessThanOrEqual(input.y + 0.5);

  const nav = (await page.getByRole("navigation", { name: "Glavna navigacija" }).boundingBox())!;
  expect(inViewport(nav, vp), "nav in viewport").toBe(true);
  expect(input.y + input.height).toBeLessThanOrEqual(nav.y + 0.5);

  // Carousel: >= 2 mini cards fully visible horizontally, above the mascot.
  const cards = page.locator("[data-mini-card]");
  let visible = 0;
  for (let i = 0; i < (await cards.count()); i++) {
    const b = (await cards.nth(i).boundingBox())!;
    if (b.x >= -0.5 && b.x + b.width <= vp.width + 0.5) {
      visible++;
      expect(b.y + b.height).toBeLessThanOrEqual(mascot.y + 0.5);
    }
  }
  expect(visible).toBeGreaterThanOrEqual(2);
}

test.describe("chat welcome on phones", () => {
  test("everything is visible together at the project viewport", async ({ page }) => {
    await openChat(page);
    await expectWelcomeFits(page);
  });

  for (const [w, h] of [
    [360, 640],
    [375, 667],
    [430, 932],
  ]) {
    test(`everything is visible together at ${w}x${h}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await openChat(page);
      await expectWelcomeFits(page);
    });
  }

  test("sending a starter renders the conversation and keeps the composer reachable", async ({ page }) => {
    await openChat(page);
    const vp = page.viewportSize()!;
    await page.getByRole("list", { name: "Predlogi vprašanj" }).getByRole("button").first().click();
    await expect(page.getByRole("log", { name: "Pogovor s Sparkom" })).toBeVisible();
    await expect(page.locator('[data-role="user"]').first()).toBeVisible();
    const input = (await page.locator("#chat-input").boundingBox())!;
    expect(inViewport(input, vp)).toBe(true);
  });
});
