import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type Placement = { id: string; offerId: string; pdfPageIndex: number; bbox: { x: number; y: number; width: number; height: number } };
const data = JSON.parse(readFileSync("src/data/catalog.json", "utf8")) as {
  offers: { id: string; productId: string }[];
  placements: Placement[];
};
const offerOf = (productId: string) => data.offers.find((o) => o.productId === productId)!.id;
const PAGE5 = ["sb-skuta-1kg", "sb-pommes-1kg", "sb-salama-400g", "sb-zrezki-500g"];

/** Seed Moj katalog directly (hint already dismissed), then open `path`. */
async function seed(page: Page, productIds: string[], path: string) {
  await page.goto("/");
  await page.evaluate(
    (saved) =>
      localStorage.setItem(
        "sparko:v1",
        JSON.stringify({ v: 1, saved, conversations: [], activeConversationId: null, settings: { spPlus: "unset", leafletHintSeen: true } }),
      ),
    productIds.map((id, i) => ({ productId: id, offerId: offerOf(id), savedAt: 1_700_000_000_000 + i })),
  );
  await page.goto(path);
}

const indicator = (page: Page) => page.getByTestId("page-indicator");
const stage = (page: Page) => page.locator('[data-testid="leaflet-stage"]');
const box = (page: Page, productId: string) => stage(page).locator(`[data-product-id="${productId}"]`);
const next = (page: Page) => page.getByRole("button", { name: "Naslednja stran" });

async function geometry(page: Page) {
  return page.evaluate(() => {
    const r = (el: Element | null) => {
      const b = el!.getBoundingClientRect();
      return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height };
    };
    const st = document.querySelector('[data-testid="leaflet-stage"]');
    const se = document.scrollingElement!;
    window.scrollTo(0, 9999);
    const docY = window.scrollY;
    window.scrollTo(0, 0);
    const vScroll = [...document.querySelectorAll<HTMLElement>("main, main *")].some(
      (e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1,
    );
    return {
      stage: r(st),
      viewport: r(st!.closest('[aria-roledescription="stran letaka"]')),
      nav: r(document.querySelector('nav[aria-label="Glavna navigacija"]')),
      docY,
      docH: se.scrollHeight,
      ih: innerHeight,
      vScroll,
    };
  });
}

