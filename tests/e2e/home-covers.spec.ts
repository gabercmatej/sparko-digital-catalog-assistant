import { expect, test } from "@playwright/test";
import { LEAFLET_IDS } from "./leaflets-data";

const COVERS = LEAFLET_IDS.map((id) => `/catalog/${id}/cover.webp`);

for (const w of [360, 390, 430, 1280]) {
  test.describe(`home catalog covers @${w}px`, () => {
    test.use({ viewport: { width: w, height: 800 } });

    test("all six cards show the complete, undistorted cover; equal height; CTA visible", async ({ page }) => {
      await page.goto("/domov");
      const cards = page.locator("[data-catalog-card]");
      await expect(cards).toHaveCount(6);
      const heights: number[] = [];
      for (let i = 0; i < 6; i++) {
        const card = cards.nth(i);
        await card.scrollIntoViewIfNeeded();
        await expect(card).toBeVisible();
        const img = card.locator("img[class*='cover']");
        await expect(img).toBeVisible();
        expect(await img.getAttribute("src")).toBe(COVERS[i]);
        await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
        const info = await img.evaluate((el: HTMLImageElement) => {
          // Layout size (offsetWidth/Height) of the cover image;
          // its rendered aspect ratio must equal the natural one.
          return { nw: el.naturalWidth, nh: el.naturalHeight, w: el.offsetWidth, h: el.offsetHeight, fit: getComputedStyle(el).objectFit };
        });
        expect(info.nw, `cover ${i} loaded`).toBeGreaterThan(0);
        expect(info.fit).not.toBe("cover");
        expect(info.fit).not.toBe("fill");
        // Rendered box has the natural aspect ratio (nothing cropped, nothing stretched).
        expect(Math.abs(info.w / info.h / (info.nw / info.nh) - 1)).toBeLessThan(0.02);
        await expect(card.getByText("Odpri katalog", { exact: true })).toBeVisible();
        await expect(card.locator("[role=img][data-category]")).toBeVisible();
        heights.push((await card.boundingBox())!.height);
      }
      for (const h of heights) expect(Math.abs(heights[0] - h)).toBeLessThan(1);
      expect(heights[0]).toBeGreaterThanOrEqual(150);
      expect(heights[0]).toBeLessThanOrEqual(470); // --cat-max
    });
  });
}

test("clicking a catalog card opens that leaflet", async ({ page }) => {
  await page.goto("/domov");
  await page.locator("[data-catalog-card]").nth(1).click();
  await expect(page).toHaveURL(/\/letak\?katalog=interspar-1526/);
});
