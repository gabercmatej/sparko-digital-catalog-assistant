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
    await expect(page.getByRole("group", { name: "Kategorije" }).getByRole("button").first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-catalog-card]")).toHaveCount(0);
    await katalogi.click();
    await expect(page.locator("[data-catalog-card]")).toHaveCount(2);
  });

  test("Izdelki defaults to VSI and chips filter the list", async ({ page }) => {
    await page.getByRole("tab", { name: "Izdelki" }).click();
    const chips = page.getByRole("group", { name: "Kategorije" }).getByRole("button");
    const names = (await chips.allTextContents()).map((t) => t.trim());
    expect(names.slice(0, 6)).toEqual(["VSI", "Zajtrk", "Pekovsko pecivo", "Večerja", "Osnovna živila", "Mlečni izdelki"]);
    await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
    const list = page.getByTestId("home-list");
    expect(await list.locator("[data-retailer=spar]").count()).toBeGreaterThan(0);
    expect(await list.locator("[data-retailer=interspar]").count()).toBeGreaterThan(0);
    const all = await list.locator("[data-home-row]").count();
    await page.getByRole("button", { name: "Mlečni izdelki", exact: true }).click();
    await expect(page.getByRole("button", { name: "Mlečni izdelki", exact: true })).toHaveAttribute("aria-pressed", "true");
    const some = await list.locator("[data-home-row]").count();
    expect(some).toBeGreaterThan(0);
    expect(some).toBeLessThan(all);
    await page.getByRole("button", { name: "VSI", exact: true }).click();
    await expect(list.locator("[data-home-row]")).toHaveCount(all);
  });

  test("Najbolj znižano and Novo v katalogu switch to Izdelki", async ({ page }) => {
    for (const c of [
      { action: "Kaj je najbolj znižano", heading: "Najbolj znižano" },
      { action: "Kaj je novega v katalogu", heading: "Novo v katalogu" },
    ]) {
      const btn = page.getByRole("button", { name: c.action });
      await btn.click();
      await expect(btn).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("tab", { name: "Izdelki" })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("heading", { name: c.heading, exact: true }).first()).toBeVisible();
      await expect(page.locator("[data-home-row]").first()).toBeVisible();
      await expect(page.getByTestId("home-rail").locator("xpath=../div/h2")).toHaveText(c.heading);
    }
  });

  test("category button opens a dialog; picking Mlečni izdelki updates top list and rail", async ({ page }) => {
    await page.getByRole("button", { name: "Poglej izdelke po kategoriji" }).click();
    const dialog = page.getByRole("dialog", { name: "Izberi kategorijo" });
    await expect(dialog).toBeVisible();
    const options = (await dialog.getByRole("button").allTextContents()).map((t) => t.trim());
    expect(options[1]).toMatch(/^VSI/);
    await dialog.locator("[data-category=mlecni-izdelki]").click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Izdelki" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: "Mlečni izdelki", exact: true })).toHaveAttribute("aria-pressed", "true");
    const topIds = await page.locator("[data-home-row]").evaluateAll((els) => els.map((e) => e.getAttribute("data-product-id")));
    const railIds = await page.locator("[data-testid=home-rail] [data-mini-card]").evaluateAll((els) => els.map((e) => e.getAttribute("data-product-id")));
    expect(topIds.length).toBeGreaterThan(0);
    for (const id of railIds) expect(topIds).toContain(id);
    expect(railIds.length).toBeGreaterThan(0);
    await expect(page.getByTestId("home-rail").locator("[data-retailer]").first()).toBeVisible();
    // VSI restores everything
    await page.getByRole("button", { name: "Poglej izdelke po kategoriji" }).click();
    await page.getByRole("dialog").locator("[data-category=all]").click();
    expect(await page.locator("[data-home-row]").count()).toBeGreaterThan(topIds.length);
  });

  for (const w of [360, 390, 430]) {
    test(`middle section and rail do not move when the top changes @${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await page.goto("/domov");
      const mascot = page.locator("img[src*=sparko-mascot]");
      const firstAction = page.getByRole("button", { name: "Kaj je najbolj znižano" });
      const lastAction = page.getByRole("button", { name: "Kje je najbližji SPAR" });
      const rail = page.getByTestId("home-rail");
      const seg = page.getByRole("tablist", { name: "Prikaz" });
      const ys = async () => [mascot, firstAction, lastAction, rail, seg].map(async (l) => (await l.boundingBox())!.y);
      const snap = async () => Promise.all(await ys());
      await expect(page.locator("[data-catalog-card]").first()).toBeVisible();
      const base = await snap();
      const same = async (label: string) => {
        const now = await snap();
        now.forEach((y, i) => expect(Math.abs(y - base[i]), `${label} #${i} @${w}px`).toBeLessThanOrEqual(1));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      };
      await page.getByRole("tab", { name: "Izdelki" }).click();
      await expect(page.getByTestId("home-list")).toBeVisible();
      await same("Izdelki");
      await page.getByRole("button", { name: "Zajtrk", exact: true }).click();
      await same("Zajtrk");
      await page.getByRole("button", { name: "Mlečni izdelki", exact: true }).click();
      await same("Mlečni izdelki");
      await page.getByRole("button", { name: "Kaj je najbolj znižano" }).click();
      await same("znižano");
      await page.getByRole("button", { name: "Kaj je novega v katalogu" }).click();
      await same("novo");
      await page.getByRole("tab", { name: "Katalogi" }).click();
      await expect(page.locator("[data-catalog-card]").first()).toBeVisible();
      await same("Katalogi");
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

  test("catalog covers are shown whole inside the card (not cropped)", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/domov");
    for (const card of await page.locator("[data-catalog-card]").all()) {
      const cover = (await card.locator("img[class*=\"cover\"]").boundingBox())!;
      const box = (await card.boundingBox())!;
      expect(cover.x).toBeGreaterThanOrEqual(box.x - 0.5);
      expect(cover.y).toBeGreaterThanOrEqual(box.y - 0.5);
      expect(cover.x + cover.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
      expect(cover.y + cover.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
      const fits = await card.locator("img[class*=\"cover\"]").evaluate((img: HTMLImageElement) => getComputedStyle(img).objectFit !== "cover");
      expect(fits).toBe(true);
    }
  });
});
