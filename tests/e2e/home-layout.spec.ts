import { expect, test, type Page } from "@playwright/test";

const ACTIONS = ["Kaj je najbolj znižano", "Poglej izdelke po kategoriji", "Kaj je novega v katalogu", "Kje je najbližji SPAR"];

const tablist = (page: Page) => page.locator('[role=tablist][aria-label="Prikaz"]');
const nav = (page: Page) => page.locator('nav[aria-label="Glavna navigacija"]');

async function openHome(page: Page, vp?: { width: number; height: number }) {
  if (vp) await page.setViewportSize(vp);
  await page.goto("/domov");
  await expect(page.locator("[data-catalog-card]").first()).toBeVisible();
}

test("segmented control sits above the catalog cards; Katalogi is the default tab", async ({ page }) => {
  await openHome(page);
  await expect(tablist(page)).toBeVisible();
  const seg = (await tablist(page).boundingBox())!;
  const first = (await page.locator("[data-catalog-card]").first().boundingBox())!;
  expect(seg.y + seg.height, "tablist bottom above first card top").toBeLessThanOrEqual(first.y + 1);
  await expect(page.getByRole("tab", { name: "Katalogi" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Izdelki" })).toHaveAttribute("aria-selected", "false");
});

test("both catalog covers render", async ({ page }) => {
  await openHome(page);
  const covers = page.locator("[data-catalog-cover] img");
  await expect(covers).toHaveCount(2);
  for (const img of await covers.all()) {
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  }
});

test("retailer labels sit in the top-left corner of the catalog cards and have square corners", async ({ page }) => {
  await openHome(page);
  const cards = page.locator("[data-catalog-card]");
  await expect(cards).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    const card = cards.nth(i);
    await expect(card.locator("[data-retailer]")).toHaveCount(1);
    const g = await card.evaluate((c) => {
      const cr = c.getBoundingClientRect();
      const l = c.querySelector("[data-retailer]")!;
      const lr = l.getBoundingClientRect();
      const radii = [l, ...l.querySelectorAll("*")].flatMap((e) => {
        const cs = getComputedStyle(e);
        return [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius];
      });
      return { dx: lr.left - cr.left, dy: lr.top - cr.top, radii };
    });
    expect(g.dx, `card ${i} label left offset`).toBeGreaterThanOrEqual(-1);
    expect(g.dx, `card ${i} label left offset`).toBeLessThanOrEqual(20);
    expect(g.dy, `card ${i} label top offset`).toBeGreaterThanOrEqual(-1);
    expect(g.dy, `card ${i} label top offset`).toBeLessThanOrEqual(20);
    for (const r of g.radii) expect(r, `card ${i} wordmark radius`).toBe("0px");
  }
});

test("exactly four quick actions with the approved labels; rail is present", async ({ page }) => {
  await openHome(page);
  const buttons = page.locator('[data-home-zone="actions"] button');
  await expect(buttons).toHaveCount(4);
  for (let i = 0; i < 4; i++) await expect(buttons.nth(i)).toContainText(ACTIONS[i]);
  await expect(page.getByTestId("home-rail")).toBeVisible();
  expect(await page.locator("[data-testid=home-rail] li").count()).toBeGreaterThan(0);
});

test("switching Izdelki / Katalogi does not move the actions or the bottom zone", async ({ page }) => {
  await openHome(page);
  const y = async (zone: string) => (await page.locator(`[data-home-zone="${zone}"]`).first().boundingBox())!.y;
  const base = { actions: await y("actions"), bottom: await y("bottom") };
  await page.getByRole("tab", { name: "Izdelki" }).click();
  await expect(page.getByTestId("home-list")).toBeVisible();
  expect(Math.abs((await y("actions")) - base.actions), "actions y after Izdelki").toBeLessThanOrEqual(1);
  expect(Math.abs((await y("bottom")) - base.bottom), "bottom y after Izdelki").toBeLessThanOrEqual(1);
  await page.getByRole("tab", { name: "Katalogi" }).click();
  await expect(page.locator("[data-catalog-card]").first()).toBeVisible();
  expect(Math.abs((await y("actions")) - base.actions), "actions y after Katalogi").toBeLessThanOrEqual(1);
  expect(Math.abs((await y("bottom")) - base.bottom), "bottom y after Katalogi").toBeLessThanOrEqual(1);
});

for (const [w, h] of [
  [360, 640],
  [375, 667],
  [390, 844],
  [393, 852],
  [430, 932],
] as const) {
  test(`first rail card is fully visible above the bottom nav, nothing scrolls @${w}x${h}`, async ({ page }) => {
    await openHome(page, { width: w, height: h });
    const m = await page.evaluate(() => {
      const root = document.documentElement;
      const hr = document.querySelector<HTMLElement>("[data-home-root]")!;
      const card = document.querySelector("[data-testid=home-rail] li")!.getBoundingClientRect();
      const navEl = document.querySelector('nav[aria-label="Glavna navigacija"]')!.getBoundingClientRect();
      return {
        docScrolls: root.scrollHeight > window.innerHeight + 1,
        rootScrollH: hr.scrollHeight,
        rootClientH: hr.clientHeight,
        card: { top: card.top, bottom: card.bottom, left: card.left },
        navTop: navEl.top,
      };
    });
    expect(m.docScrolls, "document must not scroll").toBe(false);
    expect(m.rootScrollH, "[data-home-root] needs no scroll").toBeLessThanOrEqual(m.rootClientH + 1);
    expect(m.card.top).toBeGreaterThanOrEqual(0);
    expect(m.card.left).toBeGreaterThanOrEqual(-0.5);
    expect(m.card.bottom, "first rail card bottom above bottom nav").toBeLessThanOrEqual(m.navTop + 0.5);
    await expect(nav(page)).toBeVisible();
  });
}

test("very short viewport (320x500): content is reachable by scrolling and nothing is clipped horizontally", async ({ page }) => {
  await openHome(page, { width: 320, height: 500 });
  const root = page.locator("[data-home-root]");
  const dims = await root.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
  expect(dims.sh, "[data-home-root] is scrollable").toBeGreaterThan(dims.ch + 1);
  const btns = await page.locator('[data-home-zone="actions"] button').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { left: r.left, right: r.right, label: e.textContent?.trim() };
    }),
  );
  expect(btns).toHaveLength(4);
  for (const b of btns) {
    expect(b.right, `${b.label} right edge`).toBeLessThanOrEqual(320 + 0.5);
    expect(b.left, `${b.label} left edge`).toBeGreaterThanOrEqual(-0.5);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await root.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const r = await page.evaluate(() => {
    const card = document.querySelector("[data-testid=home-rail] li")!.getBoundingClientRect();
    const navEl = document.querySelector('nav[aria-label="Glavna navigacija"]')!.getBoundingClientRect();
    return { top: card.top, bottom: card.bottom, navTop: navEl.top };
  });
  expect(r.top, "rail card top inside viewport after scrolling").toBeGreaterThanOrEqual(0);
  expect(r.bottom, "rail card bottom above bottom nav after scrolling").toBeLessThanOrEqual(r.navTop + 0.5);
});
