import { expect, test, type Page } from "@playwright/test";
import { leaflets } from "./leaflets-data";

// Runs in the Chromium project (390x844) and the WebKit iPhone project (390x664, iOS engine).

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
  await expect(cards).toHaveCount(6);

  const tab = await box('[role=tablist][aria-label="Prikaz"]');
  inside("tablist", tab);
  const c0 = await box("[data-catalog-card]", 0);
  const c1 = await box("[data-catalog-card]", 1);
  const car = await box("[data-testid=catalog-carousel]");
  // Vertical control rail on the far right of the top zone, vertically centred on the cards, compact.
  await expect(page.getByRole("tablist", { name: "Prikaz" })).toHaveAttribute("aria-orientation", "vertical");
  expect(tab.x, "rail right of the carousel").toBeGreaterThanOrEqual(car.x + car.width - 0.5);
  // Nudged ~6px into the right gutter, but never clipped (`inside` above).
  expect(vp.width - (tab.x + tab.width), "rail at the right edge (part of the gutter)").toBeLessThanOrEqual(20);
  expect(tab.width, "rail is slim (layout width)").toBeLessThanOrEqual(30);
  // ~50% taller than the former 94px rail, from taller options (icons stay 18px).
  expect(tab.height, "tall rail").toBeGreaterThanOrEqual(135);
  expect(tab.height, "options stacked").toBeGreaterThan(tab.width);
  expect(Math.abs(tab.y + tab.height / 2 - (car.y + car.height / 2)), "rail vertically centred").toBeLessThan(3);
  const [kat, izd] = [await box("[role=tab]", 0), await box("[role=tab]", 1)];
  expect(izd.y, "Izdelki below Katalogi").toBeGreaterThanOrEqual(kat.y + kat.height - 0.5);
  for (const t of [kat, izd]) expect(t.height, "touch target").toBeGreaterThanOrEqual(64);
  expect(Math.abs(kat.height - izd.height), "even options").toBeLessThan(0.5);
  // The slim tabs keep a ~44px-wide hit area (invisible ::after into the gap and the gutter).
  const hits = await page.evaluate(() =>
    [...document.querySelectorAll("[role=tab]")].map((t) => {
      const r = t.getBoundingClientRect();
      const y = r.top + r.height / 2;
      const at = (x: number) => document.elementFromPoint(x, y)?.closest("[role=tab]") === t;
      return at(r.left + r.width / 2 - 21) && at(r.left + r.width / 2 + 21);
    }),
  );
  expect(hits, "44px-wide tab hit areas").toEqual([true, true]);
  // Icon-only tabs: no visible text, names come from aria-label.
  for (const name of ["Katalogi", "Izdelki"]) {
    const t = page.getByRole("tab", { name });
    await expect(t).toHaveText("");
    await expect(t.locator("svg")).toHaveCount(1);
  }
  // The top zone starts right under the app header (no horizontal toggle above it any more).
  const headerBottom = await page.evaluate(() => document.querySelector("header")!.getBoundingClientRect().bottom);
  // Leftover height is shared between the zone gaps and centring (the composer is shorter than the old mascot row, so a bit more).
  expect(c0.y - headerBottom, "catalog close to the header").toBeLessThanOrEqual(56);
  // First card whole; the second one is deliberately cut off at the right edge of the track.
  inside("card 0", c0);
  expect(c1.x + c1.width, "second card runs past the track edge").toBeGreaterThan(car.x + car.width + 2);
  expect(c1.x, "second card starts inside the track").toBeLessThan(car.x + car.width - 20);
  for (const [i, c] of [c0, c1].entries()) {
    expect(c.height, `card ${i} height`).toBeGreaterThanOrEqual(140);
    const img = await box("[data-catalog-cover] img", i);
    if (i === 0) inside(`cover ${i}`, img);
    expect(img.height, `cover ${i} height`).toBeGreaterThanOrEqual(75);
    expect(img.width, `cover ${i} width`).toBeGreaterThanOrEqual(55);
    expect(Math.abs(img.width / img.height - 720 / 977), `cover ${i} ratio`).toBeLessThan(0.03);
  }
  expect(c1.x, "cards side by side").toBeGreaterThan(c0.x + c0.width - 1);
  expect(Math.abs(c0.y - c1.y)).toBeLessThan(1);

  const composer = await box('[data-home-zone="composer"]');
  inside("composer", composer);
  // Responsive breathing room between the zones: never crowded, never a large empty band.
  expect(composer.y - (car.y + car.height), "catalog-to-composer gap").toBeLessThanOrEqual(80);
  expect(composer.y - (car.y + car.height), "catalog-to-composer gap").toBeGreaterThanOrEqual(12);
  // Compact top zone on phones: the catalog cards take at most ~42% of the space between header and nav.
  expect(car.height, "catalog section height").toBeLessThanOrEqual((navBox.y - headerBottom) * 0.42);
  const actionsBox = await box('[data-home-zone="actions"]');
  const railBox = await box('[data-home-zone="bottom"]');
  expect(railBox.y - (actionsBox.y + actionsBox.height), "actions-to-products gap").toBeGreaterThanOrEqual(12);
  expect(railBox.y - (actionsBox.y + actionsBox.height), "actions-to-products gap").toBeLessThanOrEqual(80);
  // Balanced: the two zone gaps match.
  expect(Math.abs(railBox.y - (actionsBox.y + actionsBox.height) - (composer.y - (car.y + car.height))), "balanced gaps").toBeLessThan(2);
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

  // Card text from leaflet data, per card (all six; lazy covers load as the track scrolls).
  for (let i = 0; i < 6; i++) {
    const card = cards.nth(i);
    await card.scrollIntoViewIfNeeded();
    const rec = leaflets[i];
    const dates = ((await card.locator("[data-catalog-dates]").textContent()) ?? "").replace(/\s+/g, " ").trim();
    expect(dates).toBe(period(rec.validFrom, rec.validTo));
    await expect(card.getByText("Odpri katalog", { exact: true })).toBeVisible();

    // Layout: [label] / [title under it, one line] / centred cover / one-line dates / CTA.
    const g = await card.evaluate((el) => {
      const r = (q: string) => el.querySelector(q)!.getBoundingClientRect();
      const labelEl = el.querySelector("[role=img][data-category]")!;
      const label = labelEl.getBoundingClientRect();
      const titleEl = labelEl.parentElement!.nextElementSibling as HTMLElement;
      const head = titleEl.getBoundingClientRect();
      const datesEl = el.querySelector("[data-catalog-dates]") as HTMLElement;
      const cs = getComputedStyle(datesEl);
      return {
        card: el.getBoundingClientRect().toJSON(),
        label: label.toJSON(),
        title: head.toJSON(),
        titleOneLine: head.height <= parseFloat(getComputedStyle(titleEl).fontSize) * 1.6,
        cover: r("[data-catalog-cover] img").toJSON(),
        dates: r("[data-catalog-dates]").toJSON(),
        datesOneLine: datesEl.scrollWidth <= datesEl.clientWidth + 1 && datesEl.getBoundingClientRect().height <= parseFloat(cs.fontSize) * 1.6,
        cta: Array.from(el.querySelectorAll("span")).find((s) => s.textContent?.trim() === "Odpri katalog")!.getBoundingClientRect().toJSON(),
      };
    });
    expect(g.label.x - g.card.x, `card ${i} label left`).toBeLessThan(16);
    expect(g.label.y - g.card.y, `card ${i} label top`).toBeLessThan(20);
    expect(g.title.y, `card ${i} title under label`).toBeGreaterThanOrEqual(g.label.bottom - 0.5);
    expect(Math.abs(g.title.x - g.label.x), `card ${i} title left-aligned with label`).toBeLessThan(4);
    expect(g.titleOneLine, `card ${i} title on one line`).toBe(true);
    expect(g.title.right, `card ${i} title inside`).toBeLessThanOrEqual(g.card.right + 0.5);
    expect(g.cover.y, `card ${i} cover below header`).toBeGreaterThanOrEqual(g.title.bottom - 3);
    expect(Math.abs(g.cover.x + g.cover.width / 2 - (g.card.x + g.card.width / 2)), `card ${i} cover centred`).toBeLessThan(4);
    expect(g.dates.y, `card ${i} dates below cover`).toBeGreaterThanOrEqual(g.cover.bottom - 3);
    expect(g.datesOneLine, `card ${i} dates on one line`).toBe(true);
    expect(g.cta.y, `card ${i} CTA below dates`).toBeGreaterThanOrEqual(g.dates.bottom - 0.5);
  }
  await page.locator("[data-testid=catalog-carousel] ul").evaluate((el) => el.scrollTo({ left: 0, behavior: "instant" }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // The mascot and the "Pogovor" pill are gone; the composer is one full-width line in the middle zone.
  await expect(page.locator("[data-chat-entry]")).toHaveCount(0);
  await expect(page.locator('[data-home-zone="mascot"]')).toHaveCount(0);
  const comp = await box("[data-home-composer]");
  expect(Math.abs(comp.width - actionsBox.width), "composer as wide as the actions").toBeLessThan(1);
  expect(Math.abs(comp.x - actionsBox.x)).toBeLessThan(1);
  expect(comp.y + comp.height, "composer above the actions").toBeLessThanOrEqual(actionsBox.y + 0.5);

  // Izdelki: same top-zone height (nothing below moves), exactly two complete list rows, the rest scrolls inside.
  const before = { composer, rail: railBox };
  await page.getByRole("tab", { name: "Izdelki" }).click();
  const panel = await box("[role=tabpanel]");
  expect(Math.abs(panel.height - car.height), "same top height in both modes").toBeLessThan(1);
  const after = { composer: await box('[data-home-zone="composer"]'), rail: await box('[data-home-zone="bottom"]') };
  expect(Math.abs(after.composer.y - before.composer.y), "composer does not jump").toBeLessThan(1);
  expect(Math.abs(after.rail.y - before.rail.y), "products rail does not jump").toBeLessThan(1);
  const list = await page.getByTestId("home-list").evaluate((el) => {
    const l = el.getBoundingClientRect();
    const rows = [...el.querySelectorAll("[data-home-row]")].map((r) => r.getBoundingClientRect());
    return { scrolls: el.scrollHeight > el.clientHeight + 10, visible: rows.filter((r) => r.top < l.bottom - 0.5 && r.bottom > l.top + 0.5).map((r) => ({ top: r.top - l.top, bottom: r.bottom - l.top })), h: l.height };
  });
  expect(list.visible.length, "exactly two rows visible").toBe(2);
  for (const r of list.visible) {
    expect(r.top, "row fully visible").toBeGreaterThanOrEqual(-0.5);
    expect(r.bottom, "row fully visible").toBeLessThanOrEqual(list.h + 0.5);
  }
  expect(list.scrolls, "more products scroll inside the list").toBe(true);
}

test("home zones are intact, inside the viewport, and catalog cards never collapse", async ({ page }) => {
  await openHome(page);
  await checkHome(page);
});

for (const [w, h] of [
  [360, 640],
  [375, 667],
  [390, 844],
  [430, 932],
] as const) {
  test(`home zones are intact @${w}x${h}`, async ({ page }) => {
    await openHome(page, { width: w, height: h });
    await checkHome(page);
  });
}
