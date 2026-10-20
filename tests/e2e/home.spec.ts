import { expect, test } from "@playwright/test";

test.describe("home", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/domov");
  });

  test("shows both catalog cards with dates and working links", async ({ page }) => {
    const cards = page.locator("[data-catalog-card]");
    await expect(cards).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      const card = cards.nth(i);
      await expect(card).toContainText("Aktualni katalog");
      await expect(card).toContainText(/\d+\.\s\d+\.\s– \d+\.\s\d+\.\s\d{4}/);
      await expect(card).toContainText("Odpri katalog");
    }
    await expect(page.locator('[data-catalog-card] [data-retailer="spar"]')).toHaveCount(1);
    await expect(page.locator('[data-catalog-card] [data-retailer="interspar"]')).toHaveCount(1);
    await expect(cards.nth(0)).toHaveAttribute("href", "/letak");
    await expect(cards.nth(1)).toHaveAttribute("href", "/letak?katalog=interspar-1426");
  });

  test("segmented control defaults to Katalogi and switches to the list", async ({ page }) => {
    const katalogi = page.getByRole("tab", { name: "Katalogi" });
    const izdelki = page.getByRole("tab", { name: "Izdelki" });
    await expect(katalogi).toHaveAttribute("aria-selected", "true");
    await expect(izdelki).toHaveAttribute("aria-selected", "false");
    await izdelki.click();
    await expect(izdelki).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Izdelki iz katalogov" })).toBeVisible();
    await expect(page.locator("[data-catalog-card]")).toHaveCount(0);
    await katalogi.click();
    await expect(page.locator("[data-catalog-card]")).toHaveCount(2);
  });

  const cases = [
    { action: "Kaj je najbolj znižano", heading: "Najbolj znižano" },
    { action: "Kaj je novega v katalogu", heading: "Novo v katalogu" },
    { action: "Poglej izdelke po kategoriji", heading: "Po kategorijah" },
  ];
  for (const c of cases) {
    test(`action "${c.action}" switches to Izdelki`, async ({ page }) => {
      const btn = page.getByRole("button", { name: c.action });
      await btn.click();
      await expect(btn).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("tab", { name: "Izdelki" })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("heading", { name: c.heading, exact: true }).first()).toBeVisible();
      await expect(page.locator("[data-product-id]").first()).toBeVisible();
      // The rail title follows the intent, or falls back to the default when too few items are left.
      const title = ((await page.getByTestId("home-rail").locator("xpath=../div/h2").textContent()) ?? "").trim();
      expect(title === c.heading || title === "Aktualni izdelki iz kataloga" || title.endsWith(" iz kataloga")).toBe(true);
    });
  }

  test("every rail card carries a retailer label", async ({ page }) => {
    const cards = page.locator("[data-testid=home-rail] [data-mini-card]");
    expect(await cards.count()).toBeGreaterThan(0);
    const labelled = page.locator("[data-testid=home-rail] [data-mini-card] [data-retailer]");
    expect(await labelled.count()).toBe(await cards.count());
  });

  test("Poglej vse shows the list for the rail", async ({ page }) => {
    await page.getByRole("button", { name: /^Poglej vse$/ }).click();
    await expect(page.getByRole("tab", { name: "Izdelki" })).toHaveAttribute("aria-selected", "true");
  });

  test("a tapped rail product opens its sheet", async ({ page }) => {
    await page.locator("[data-testid=home-rail] [data-mini-card] button").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // The bottom sheet's product card names its source catalog.
    await expect(page.getByRole("dialog").locator("[data-retailer]")).toHaveCount(1);
  });

  test("nearest SPAR action opens the sheet", async ({ page }) => {
    await page.getByRole("button", { name: "Kje je najbližji SPAR" }).click();
    const dialog = page.getByRole("dialog", { name: "Najbližji SPAR" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("nearest-store-card")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Katalogi" })).toHaveAttribute("aria-selected", "true");
  });

  test("no horizontal overflow at 360 px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/domov");
    await expect(page.locator("[data-catalog-card]").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("tab", { name: "Izdelki" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  for (const w of [360, 390, 430]) {
    test(`quick-action labels fit in at most two lines @${w}px; the rail clears the bottom nav when scrolled to the end`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await page.goto("/domov");
      const lines = await page.locator("button:has([class*='actionLabel'])").evaluateAll((btns) =>
        btns.map((b) => {
          const label = b.querySelector("[class*='actionLabel']")!;
          const lh = parseFloat(getComputedStyle(label).lineHeight);
          return { text: label.textContent, lines: Math.round(label.getBoundingClientRect().height / lh) };
        }),
      );
      expect(lines.length).toBeGreaterThanOrEqual(4);
      for (const l of lines) expect(l.lines, `${l.text} @${w}px`).toBeLessThanOrEqual(2);
      // Scroll the page to the end: the last rail card must end above the bottom navigation.
      const gap = await page.evaluate(() => {
        for (const e of document.querySelectorAll<HTMLElement>("*")) if (e.scrollHeight > e.clientHeight + 50 && getComputedStyle(e).overflowY !== "visible") e.scrollTop = 99999;
        const nav = document.querySelector('nav[aria-label="Glavna navigacija"]')!.getBoundingClientRect();
        const card = document.querySelector("[data-testid=home-rail] [data-mini-card]")!.getBoundingClientRect();
        return nav.top - card.bottom;
      });
      expect(gap, `rail card bottom vs nav @${w}px`).toBeGreaterThanOrEqual(0);
    });
  }

  test("catalog cover images are large enough to read (not hidden behind the CTA)", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/domov");
    for (const card of await page.locator("[data-catalog-card]").all()) {
      const cover = (await card.locator("img[class*='cover']").boundingBox())!;
      const cta = (await card.locator("[class*='cta']").boundingBox())!;
      const box = (await card.boundingBox())!;
      // Visible part of the cover above the CTA pill is a substantial area.
      const visibleH = Math.min(cta.y, box.y + box.height) - Math.max(cover.y, box.y);
      expect(visibleH).toBeGreaterThanOrEqual(80);
      expect(cover.width).toBeGreaterThanOrEqual(120);
    }
  });
});
