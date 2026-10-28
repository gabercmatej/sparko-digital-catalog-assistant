import { expect, test, type Page } from "@playwright/test";

// Layout of the V3 Home (carousel + composer). Runs in the Chromium project (390x844) and the WebKit iPhone project.

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const panelH = async (page: Page) => (await page.getByRole("tabpanel").boundingBox())!.height;

async function openHome(page: Page, vp?: { width: number; height: number }) {
  if (vp) await page.setViewportSize(vp);
  await page.goto("/domov");
  await expect(page.locator("[data-catalog-card]").first()).toBeVisible();
  await expect(page.locator("[data-catalog-cover] img").first()).toBeVisible();
}

test("the second card is only partly visible; no horizontal page overflow", async ({ page }) => {
  await openHome(page, { width: 390, height: page.viewportSize()!.height });
  const g = await page.evaluate(() => {
    const track = document.querySelector("[data-testid=catalog-carousel] ul")!.getBoundingClientRect();
    const [a, b] = [...document.querySelectorAll("[data-catalog-card]")].map((c) => c.getBoundingClientRect());
    return { tr: track.right, tl: track.left, a: a.toJSON(), b: b.toJSON() };
  });
  expect(g.a.left, "first card starts at the left of the track").toBeGreaterThanOrEqual(g.tl - 1);
  expect(g.a.right, "first card fully visible").toBeLessThanOrEqual(g.tr + 0.5);
  expect(g.b.left, "second card starts inside the track").toBeLessThan(g.tr - 20);
  expect(g.b.right, "second card is cut off by the track edge").toBeGreaterThan(g.tr + 4);
  expect(await noOverflow(page)).toBe(true);
});

test("composer sits between the carousel and the actions, full width of the column, and is usable", async ({ page }) => {
  await openHome(page);
  const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
  const top = await box('[data-home-zone="top"]');
  const comp = await box("[data-home-composer]");
  const actions = await box('[data-home-zone="actions"]');
  expect(comp.y).toBeGreaterThanOrEqual(top.y + top.height - 0.5);
  expect(actions.y).toBeGreaterThanOrEqual(comp.y + comp.height - 0.5);
  expect(Math.abs(comp.x - actions.x)).toBeLessThan(1);
  expect(Math.abs(comp.width - actions.width)).toBeLessThan(1);
  await expect(page.locator("#home-chat-input")).toBeVisible();
  await expect(page.locator("[data-chat-entry]")).toHaveCount(0);
  await expect(page.locator('[data-home-zone="mascot"]')).toHaveCount(0);
  expect(await noOverflow(page)).toBe(true);
});

test("the top zone keeps its height between Katalogi and Izdelki and nothing below moves", async ({ page }) => {
  await openHome(page);
  const y = async (zone: string) => (await page.locator(`[data-home-zone="${zone}"]`).first().boundingBox())!.y;
  const base = { h: await panelH(page), composer: await y("composer"), actions: await y("actions"), bottom: await y("bottom") };
  await page.getByRole("tab", { name: "Izdelki" }).click();
  await expect(page.getByTestId("home-list")).toBeVisible();
  expect(Math.abs((await panelH(page)) - base.h)).toBeLessThan(1);
  expect(Math.abs((await y("composer")) - base.composer)).toBeLessThanOrEqual(1);
  expect(Math.abs((await y("actions")) - base.actions)).toBeLessThanOrEqual(1);
  expect(Math.abs((await y("bottom")) - base.bottom)).toBeLessThanOrEqual(1);
  await page.getByRole("tab", { name: "Katalogi" }).click();
  await expect(page.locator("[data-catalog-card]").first()).toBeVisible();
  expect(Math.abs((await panelH(page)) - base.h)).toBeLessThan(1);
});

for (const [w, h] of [
  [320, 568],
  [360, 640],
  [375, 667],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1280, 800],
  [1440, 900],
] as const) {
  test(`responsive Home @${w}x${h}: no overflow, six cards, composer full width, constant top height`, async ({ page }) => {
    await openHome(page, { width: w, height: h });
    expect(await noOverflow(page), "no horizontal overflow (Katalogi)").toBe(true);
    await expect(page.locator("[data-catalog-card]")).toHaveCount(6);
    const comp = page.locator("[data-home-composer]");
    await expect(comp).toBeVisible();
    await expect(page.locator("#home-chat-input")).toBeVisible();
    const cb = (await comp.boundingBox())!;
    const ab = (await page.locator('[data-home-zone="actions"]').boundingBox())!;
    expect(Math.abs(cb.width - ab.width), "composer as wide as the column").toBeLessThan(1);
    expect(cb.x).toBeGreaterThanOrEqual(-0.5);
    expect(cb.x + cb.width).toBeLessThanOrEqual(w + 0.5);
    const katalogiH = await panelH(page);
    await page.getByRole("tab", { name: "Izdelki" }).click();
    await expect(page.getByTestId("home-list")).toBeVisible();
    expect(Math.abs((await panelH(page)) - katalogiH), "top zone height constant").toBeLessThan(1);
    expect(await noOverflow(page), "no horizontal overflow (Izdelki)").toBe(true);
    await page.getByRole("tab", { name: "Katalogi" }).click();
    await expect(page.locator("[data-catalog-card]")).toHaveCount(6);
    expect(Math.abs((await panelH(page)) - katalogiH)).toBeLessThan(1);
  });
}

test("the Home composer hands a question to the Chat tab (iOS engine too)", async ({ page }) => {
  await page.goto("/domov");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/domov");
  await page.waitForLoadState("networkidle"); // hydrated: before that Enter would be a native form submit
  await page.locator("#home-chat-input").fill("Koliko stane mleko?");
  await page.locator("#home-chat-input").press("Enter");
  await expect(page).toHaveURL(/\/$/);
  const log = page.getByRole("log", { name: "Pogovor s Sparkom" });
  await expect(log.locator('[data-role="user"]')).toHaveCount(1);
  await expect(log.locator('[data-role="assistant"]').last()).not.toContainText("Sparko piše", { timeout: 15_000 });
});
