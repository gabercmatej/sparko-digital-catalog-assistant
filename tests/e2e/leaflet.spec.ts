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
    await expect(stage(page).locator(":scope > img")).toBeVisible();
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
  await expect(stage(page).locator(":scope > img")).toBeVisible();
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
    await expect(stage(page).locator(":scope > img")).toHaveAttribute("src", `/catalog/pages/page-${String(n).padStart(2, "0")}.webp`);
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

test("saved overlay: fixed size, only the golden light pulses (A bright ↔ B calm, 2 s); no scaling, no orbs", async ({ page }) => {
  await seed(page, ["sb-skuta-1kg"], "/letak?stran=5");
  const host = box(page, "sb-skuta-1kg");
  await expect(host.locator("[data-saved-ring]")).toBeAttached();
  await expect(host).toContainText("V Mojem katalogu");
  // The old orbiting lights are gone.
  await expect(stage(page).locator("[data-orb], [data-orbit]")).toHaveCount(0);
  const s = await host.evaluate((el) => {
    const boxEl = el.querySelector<HTMLElement>("[data-saved-box]")!;
    const crop = el.querySelector<HTMLElement>("[data-saved-crop]")!;
    const overlay = el.querySelector<HTMLElement>("[data-gold-overlay]")!;
    const ring = el.querySelector<HTMLElement>("[data-saved-ring]")!;
    const anim = (e: HTMLElement) => {
      const c = getComputedStyle(e);
      return { name: c.animationName, dur: parseFloat(c.animationDuration), iter: c.animationIterationCount, ease: c.animationTimingFunction };
    };
    const animated = [boxEl, crop, overlay];
    // No keyframe of any saved-box animation may touch size or position.
    const animatedProps = animated.flatMap((e) =>
      e.getAnimations().flatMap((a) => (a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k))),
    );
    // Freeze every pulse animation at time t and measure.
    const at = (t: number) => {
      for (const e of animated)
        for (const a of e.getAnimations()) {
          a.pause();
          a.currentTime = t;
        }
      const h = el.getBoundingClientRect();
      const r = boxEl.getBoundingClientRect();
      const g = ring.getBoundingClientRect();
      return {
        rect: [r.left - h.left, r.top - h.top, r.width - h.width, r.height - h.height],
        ringW: g.width,
        transform: getComputedStyle(boxEl).transform,
        overlay: parseFloat(getComputedStyle(overlay).opacity),
        filter: getComputedStyle(crop).filter,
        shadow: getComputedStyle(boxEl).boxShadow,
      };
    };
    const samples = [0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000].map(at);
    return {
      box: anim(boxEl),
      overlayAnim: anim(overlay),
      cropAnim: anim(crop),
      animatedProps,
      samples,
      hostBg: getComputedStyle(el).backgroundColor,
      cropSrc: crop.querySelector("img")!.getAttribute("src"),
      pageSrc: document.querySelector('[data-testid="leaflet-stage"] > img')!.getAttribute("src"),
    };
  });
  expect(s.box.name).toContain("savedGlow");
  expect(s.box.iter).toBe("infinite");
  expect(s.box.dur).toBe(2); // 1 s each way
  expect(s.box.ease).toBe("ease-in-out");
  expect(s.overlayAnim.name).toContain("savedOverlay");
  expect(s.cropAnim.name).toContain("savedBright");
  // Only light is animated: never transform / scale / size / position.
  for (const p of ["transform", "scale", "translate", "width", "height", "inset", "top", "left"]) expect(s.animatedProps).not.toContain(p);
  expect(s.animatedProps).toContain("boxShadow");
  // Throughout the whole cycle the box sits exactly on the verified bbox: no transform, no size change.
  for (const x of s.samples) {
    expect(x.transform).toBe("none");
    for (const d of x.rect) expect(Math.abs(d)).toBeLessThan(0.01);
    expect(x.ringW).toBeCloseTo(s.samples[0].ringW, 2);
  }
  const [a, , , , b, , , , a2] = s.samples;
  // State A: gold overlay, brighter, strong glow (inner halo at 64 % gold — ~10 % stronger than before).
  expect(a.overlay).toBeCloseTo(1, 2);
  expect(a.filter).toContain("brightness(1.08)");
  expect(a.shadow).toContain("rgba(245, 197, 66, 0.64)");
  // State B: subtler overlay (still present), normal brightness, softer glow.
  expect(b.overlay).toBeCloseTo(0.35, 2);
  expect(b.filter).toBe("brightness(1)");
  expect(b.shadow).not.toBe(a.shadow);
  expect(b.shadow).toContain("rgba(245, 197, 66, 0.3)");
  // Back to A.
  expect(a2.overlay).toBeCloseTo(1, 2);
  expect(a2.shadow).toBe(a.shadow);
  // The box carries the printed product itself (a crop of the same page image) for the brightness lift.
  expect(s.cropSrc).toBe(s.pageSrc);
  // The hit target (and so the page) never moves: it keeps the verified bbox, unfilled.
  const alpha = (c: string) => Number(/rgba?\([^)]*?,\s*([\d.]+)\)$/.exec(c)?.[1] ?? 1);
  expect(alpha(s.hostBg)).toBe(0);
});

test("only saved products animate; unsaved neighbours stay untouched", async ({ page }) => {
  await seed(page, ["sb-salama-400g", "sb-zrezki-500g"], "/letak?stran=5");
  for (const id of ["sb-salama-400g", "sb-zrezki-500g"]) {
    await expect(box(page, id).locator("[data-saved-box]")).toHaveCount(1);
    await expect(box(page, id).locator("[data-saved-box]")).toHaveCSS("animation-name", /savedGlow/);
    await expect(box(page, id).locator("[data-saved-box]")).toHaveCSS("transform", "none");
  }
  for (const id of ["sb-skuta-1kg", "sb-pommes-1kg"]) {
    const b = box(page, id);
    await expect(b).not.toHaveAttribute("data-saved", "true");
    await expect(b.locator("[data-saved-box], [data-saved-ring], [data-gold-overlay], [data-saved-crop]")).toHaveCount(0);
    await expect(b).not.toContainText("V Mojem katalogu");
    await expect(b).toHaveCSS("transform", "none");
    await expect(b).toHaveCSS("animation-name", "none");
  }
});

test("reduced motion: saved overlay is the static gold state A (no pulse, no transform)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page, ["sb-skuta-1kg"], "/letak?stran=5");
  const host = box(page, "sb-skuta-1kg");
  const boxEl = host.locator("[data-saved-box]");
  await expect(host.locator("[data-saved-ring]")).toBeVisible();
  await expect(boxEl).toHaveCSS("animation-name", "none");
  await expect(boxEl).toHaveCSS("transform", "none");
  await expect(boxEl).toHaveCSS("box-shadow", /rgba\(245, 197, 66, 0\.64\)/);
  await expect(host.locator("[data-saved-crop]")).toHaveCSS("animation-name", "none");
  await expect(host.locator("[data-saved-crop]")).toHaveCSS("filter", "brightness(1.08)");
  await expect(host.locator("[data-gold-overlay]")).toHaveCSS("animation-name", "none");
  await expect(host.locator("[data-gold-overlay]")).toHaveCSS("opacity", "1");
  await expect(host).toContainText("V Mojem katalogu");
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
