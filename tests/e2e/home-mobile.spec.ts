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
  // Vertical control rail on the far right of the top zone, vertically centred on the cards, compact.
  await expect(page.getByRole("tablist", { name: "Prikaz" })).toHaveAttribute("aria-orientation", "vertical");
  expect(tab.x, "rail right of the cards").toBeGreaterThanOrEqual(c1.x + c1.width - 0.5);
  expect(vp.width - (tab.x + tab.width), "rail at the right edge (gutter only)").toBeLessThanOrEqual(26);
  expect(tab.width, "rail is narrow").toBeLessThanOrEqual(56);
  expect(tab.height, "options stacked").toBeGreaterThan(tab.width);
  expect(Math.abs(tab.y + tab.height / 2 - (c0.y + c0.height / 2)), "rail vertically centred").toBeLessThan(3);
  const [kat, izd] = [await box("[role=tab]", 0), await box("[role=tab]", 1)];
  expect(izd.y, "Izdelki below Katalogi").toBeGreaterThanOrEqual(kat.y + kat.height - 0.5);
  for (const t of [kat, izd]) expect(t.height, "touch target").toBeGreaterThanOrEqual(44);
  // The top zone starts right under the app header (no horizontal toggle above it any more).
  const headerBottom = await page.evaluate(() => document.querySelector("header")!.getBoundingClientRect().bottom);
  expect(c0.y - headerBottom, "catalog close to the header").toBeLessThanOrEqual(36);
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
  // Responsive breathing room between the zones: never crowded, never a large empty band.
  expect(mascot.y - (c0.y + c0.height), "catalog-to-mascot gap").toBeLessThanOrEqual(52);
  expect(mascot.y - (c0.y + c0.height), "catalog-to-mascot gap").toBeGreaterThanOrEqual(6);
  const actionsBox = await box('[data-home-zone="actions"]');
  const railBox = await box('[data-home-zone="bottom"]');
  expect(railBox.y - (actionsBox.y + actionsBox.height), "actions-to-products gap").toBeGreaterThanOrEqual(6);
  expect(railBox.y - (actionsBox.y + actionsBox.height), "actions-to-products gap").toBeLessThanOrEqual(52);
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

    // Layout: [label  Aktualni katalog] (narrow phone cards: label, then the title on one line under it) /
    // centred cover / one-line dates / CTA.
    const g = await card.evaluate((el) => {
      const r = (q: string) => el.querySelector(q)!.getBoundingClientRect();
      const label = r("[data-retailer]");
      const head = el.querySelector("[data-retailer]")!.parentElement!.nextElementSibling!.getBoundingClientRect();
      const datesEl = el.querySelector("[data-catalog-dates]") as HTMLElement;
      const cs = getComputedStyle(datesEl);
      return {
        card: el.getBoundingClientRect().toJSON(),
        label: label.toJSON(),
        title: head.toJSON(),
        titleOneLine: head.height <= parseFloat(getComputedStyle(el.querySelector("[data-retailer]")!.parentElement!.nextElementSibling!).fontSize) * 1.6,
        cover: r("[data-catalog-cover] img").toJSON(),
        dates: r("[data-catalog-dates]").toJSON(),
        datesOneLine: datesEl.scrollWidth <= datesEl.clientWidth + 1 && datesEl.getBoundingClientRect().height <= parseFloat(cs.fontSize) * 1.6,
        cta: Array.from(el.querySelectorAll("span")).find((s) => s.textContent?.trim() === "Odpri katalog")!.getBoundingClientRect().toJSON(),
      };
    });
    expect(g.label.x - g.card.x, `card ${i} label left`).toBeLessThan(16);
    expect(g.label.y - g.card.y, `card ${i} label top`).toBeLessThan(20);
    if (g.card.width <= 150) {
      expect(g.title.y, `card ${i} title under label`).toBeGreaterThanOrEqual(g.label.bottom - 0.5);
      expect(Math.abs(g.title.x - g.label.x), `card ${i} title left-aligned with label`).toBeLessThan(4);
      expect(g.titleOneLine, `card ${i} title on one line`).toBe(true);
    } else {
      expect(g.title.x, `card ${i} title right of label`).toBeGreaterThanOrEqual(g.label.right - 0.5);
      expect(Math.abs(g.title.y + g.title.height / 2 - (g.label.y + g.label.height / 2)), `card ${i} header aligned`).toBeLessThan(3);
    }
    expect(g.title.right, `card ${i} title inside`).toBeLessThanOrEqual(g.card.right + 0.5);
    expect(g.cover.y, `card ${i} cover below header`).toBeGreaterThanOrEqual(g.title.bottom - 3);
    expect(Math.abs(g.cover.x + g.cover.width / 2 - (g.card.x + g.card.width / 2)), `card ${i} cover centred`).toBeLessThan(4);
    expect(g.dates.y, `card ${i} dates below cover`).toBeGreaterThanOrEqual(g.cover.bottom - 3);
    expect(g.datesOneLine, `card ${i} dates on one line`).toBe(true);
    expect(g.cta.y, `card ${i} CTA below dates`).toBeGreaterThanOrEqual(g.dates.bottom - 0.5);
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