for (const [w, h] of [
  [360, 640],
  [390, 844],
  [430, 932],
  [1440, 900],
]) {
  test(`page fits whole and as large as possible at ${w}x${h} (no vertical scrolling)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await seed(page, [], "/letak?stran=5");
    await expect(stage(page).locator("img")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const g = await geometry(page);
    expect(g.stage.t).toBeGreaterThanOrEqual(g.viewport.t - 0.5);
    expect(g.stage.b).toBeLessThanOrEqual(g.viewport.b + 0.5);
    expect(g.stage.l).toBeGreaterThanOrEqual(g.viewport.l - 0.5);
    expect(g.stage.r).toBeLessThanOrEqual(g.viewport.r + 0.5);
    // Contain-fit: limited by width or by height.
    expect(Math.abs(g.stage.w - g.viewport.w) < 1 || Math.abs(g.stage.h - g.viewport.h) < 1).toBe(true);
    expect(g.stage.w / g.stage.h).toBeCloseTo(1400 / 1900, 2);
    expect(g.stage.b).toBeLessThanOrEqual(g.nav.t + 0.5);
    expect(g.vScroll).toBe(false);
    expect(g.docY).toBe(0);
    expect(g.docH).toBeLessThanOrEqual(g.ih);
  });
}

test("no 'Izdelki na tej strani' list and no extra chrome above the page", async ({ page }) => {
  await seed(page, ["sb-skuta-1kg"], "/letak?stran=5");
  await expect(stage(page).locator("img")).toBeVisible();
  await expect(page.getByText(/Izdelki na tej strani/)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Izdelki na tej strani" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "SPAR letak" })).toBeAttached(); // screen-reader heading only
});

test("pages flip left/right through all 38 pages in natural order", async ({ page }) => {
  await seed(page, [], "/letak?stran=1");
  await expect(page.getByRole("button", { name: "Prejšnja stran" })).toHaveCount(0);
  for (let n = 2; n <= 38; n++) {
    await next(page).click();
    await expect(indicator(page)).toHaveText(new RegExp(`^${n} / 38`));
    await expect(stage(page).locator("img")).toHaveAttribute("src", `/catalog/pages/page-${String(n).padStart(2, "0")}.webp`);
  }
  await expect(next(page)).toHaveCount(0);
});

test("Moj katalog filter: off = all pages, on = only saved pages (deduped, in order), live updates", async ({ page }) => {
  // skuta + pommes share page 5, jagode is on page 10.
  await seed(page, ["sb-skuta-1kg", "sb-pommes-1kg", "jagode-250g"], "/letak?moji=1");
  const toggle = page.getByTestId("filter-toggle");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(indicator(page)).toHaveText(/^5 \/ 38 · moje 1\/2/);
  await next(page).click();
  await expect(indicator(page)).toHaveText(/^10 \/ 38 · moje 2\/2/);
  await expect(next(page)).toHaveCount(0);

  // Picker lists exactly the two saved pages.
  await page.getByRole("button", { name: /Izberi stran/ }).click();
  await expect(page.getByRole("dialog").getByRole("listitem")).toHaveCount(2);
  await page.keyboard.press("Escape");

  // Remove jagode from the leaflet → the page now has no saved items; filter keeps only page 5.
  await box(page, "jagode-250g").click();
  await page.getByRole("dialog").getByRole("button", { name: "Odstrani" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("status").filter({ hasText: "Na tej strani ni več izdelkov" })).toBeVisible();
  await page.getByRole("button", { name: "Prejšnja stran" }).click();
  await expect(indicator(page)).toHaveText(/^5 \/ 38 · moje 1\/1/);

  // Filter off → all 38 pages again.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await next(page).click();
  await expect(indicator(page)).toHaveText(/^6 \/ 38/);
});

test("all saved products on one page are highlighted together; add/remove updates immediately; reload keeps them", async ({ page }) => {
  await seed(page, PAGE5.slice(0, 3), "/letak?stran=5");
  const saved = stage(page).locator('[data-saved="true"]');
  await expect(saved).toHaveCount(3);
  for (const id of PAGE5.slice(0, 3)) await expect(box(page, id)).toContainText("V Mojem katalogu");

  // Add the fourth from the leaflet.
  await box(page, "sb-zrezki-500g").click();
  await page.getByRole("dialog").getByRole("button", { name: "Dodaj v Moj katalog" }).click();
  await page.keyboard.press("Escape");
  await expect(saved).toHaveCount(4);

  // Remove one.
  await box(page, "sb-salama-400g").click();
  await page.getByRole("dialog").getByRole("button", { name: "Odstrani" }).click();
  await page.keyboard.press("Escape");
  await expect(box(page, "sb-salama-400g")).not.toHaveAttribute("data-saved", "true");
  await expect(saved).toHaveCount(3);

  await page.reload();
  await expect(saved).toHaveCount(3);
  await expect(page.getByRole("navigation", { name: "Glavna navigacija" })).toContainText("3");
});

test("saved overlay: light-green overlay with a flashing infinite pulse", async ({ page }) => {
  await seed(page, ["sb-skuta-1kg"], "/letak?stran=5");
  const pulse = box(page, "sb-skuta-1kg").locator("[data-pulse]");
  await expect(pulse).toBeAttached();
  const s = await pulse.evaluate((el) => {
    const cs = getComputedStyle(el);
    const host = getComputedStyle(el.parentElement!);
    return { name: cs.animationName, iter: cs.animationIterationCount, dur: cs.animationDuration, bg: host.backgroundColor };
  });
  expect(s.name).toContain("savedGlow");
  expect(s.iter).toBe("infinite");
  expect(parseFloat(s.dur)).toBeGreaterThanOrEqual(0.8);
  expect(parseFloat(s.dur)).toBeLessThanOrEqual(1.6);
  expect(s.bg).toMatch(/rgba\(74, 222, 128, 0\.2\d*\)/);
});

test("reduced motion: saved overlay is static", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page, ["sb-skuta-1kg"], "/letak?stran=5");
  const pulse = box(page, "sb-skuta-1kg").locator("[data-pulse]");
  await expect(pulse).toHaveCSS("animation-name", "none");
});

test("product → 'Poglej v SPAR katalogu' opens the right page, emphasises the product, then pages freely", async ({ page }) => {
  await seed(page, [], "/");
  await page.getByPlaceholder("Vprašaj Sparka …").fill("Koliko stane skuta?");
  await page.getByPlaceholder("Vprašaj Sparka …").press("Enter");
  const card = page.getByRole("log", { name: "Pogovor s Sparkom" }).locator('[data-product-card="sb-skuta-1kg"]').first();
  await card.getByRole("button", { name: "Poglej v SPAR katalogu" }).click();
  await expect(page).toHaveURL(/\/letak\?stran=5/);
  await expect(indicator(page)).toHaveText(/^5 \/ 38/);
  const ring = box(page, "sb-skuta-1kg").locator("[data-focus-ring]");
  await expect.poll(() => ring.evaluate((e) => e.getAnimations().length)).toBeGreaterThan(0);
  await next(page).click();
  await expect(indicator(page)).toHaveText(/^6 \/ 38/);
});

test("overlays stay aligned with the page image across responsive sizes", async ({ page }) => {
  const pls = data.placements.filter((p) => p.pdfPageIndex === 4);
  await seed(page, PAGE5, "/letak?stran=5");
  for (const [w, h] of [
    [360, 640],
    [390, 844],
    [430, 932],
    [800, 600],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(150);
    const m = await stage(page).evaluate((st) => {
      const i = st.querySelector("img")!.getBoundingClientRect();
      return {
        img: { x: i.left, y: i.top, w: i.width, h: i.height },
        boxes: [...st.querySelectorAll<HTMLElement>("[data-placement-id]")].map((e) => {
          const r = e.getBoundingClientRect();
          return { id: e.dataset.placementId, x: r.left, y: r.top, w: r.width, h: r.height };
        }),
      };
    });
    for (const pl of pls) {
      const b = m.boxes.find((x) => x.id === pl.id)!;
      expect(Math.abs(b.x - (m.img.x + pl.bbox.x * m.img.w)), `${pl.id} x @${w}`).toBeLessThan(1);
      expect(Math.abs(b.y - (m.img.y + pl.bbox.y * m.img.h)), `${pl.id} y @${w}`).toBeLessThan(1);
      expect(Math.abs(b.w - pl.bbox.width * m.img.w), `${pl.id} w @${w}`).toBeLessThan(1);
      expect(Math.abs(b.h - pl.bbox.height * m.img.h), `${pl.id} h @${w}`).toBeLessThan(1);
    }
  }
});
