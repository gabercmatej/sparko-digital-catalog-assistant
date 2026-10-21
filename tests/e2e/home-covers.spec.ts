import { expect, test } from "@playwright/test";

const COVERS = ["/catalog/spar-4126/cover.webp", "/catalog/interspar-1426/cover.webp"];

for (const w of [360, 390, 430, 1280]) {
  test.describe(`home catalog covers @${w}px`, () => {
    test.use({ viewport: { width: w, height: 800 } });

    test("both cards show the complete, undistorted cover; equal height; CTA visible", async ({ page }) => {
      await page.goto("/domov");
      const cards = page.locator("[data-catalog-card]");
      await expect(cards).toHaveCount(2);
      const heights: number[] = [];
      for (let i = 0; i < 2; i++) {
        const card = cards.nth(i);
        await expect(card).toBeVisible();
        const img = card.locator("img[class*='cover']");
        await expect(img).toBeVisible();
        expect(await img.getAttribute("src")).toBe(COVERS[i]);
        const info = await img.evaluate((el: HTMLImageElement) => {
          // Layout size (offsetWidth/Height) of the cover image;
          // its rendered aspect ratio must equal the natural one.
          return { nw: el.naturalWidth, nh: el.naturalHeight, w: el.offsetWidth, h: el.offsetHeight, fit: getComputedStyle(el).objectFit };
        });
        expect(info.nw).toBeGreaterThan(0);
        expect(info.fit).not.toBe("cover");
        expect(info.fit).not.toBe("fill");
        // Rendered box has the natural aspect ratio (nothing cropped, nothing stretched).
        expect(Math.abs(info.w / info.h / (info.nw / info.nh) - 1)).toBeLessThan(0.02);
        await expect(card.getByText("Odpri katalog", { exact: true })).toBeVisible();
        await expect(card.locator("[data-retailer]")).toBeVisible();
        heights.push((await card.boundingBox())!.height);
      }
      expect(Math.abs(heights[0] - heights[1])).toBeLessThan(1);
      expect(heights[0]).toBeGreaterThanOrEqual(150);
      expect(heights[0]).toBeLessThanOrEqual(470); // --cat-max
    });
  });
}

test("clicking a catalog card opens that leaflet", async ({ page }) => {
  await page.goto("/domov");
  await page.locator("[data-catalog-card]").nth(1).click();
  await expect(page).toHaveURL(/\/letak\?katalog=interspar-1426/);
});
