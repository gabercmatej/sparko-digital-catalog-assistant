import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Runs in the Chromium project (390x844) and the WebKit iPhone project (390x664, iOS engine).
const data = JSON.parse(readFileSync("src/data/catalog.json", "utf8")) as { catalogs: { id: string; validFrom: string; validTo: string }[] };

const d = (iso: string) => {
  const [y, m, day] = iso.split("-").map(Number);
  return { y, m, day };
};
function period(from: string, to: string) {
  const a = d(from);
  const b = d(to);
  const end = `${b.day}. ${b.m}. ${b.y}`;
  return a.y === b.y ? `${a.day}. ${a.m}. – ${end}` : `${a.day}. ${a.m}. ${a.y} – ${end}`;
}

async function openHome(page: Page, vp?: { width: number; height: number }) {
  if (vp) await page.setViewportSize(vp);
  await page.goto("/domov");
  await expect(page.locator("[data-catalog-card]").first()).toBeVisible();
  await expect(page.locator("[data-catalog-cover] img").first()).toBeVisible();
}

async function checkHome(page: Page) {
  const vp = page.viewportSize()!;
  const box = async (sel: string, i = 0) => (await page.locator(sel).nth(i).boundingBox())!;
  const inside = (name: string, b: { x: number; y: number; width: number; height: number }) => {
    expect(b.x, `${name} left`).toBeGreaterThanOrEqual(-0.5);
    expect(b.y, `${name} top`).toBeGreaterThanOrEqual(-0.5);
    expect(b.x + b.width, `${name} right`).toBeLessThanOrEqual(vp.width + 0.5);
    expect(b.y + b.height, `${name} bottom`).toBeLessThanOrEqual(vp.height + 0.5);
  };
  const navBox = await box('nav[aria-label="Glavna navigacija"]');
  const cards = page.locator("[data-catalog-card]");
  await expect(cards).toHaveCount(2);

  const tab = await box('[role=tablist][aria-label="Prikaz"]');
  inside("tablist", tab);
  const c0 = await box("[data-catalog-card]", 0);
  const c1 = await box("[data-catalog-card]", 1);
  for (const [i, c] of [c0, c1].entries()) {
    inside(`card ${i}`, c);
    expect(c.height, `card ${i} height`).toBeGreaterThanOrEqual(140);
    const img = await box("[data-catalog-cover] img", i);
    inside(`cover ${i}`, img);
    expect(img.height, `cover ${i} height`).toBeGreaterThanOrEqual(90);
    expect(img.width, `cover ${i} width`).toBeGreaterThanOrEqual(60);
    expect(Math.abs(img.width / img.height - 720 / 977), `cover ${i} ratio`).toBeLessThan(0.03);
  }
  expect(c1.x, "cards side by side").toBeGreaterThan(c0.x + c0.width - 1);
  expect(Math.abs(c0.y - c1.y)).toBeLessThan(1);

  const mascot = await box('[data-home-zone="mascot"]');
  inside("mascot", mascot);
  expect(mascot.y - (c0.y + c0.height), "catalog-to-mascot gap").toBeLessThanOrEqual(24);
  expect(mascot.y - (c0.y + c0.height), "catalog-to-mascot gap").toBeGreaterThanOrEqual(0);
  inside("actions", await box('[data-home-zone="actions"]'));
  inside("rail section", await box('[data-home-zone="bottom"]'));
  const railCards = page.locator("[data-testid=home-rail] li");
  expect(await railCards.count()).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < 2; i++) {
    const r = await box("[data-testid=home-rail] li", i);
    inside(`rail card ${i}`, r);
    expect(r.y + r.height, `rail card ${i} above nav`).toBeLessThanOrEqual(navBox.y + 0.5);
  }
  inside("nav", navBox);

  // Card text from catalog data, per card.
  for (let i = 0; i < 2; i++) {
    const card = cards.nth(i);
    await expect(card).toContainText("Aktualni katalog");
    const dates = ((await card.locator("[data-catalog-dates]").textContent()) ?? "").replace(/\s+/g, " ").trim();
    expect(dates).toBe(period(data.catalogs[i].validFrom, data.catalogs[i].validTo));
    await expect(card.getByText("Odpri katalog", { exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("home zones are intact, inside the viewport, and catalog cards never collapse", async ({ page }) => {
  await openHome(page);
  await checkHome(page);
});

for (const [w, h] of [
  [360, 640],
  [375, 667],
  [430, 932],
] as const) {
  test(`home zones are intact @${w}x${h}`, async ({ page }) => {
    await openHome(page, { width: w, height: h });
    await checkHome(page);
  });
}
