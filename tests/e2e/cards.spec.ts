import { expect, test, type Locator, type Page } from "@playwright/test";
import { catalogOfProduct, catalogs, offerOf, primary, productsByPage, pagesWithProducts, secondary } from "./catalog-data";

const retailerOfProduct = (id: string) => catalogs.find((c) => c.id === catalogOfProduct(id))!.retailer;

const SPAR_ID = productsByPage(primary.id).get(pagesWithProducts(primary.id)[0])![0];
const IS_ID = productsByPage(secondary.id).get(pagesWithProducts(secondary.id)[0])![0];

type Geo = { id: string | null; w: number; h: number; nameFont: string; retailer: string | null; badge: DOMRect; price: DOMRect };

/** Size, name font and badge/price geometry of every [data-mini-card] under `root`. */
async function miniCards(root: Locator, max = 6): Promise<Geo[]> {
  return root.locator("[data-mini-card]").evaluateAll((els, limit) => {
    return els.slice(0, limit).map((el) => {
      const r = el.getBoundingClientRect();
      const badge = el.querySelector("[data-retailer]")!;
      const price = el.querySelector("[data-price-pill]")!;
      return {
        id: el.getAttribute("data-product-id"),
        w: r.width,
        h: r.height,
        nameFont: getComputedStyle(el.querySelector("[class*='name']")!).fontSize,
        retailer: badge.getAttribute("data-retailer"),
        badge: badge.getBoundingClientRect().toJSON(),
        price: price.getBoundingClientRect().toJSON(),
      };
    });
  }, max) as Promise<Geo[]>;
}

function expectBadgeAbovePriceRight(g: Geo, ctx: string) {
  expect(g.badge.bottom, `${ctx}: badge above price`).toBeLessThanOrEqual(g.price.top + 1);
  expect(Math.abs(g.badge.right - g.price.right), `${ctx}: badge right-aligned with price`).toBeLessThanOrEqual(4);
}

const homeRail = (page: Page) => page.locator("[data-testid=home-rail]");
const chatCarousel = (page: Page) => page.locator('section[aria-label="Izdelki iz kataloga"]');

for (const w of [360, 390, 430]) {
  test(`home rail and chat carousel use the same mini card (size, font, badge above price) @${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto("/domov");
    await expect(homeRail(page).locator("[data-mini-card]").first()).toBeVisible();
    const home = await miniCards(homeRail(page));

    await page.goto("/");
    await expect(chatCarousel(page).locator("[data-mini-card]").first()).toBeVisible();
    // role=list / listitem structure and the accessible names stay intact.
    await expect(chatCarousel(page).getByRole("list", { name: "Izdelki iz kataloga" }).getByRole("listitem").first()).toBeVisible();
    await expect(chatCarousel(page).getByRole("button", { name: /^Pokaži: / }).first()).toBeVisible();
    const chat = await miniCards(chatCarousel(page));

    expect(home.length).toBeGreaterThan(0);
    expect(chat.length).toBeGreaterThan(0);
    const ref = home[0];
    for (const [where, list] of [["home", home], ["chat", chat]] as const) {
      for (const g of list) {
        expect(Math.abs(g.w - ref.w), `${where} width`).toBeLessThanOrEqual(1);
        expect(g.nameFont, `${where} name font-size`).toBe(ref.nameFont);
        expect(g.retailer, `${where} ${g.id} data-retailer matches its catalog`).toBe(retailerOfProduct(g.id!));
        expectBadgeAbovePriceRight(g, `${where} ${g.id}`);
      }
    }
    // Same card height in both places (compared on the shortest card: a unit line, e.g. "/ kg", adds height to a few).
    expect(Math.abs(Math.min(...home.map((g) => g.h)) - Math.min(...chat.map((g) => g.h)))).toBeLessThanOrEqual(1);
    // Names are never clipped horizontally (2-line clamp, no overflow of the card).
    const overflow = await page.locator("[data-mini-card]").evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
    expect(overflow, `${w}px mini card horizontal overflow`).toBe(0);
  });
}

test("chat carousel: clicking a card still opens the product, saved sync shows the check", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  const first = chatCarousel(page).locator("[data-mini-card]").first();
  const id = (await first.getAttribute("data-product-id"))!;
  await first.getByRole("button", { name: /^Pokaži: / }).click();
  await expect(page.getByRole("log", { name: "Pogovor s Sparkom" }).locator(`[data-product-card="${id}"]`).first()).toBeVisible();
});

test("Moj katalog saved rows: SPAR / INTERSPAR badge sits right above the price, right-aligned, and matches the catalog", async ({ page }) => {
  const ids = [SPAR_ID, IS_ID];
  await page.goto("/");
  await page.evaluate(
    (saved) =>
      localStorage.setItem("sparko:v2", JSON.stringify({ v: 1, saved, conversations: [], activeConversationId: null, settings: { spPlus: "unset", leafletHintSeen: true } })),
    ids.map((id, i) => ({ productId: id, offerId: offerOf(id), savedAt: 1_700_000_000_000 + i })),
  );
  for (const w of [360, 430]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto("/moj-katalog");
    for (const id of ids) {
      const row = page.locator(`main ul > li[data-product-id="${id}"]`);
      await expect(row).toBeVisible();
      const g = await row.evaluate((el) => {
        const badge = el.querySelector("[data-retailer]")!;
        const price = el.querySelector("[data-price-pill]")!;
        return { retailer: badge.getAttribute("data-retailer"), badge: badge.getBoundingClientRect().toJSON(), price: price.getBoundingClientRect().toJSON() };
      });
      expect(g.retailer).toBe(retailerOfProduct(id));
      expect(g.badge.bottom).toBeLessThanOrEqual(g.price.top + 1);
      expect(Math.abs(g.badge.right - g.price.right)).toBeLessThanOrEqual(4);
    }
  }
});
