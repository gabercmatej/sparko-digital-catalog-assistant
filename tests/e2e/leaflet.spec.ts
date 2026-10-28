import { expect, test, type Page } from "@playwright/test";
import { leaflets } from "./leaflets-data";
import { busiestPage, offerOf, pageImage, pageNum, pagesWithProducts, placementsOnPage, primary, productName, productsByPage, secondary } from "./catalog-data";

const N = primary.pageCount;
/** The busiest SPAR page: all product ids on it, its 0-based index and 1-based number. */
const BUSY = busiestPage(primary);
const BUSY_NO = BUSY.index + 1;
const PAGE_IDS = BUSY.ids.slice(0, 4);
const FIRST_ID = PAGE_IDS[0];
/** Two different SPAR pages that hold products: A (earlier) and B. */
const [PA, PB] = pagesWithProducts(primary.id);
const A_IDS = productsByPage(primary.id).get(PA)!;
const B_ID = productsByPage(primary.id).get(PB)![0];
/** An INTERSPAR product with its page. */
const IS_PAGE = pagesWithProducts(secondary.id)[0];
const IS_ID = productsByPage(secondary.id).get(IS_PAGE)![0];

/** Seed Moj katalog directly (hint already dismissed), then open `path`. */
async function seed(page: Page, productIds: string[], path: string) {
  await page.goto("/");
  await page.evaluate(
    (saved) =>
      localStorage.setItem(
        "sparko:v2",
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
    await seed(page, [], `/letak?katalog=${primary.id}&stran=${BUSY_NO}`);
    await expect(stage(page).locator(":scope > img")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const g = await geometry(page);
    expect(g.stage.t).toBeGreaterThanOrEqual(g.viewport.t - 0.5);
    expect(g.stage.b).toBeLessThanOrEqual(g.viewport.b + 0.5);
    expect(g.stage.l).toBeGreaterThanOrEqual(g.viewport.l - 0.5);
    expect(g.stage.r).toBeLessThanOrEqual(g.viewport.r + 0.5);
    // Contain-fit: limited by width or by height.
    expect(Math.abs(g.stage.w - g.viewport.w) < 1 || Math.abs(g.stage.h - g.viewport.h) < 1).toBe(true);
    expect(g.stage.w / g.stage.h).toBeCloseTo(pageImage(primary, BUSY.index).width / pageImage(primary, BUSY.index).height, 2);
    expect(g.stage.b).toBeLessThanOrEqual(g.nav.t + 0.5);
    expect(g.vScroll).toBe(false);
    expect(g.docY).toBe(0);
    expect(g.docH).toBeLessThanOrEqual(g.ih);
  });
}

test("no 'Izdelki na tej strani' list and no extra chrome above the page", async ({ page }) => {
  await seed(page, [FIRST_ID], `/letak?katalog=${primary.id}&stran=${BUSY_NO}`);
  await expect(stage(page).locator(":scope > img")).toBeVisible();
  await expect(page.getByText(/Izdelki na tej strani/)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Izdelki na tej strani" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: primary.title })).toBeAttached(); // screen-reader heading only
});

test("pages flip left/right through all pages in natural order", async ({ page }) => {
  await seed(page, [], `/letak?katalog=${primary.id}&stran=1`);
  await expect(page.getByRole("button", { name: "Prejšnja stran" })).toHaveCount(0);
  for (let n = 2; n <= N; n++) {
    await next(page).click();
    await expect(indicator(page)).toHaveText(pageNum(n, primary));
    await expect(stage(page).locator(":scope > img")).toHaveAttribute("src", pageImage(primary, n - 1).src);
  }
  await expect(next(page)).toHaveCount(0);
});

test("'Moje strani' starts OFF on a fresh open, also with saved items; switching it on still filters", async ({ page }) => {
  // Clean state: nothing stored at all.
  await page.goto(`/letak?katalog=${primary.id}`);
  const toggle = page.getByTestId("filter-toggle");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(indicator(page)).toHaveText(new RegExp(`^1 / ${N}$`));

  // Moj katalog already has items: its leaflet button must NOT switch the filter on.
  await seed(page, [...A_IDS, B_ID], "/moj-katalog");
  await page.getByRole("link", { name: "Pokaži na letaku" }).click();
  await expect(page).toHaveURL(new RegExp(`/letak\\?katalog=${primary.id}&stran=${PA + 1}$`));
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(indicator(page)).toHaveText(new RegExp(`^${PA + 1} / ${N}$`));
  await expect(box(page, A_IDS[0])).toHaveAttribute("data-saved", "true");
  await next(page).click();
  await expect(indicator(page)).toHaveText(new RegExp(`^${PA + 2} / ${N}$`));

  // Plain /letak with saved items: still off.
  await page.goto(`/letak?katalog=${primary.id}`);
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  // Manually on → only the saved pages (A, B).
  const savedPages = pagesWithProducts(primary.id).filter((i) => i === PA || i === PB);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(indicator(page)).toHaveText(new RegExp(`^${PA + 1} / ${N} · moje 1/${savedPages.length}`));
  await next(page).click();
  await expect(indicator(page)).toHaveText(new RegExp(`^${PB + 1} / ${N} · moje 2/${savedPages.length}`));
  await expect(next(page)).toHaveCount(0);
});

test("fresh open: 'Moje strani' helper microcopy and the first-open swipe hint (passes clicks, auto-hides)", async ({ page }) => {
  await page.goto(`/letak?katalog=${primary.id}`);
  const toggle = page.getByTestId("filter-toggle");
  await expect(indicator(page)).toHaveText(new RegExp(`^1 / ${N}$`));
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  const helper = page.getByTestId("filter-helper");
  await expect(helper).toBeVisible();
  await expect(helper).toHaveText("Samo strani s tvojimi izdelki");
  await expect(toggle).toHaveAttribute("aria-describedby", /leaflet-filter-helper/);
  const hs = await helper.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { fs: parseFloat(cs.fontSize), color: cs.color, overflow: el.scrollWidth > el.clientWidth + 1 };
  });
  expect(hs.fs).toBeLessThanOrEqual(11);
  const [r, g, b] = hs.color.match(/\d+/g)!.map(Number);
  expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(16); // neutral grey
  expect(r).toBeGreaterThan(70);
  expect(r).toBeLessThan(180);
  expect(hs.overflow).toBe(false);

  const hint = page.getByTestId("swipe-hint");
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText("Podrsaj levo ali desno za ogled kataloga");
  await expect(hint).toHaveAttribute("aria-hidden", "true");
  await expect(hint).not.toHaveAttribute("role", /.+/);
  expect(await hint.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  // Click-through: the element under the hint's centre is the page, not the hint.
  const under = await hint.evaluate((el) => {
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return { isHint: !!hit && el.contains(hit), inStage: !!hit?.closest('[data-testid="leaflet-stage"]') };
  });
  expect(under.isHint).toBe(false);
  expect(under.inStage).toBe(true);
  // Not focusable / no focus stolen.
  expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="swipe-hint"]'))).toBe(false);

  // A large grey semi-transparent layer over the whole leaflet, with big white copy.
  const look = await hint.evaluate((el) => {
    const viewer = el.parentElement!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const text = el.querySelector("p")!;
    const tcs = getComputedStyle(text);
    return {
      covers: Math.abs(r.left - viewer.left) < 1 && Math.abs(r.top - viewer.top) < 1 && Math.abs(r.width - viewer.width) < 1 && Math.abs(r.height - viewer.height) < 1,
      bg: getComputedStyle(el).backgroundColor,
      fs: parseFloat(tcs.fontSize),
      fw: Number(tcs.fontWeight),
      color: tcs.color,
    };
  });
  expect(look.covers).toBe(true);
  expect(look.bg).toBe("rgba(60, 60, 60, 0.52)");
  expect(look.fs).toBeGreaterThanOrEqual(20);
  expect(look.fw).toBeGreaterThanOrEqual(600);
  expect(look.color).toBe("rgb(255, 255, 255)");

  // Stays fully visible for ~3 s, then fades out and is removed (~3.5 s) without interaction.
  // (The checks above already take ~1 s, so a shorter wait keeps this clear of the 3 s fade start on slow machines.)
  await page.waitForTimeout(1200);
  await expect(hint).toBeVisible();
  expect(await hint.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  await expect(hint).toHaveCount(0, { timeout: 5000 });
  await expect(indicator(page)).toHaveText(new RegExp(`^1 / ${N}$`));
});

for (const width of [360, 390, 430, 1280]) {
  test(`swipe hint copy fits, centred and prominent @${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 1000 ? 780 : 900 });
    await page.goto(`/letak?katalog=${primary.id}`);
    const hint = page.getByTestId("swipe-hint");
    await expect(hint).toBeVisible();
    const m = await hint.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const t = el.querySelector("p")!;
      const tr = t.getBoundingClientRect();
      const g = el.firstElementChild!.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(t);
      return {
        inside: tr.left >= r.left && tr.right <= r.right && g.left >= r.left && g.right <= r.right,
        overflow: t.scrollWidth > t.clientWidth + 1 || el.scrollWidth > el.clientWidth + 1,
        centreDx: Math.abs((tr.left + tr.right) / 2 - (r.left + r.right) / 2),
        centreDy: Math.abs((g.top + tr.bottom) / 2 - (r.top + r.bottom) / 2),
        lines: new Set([...range.getClientRects()].map((q) => Math.round(q.bottom))).size,
        fs: parseFloat(getComputedStyle(t).fontSize),
      };
    });
    expect(m.inside).toBe(true);
    expect(m.overflow).toBe(false);
    expect(m.centreDx).toBeLessThan(2);
    expect(m.centreDy).toBeLessThan(4);
    expect(m.lines).toBeLessThanOrEqual(2);
    expect(m.fs).toBeGreaterThanOrEqual(20);
  });
}

test("swipe hint hides immediately on interaction and shows only once per session", async ({ page }) => {
  await page.goto(`/letak?katalog=${primary.id}&stran=${BUSY_NO}`);
  const hint = page.getByTestId("swipe-hint");
  await expect(hint).toBeVisible();
  // Pointer interaction on the page viewport.
  const vp = await stage(page).boundingBox();
  await page.mouse.move(vp!.x + vp!.width / 2, vp!.y + vp!.height / 3);
  const t0 = Date.now();
  await page.mouse.down();
  await page.mouse.move(vp!.x + vp!.width / 2 + 5, vp!.y + vp!.height / 3);
  await page.mouse.up();
  await expect(hint).toHaveCount(0, { timeout: 300 });
  expect(Date.now() - t0).toBeLessThan(600);

  // Paging and revisiting in the same session: no hint again.
  await next(page).click();
  await expect(indicator(page)).toHaveText(pageNum(BUSY_NO + 1, primary));
  await expect(page).toHaveURL(new RegExp(`stran=${BUSY_NO + 1}`));
  await page.reload();
  await expect(indicator(page)).toHaveText(pageNum(BUSY_NO + 1, primary));
  await page.waitForTimeout(1500);
  await expect(hint).toHaveCount(0);
  await page.goto("/");
  await page.goto(`/letak?katalog=${primary.id}`);
  await page.waitForTimeout(1500);
  await expect(hint).toHaveCount(0);
});

test("swipe hint: the 'Naslednja stran' arrow passes through and dismisses it right away", async ({ page }) => {
  await page.goto(`/letak?katalog=${primary.id}`);
  const hint = page.getByTestId("swipe-hint");
  await expect(hint).toBeVisible();
  await next(page).click();
  await expect(hint).toHaveCount(0, { timeout: 300 });
  await expect(indicator(page)).toHaveText(pageNum(2, primary));
});

test("Moj katalog filter: off = all pages, on = only saved pages (deduped, in order), live updates", async ({ page }) => {
  // Several products on page A, one on page B.
  await seed(page, [...A_IDS, B_ID], `/letak?katalog=${primary.id}&moji=1`);
  const toggle = page.getByTestId("filter-toggle");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(indicator(page)).toHaveText(new RegExp(`^${PA + 1} / ${N} · moje 1/2`));
  await next(page).click();
  await expect(indicator(page)).toHaveText(new RegExp(`^${PB + 1} / ${N} · moje 2/2`));
  await expect(next(page)).toHaveCount(0);

  // Picker lists exactly the two saved pages.
  await page.getByRole("button", { name: /Izberi stran/ }).click();
  await expect(page.getByRole("dialog").getByRole("listitem")).toHaveCount(2);
  await page.keyboard.press("Escape");

  // Remove B's product from the leaflet → that page has no saved items; filter keeps only page A.
  await box(page, B_ID).click();
  await page.getByRole("dialog").getByRole("button", { name: "Odstrani" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("status").filter({ hasText: "Na tej strani ni več izdelkov" })).toBeVisible();
  await page.getByRole("button", { name: "Prejšnja stran" }).click();
  await expect(indicator(page)).toHaveText(new RegExp(`^${PA + 1} / ${N} · moje 1/1`));

  // Filter off → all pages again.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await next(page).click();
  await expect(indicator(page)).toHaveText(pageNum(PA + 2, primary));
});

test("all saved products on one page are highlighted together; add/remove updates immediately; reload keeps them", async ({ page }) => {
  const k = PAGE_IDS.length;
  const initial = PAGE_IDS.slice(0, k - 1);
  const extra = PAGE_IDS[k - 1];
  await seed(page, initial, `/letak?katalog=${primary.id}&stran=${BUSY_NO}`);
  const saved = stage(page).locator('[data-saved="true"]');
  await expect(saved).toHaveCount(k - 1);
  for (const id of initial) await expect(box(page, id)).toContainText("V Mojem katalogu");

  // Add the last one from the leaflet.
  await box(page, extra).click();
  await page.getByRole("dialog").getByRole("button", { name: "Dodaj v Moj katalog" }).click();
  await page.keyboard.press("Escape");
  await expect(saved).toHaveCount(k);

  // Remove one.
  await box(page, initial[0]).click();
  await page.getByRole("dialog").getByRole("button", { name: "Odstrani" }).click();
  await page.keyboard.press("Escape");
  await expect(box(page, initial[0])).not.toHaveAttribute("data-saved", "true");
  await expect(saved).toHaveCount(k - 1);

  await page.reload();
  await expect(saved).toHaveCount(k - 1);
  await expect(page.getByRole("navigation", { name: "Glavna navigacija" })).toContainText(String(k - 1));
});

test("saved overlay: fixed size, only the golden light pulses (A bright ↔ B calm, 2 s); no scaling, no orbs", async ({ page }) => {
  await seed(page, [FIRST_ID], `/letak?katalog=${primary.id}&stran=${BUSY_NO}`);
  const host = box(page, FIRST_ID);
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
  const savedIds = PAGE_IDS.slice(-2);
  const unsavedIds = PAGE_IDS.slice(0, -2);
  await seed(page, savedIds, `/letak?katalog=${primary.id}&stran=${BUSY_NO}`);
  for (const id of savedIds) {
    await expect(box(page, id).locator("[data-saved-box]")).toHaveCount(1);
    await expect(box(page, id).locator("[data-saved-box]")).toHaveCSS("animation-name", /savedGlow/);
    await expect(box(page, id).locator("[data-saved-box]")).toHaveCSS("transform", "none");
  }
  for (const id of unsavedIds) {
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
  await seed(page, [FIRST_ID], `/letak?katalog=${primary.id}&stran=${BUSY_NO}`);
  const host = box(page, FIRST_ID);
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

test("product → 'Poglej v ... katalogu' opens the right page, emphasises the product, then pages freely", async ({ page }) => {
  await seed(page, [], "/");
  await page.getByPlaceholder("Vprašaj Sparka o katalogu …").fill(`Koliko stane ${productName(FIRST_ID).toLowerCase()}?`);
  await page.getByPlaceholder("Vprašaj Sparka o katalogu …").press("Enter");
  const card = page.getByRole("log", { name: "Pogovor s Sparkom" }).locator(`[data-product-card="${FIRST_ID}"]`).first();
  await card.getByRole("button", { name: /^Poglej v .* katalogu/ }).click();
  await expect(page).toHaveURL(new RegExp(`/letak\\?katalog=${primary.id}&stran=${BUSY_NO}`));
  await expect(indicator(page)).toHaveText(pageNum(BUSY_NO, primary));
  const ring = box(page, FIRST_ID).locator("[data-focus-ring]");
  await expect.poll(() => ring.evaluate((e) => e.getAnimations().length)).toBeGreaterThan(0);
  await next(page).click();
  await expect(indicator(page)).toHaveText(pageNum(BUSY_NO + 1, primary));
});

// ---------------------------------------------------------------- multi-catalog

/** Switch catalog through the single switch button + "Izberi katalog" picker. */
async function switchTo(page: Page, catalogId: string) {
  await page.getByTestId("catalog-switch").click();
  const dialog = page.getByRole("dialog", { name: "Izberi katalog" });
  await dialog.locator(`[data-picker-catalog="${catalogId}"]`).click();
  await expect(dialog).toHaveCount(0);
}
const currentCatalog = (page: Page) => page.getByTestId("catalog-switch");
const DEFAULT_LEAFLET = leaflets[0];

test("INTERSPAR deep link opens the INTERSPAR page with the saved highlight and the product glow", async ({ page }) => {
  await seed(page, [IS_ID], `/letak?katalog=${secondary.id}&stran=${IS_PAGE + 1}&izdelek=${IS_ID}`);
  await expect(currentCatalog(page)).toHaveAttribute("data-catalog-id", secondary.id);
  await expect(indicator(page)).toHaveText(pageNum(IS_PAGE + 1, secondary));
  await expect(stage(page).locator(":scope > img")).toHaveAttribute("src", pageImage(secondary, IS_PAGE).src);
  await expect(page.getByRole("heading", { name: secondary.title })).toBeAttached();
  await expect(box(page, IS_ID)).toHaveAttribute("data-saved", "true");
  await expect(box(page, IS_ID)).toContainText("V Mojem katalogu");
  await expect.poll(() => box(page, IS_ID).locator("[data-focus-ring]").evaluate((e) => e.getAnimations().length)).toBeGreaterThan(0);
  // Only this catalog's placements are rendered.
  await expect(stage(page).locator("[data-placement-id]")).toHaveCount(placementsOnPage(secondary, IS_PAGE).length);
});

test("the product wins over a conflicting katalog parameter; unknown katalog falls back to the default leaflet", async ({ page }) => {
  await seed(page, [], `/letak?katalog=${primary.id}&izdelek=${IS_ID}`);
  await expect(currentCatalog(page)).toHaveAttribute("data-catalog-id", secondary.id);
  await expect(indicator(page)).toHaveText(pageNum(IS_PAGE + 1, secondary));
  await page.goto("/letak?katalog=nope");
  await expect(currentCatalog(page)).toHaveAttribute("data-catalog-id", DEFAULT_LEAFLET.id);
  await expect(indicator(page)).toHaveText(new RegExp(`^1 / ${DEFAULT_LEAFLET.pageCount}`));
});

test("catalog switch: page 1 of the other catalog, URL follows, switching back to the default leaflet drops the parameter", async ({ page }) => {
  await seed(page, [], `/letak?katalog=${primary.id}&stran=${BUSY_NO}`);
  await switchTo(page, secondary.id);
  await expect(indicator(page)).toHaveText(pageNum(1, secondary));
  await expect(page).toHaveURL(new RegExp(`katalog=${secondary.id}&stran=1`));
  await expect(stage(page).locator(":scope > img")).toHaveAttribute("src", pageImage(secondary, 0).src);
  await next(page).click();
  await expect(indicator(page)).toHaveText(pageNum(2, secondary));
  await expect(stage(page).locator(":scope > img")).toHaveAttribute("src", pageImage(secondary, 1).src);
  await page.getByRole("button", { name: /Izberi stran/ }).click();
  await expect(page.getByRole("dialog").getByRole("listitem")).toHaveCount(secondary.pageCount);
  await page.keyboard.press("Escape");
  await switchTo(page, DEFAULT_LEAFLET.id);
  await expect(indicator(page)).toHaveText(new RegExp(`^1 / ${DEFAULT_LEAFLET.pageCount}`));
  await expect(page).not.toHaveURL(/katalog=/);
  await expect(currentCatalog(page)).toHaveAttribute("data-catalog-id", DEFAULT_LEAFLET.id);
  await expect(stage(page).locator(":scope > img")).toHaveAttribute("src", new RegExp(`/catalog/${DEFAULT_LEAFLET.id}/`));
  // The earlier SPAR 41/26 stays reachable and now carries its id in the URL.
  await switchTo(page, primary.id);
  await expect(page).toHaveURL(new RegExp(`katalog=${primary.id}&stran=1`));
  await expect(stage(page).locator(":scope > img")).toHaveAttribute("src", pageImage(primary, 0).src);
});

test("'Moje strani' is per catalog and survives a catalog switch", async ({ page }) => {
  await seed(page, [FIRST_ID, IS_ID], `/letak?katalog=${primary.id}&moji=1`);
  const toggle = page.getByTestId("filter-toggle");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(indicator(page)).toHaveText(new RegExp(`^${BUSY_NO} / ${N} · moje 1/1`));
  await switchTo(page, secondary.id);
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(indicator(page)).toHaveText(new RegExp(`^${IS_PAGE + 1} / ${secondary.pageCount} · moje 1/1`));
  await expect(page).toHaveURL(/moji=1/);
  await expect(box(page, IS_ID)).toHaveAttribute("data-saved", "true");
});

test("'Moje strani' in a catalog without saved products falls back to all pages with a notice", async ({ page }) => {
  await seed(page, [FIRST_ID], `/letak?katalog=${primary.id}&moji=1`);
  await expect(page.getByTestId("filter-toggle")).toHaveAttribute("aria-checked", "true");
  await switchTo(page, secondary.id);
  await expect(page.getByTestId("filter-toggle")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("status").filter({ hasText: `V katalogu ${secondary.title} nimaš izdelkov` })).toBeVisible();
  await expect(indicator(page)).toHaveText(pageNum(1, secondary));
});

test("overlays stay aligned with the page image across responsive sizes", async ({ page }) => {
  const pls = placementsOnPage(primary, BUSY.index);
  await seed(page, PAGE_IDS, `/letak?katalog=${primary.id}&stran=${BUSY_NO}`);
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

// ---------------------------------------------------------------- FIX 7: more interactive products (SPAR cover = reference page)

const COVER_IDS = ["svinjska-rebra-eu-1kg", "radler-cola-limeta-union-0-5l"];

test("SPAR cover: Svinjska rebra EU and Radler Cola Limeta are tappable regions next to the already mapped products", async ({ page }) => {
  await seed(page, [], `/letak?katalog=${primary.id}&stran=1`);
  await expect(indicator(page)).toHaveText(pageNum(1, primary));
  for (const id of [...COVER_IDS, "nutella-1kg", "sitarjev-hlebec-750g", "belo-grozdje-1kg"]) await expect(box(page, id)).toHaveCount(1);
});

for (const id of COVER_IDS) {
  test(`SPAR cover: tapping ${id} opens the product sheet; saving gives the golden highlight, shows it in Moj katalog and survives a reload`, async ({ page }) => {
    await seed(page, [], `/letak?katalog=${primary.id}&stran=1`);
    await box(page, id).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(productName(id));
    await dialog.getByRole("button", { name: "Dodaj v Moj katalog" }).click();
    await page.keyboard.press("Escape");
    await expect(box(page, id)).toHaveAttribute("data-saved", "true");
    await expect(box(page, "nutella-1kg")).not.toHaveAttribute("data-saved", "true");

    await page.reload();
    await expect(box(page, id)).toHaveAttribute("data-saved", "true");

    await page.goto("/moj-katalog");
    await expect(page.getByText(productName(id)).first()).toBeVisible();

    // remove again from the leaflet
    await page.goto(`/letak?katalog=${primary.id}&stran=1`);
    await box(page, id).click();
    await page.getByRole("dialog").getByRole("button", { name: "Odstrani" }).click();
    await page.keyboard.press("Escape");
    await expect(box(page, id)).not.toHaveAttribute("data-saved", "true");
  });
}

test("INTERSPAR still switches and a newly mapped INTERSPAR product (page 8) is tappable", async ({ page }) => {
  await seed(page, [], `/letak?katalog=${primary.id}`);
  await switchTo(page, secondary.id);
  await expect(indicator(page)).toHaveText(pageNum(1, secondary));
  await page.goto(`/letak?katalog=${secondary.id}&stran=8`);
  await expect(box(page, "pecena-piscancja-prsa-1kg")).toHaveCount(1);
  await box(page, "tiramisu-to-go-200g").click();
  await expect(page.getByRole("dialog")).toContainText(productName("tiramisu-to-go-200g"));
});
