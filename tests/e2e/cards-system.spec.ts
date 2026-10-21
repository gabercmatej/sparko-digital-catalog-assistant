import { expect, test, type Locator, type Page } from "@playwright/test";
import { offerOf, pagesWithProducts, primary, productsByPage, secondary } from "./catalog-data";

const SPAR_IDS = productsByPage(primary.id).get(pagesWithProducts(primary.id)[0])!.slice(0, 3);
const IS_IDS = productsByPage(secondary.id).get(pagesWithProducts(secondary.id)[0])!.slice(0, 2);

async function seed(page: Page) {
  const ids = [...SPAR_IDS, ...IS_IDS];
  await page.goto("/");
  await page.evaluate(
    (saved) =>
      localStorage.setItem("sparko:v2", JSON.stringify({ v: 1, saved, conversations: [], activeConversationId: null, settings: { spPlus: "unset", leafletHintSeen: true } })),
    ids.map((id, i) => ({ productId: id, offerId: offerOf(id), savedAt: 1_700_000_000_000 + i })),
  );
}

type Box = { x: number; y: number; width: number; height: number };
type Geo = { id: string | null; card: Box; badge: Box | null; pack: Box | null; pill: Box | null };

async function geometry(cards: Locator): Promise<Geo[]> {
  return cards.evaluateAll((els) =>
    els.map((el) => {
      const r = (q: string) => {
        const e = el.querySelector(q);
        if (!e) return null;
        const b = e.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      };
      const c = el.getBoundingClientRect();
      return {
        id: el.getAttribute("data-product-id"),
        card: { x: c.x, y: c.y, width: c.width, height: c.height },
        badge: r("[data-retailer]"),
        pack: r("[data-card-pack]"),
        pill: r('[data-price-pill="now"]'),
      };
    }),
  );
}

const cx = (r: Box) => r.x + r.width / 2;
const cy = (r: Box) => r.y + r.height / 2;

function expectCorners(list: Geo[], where: string) {
  expect(list.length, `${where}: has mini cards`).toBeGreaterThan(0);
  for (const g of list) {
    const midX = g.card.x + g.card.width / 2;
    const midY = g.card.y + g.card.height / 2;
    expect(g.badge, `${where} ${g.id}: retailer badge exists`).not.toBeNull();
    expect(cx(g.badge!), `${where} ${g.id}: badge in left half`).toBeLessThan(midX);
    expect(cy(g.badge!), `${where} ${g.id}: badge in top half`).toBeLessThan(midY);
    expect(g.pill, `${where} ${g.id}: price pill exists`).not.toBeNull();
    expect(cx(g.pill!), `${where} ${g.id}: pill in right half`).toBeGreaterThan(midX);
    expect(cy(g.pill!), `${where} ${g.id}: pill in bottom half`).toBeGreaterThan(midY);
    if (g.pack) {
      expect(cx(g.pack), `${where} ${g.id}: pack in left half`).toBeLessThan(midX);
      expect(cy(g.pack), `${where} ${g.id}: pack in bottom half`).toBeGreaterThan(midY);
    }
  }
}

function expectSamePillY(list: Geo[], where: string) {
  const ys = list.filter((g) => g.pill).map((g) => g.pill!.y);
  expect(ys.length).toBeGreaterThan(1);
  for (const y of ys) expect(Math.abs(y - ys[0]), `${where}: pill y aligned across the rail`).toBeLessThanOrEqual(1);
}

/** All four corner radii of every price pill on the page must be 0px. */
async function expectSquarePills(page: Page, where: string) {
  const radii = await page.evaluate(() =>
    [...document.querySelectorAll("[data-price-pill]")].flatMap((p) => {
      const cs = getComputedStyle(p);
      return [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius];
    }),
  );
  expect(radii.length, `${where}: has price pills`).toBeGreaterThan(0);
  for (const r of radii) expect(r, `${where}: price pill radius`).toBe("0px");
}

const homeRail = (page: Page) => page.locator("[data-testid=home-rail] [data-mini-card]");
const chatCarousel = (page: Page) => page.locator('section[aria-label="Izdelki iz kataloga"] [data-mini-card]');

test("Home rail: badge top-left, pack bottom-left, price bottom-right; prices share one baseline; square pills", async ({ page }) => {
  await page.goto("/domov");
  await expect(homeRail(page).first()).toBeVisible();
  const g = await geometry(homeRail(page));
  expectCorners(g, "home rail");
  expectSamePillY(g, "home rail");
  await expectSquarePills(page, "home");
});

test("Home rail keeps the card layout in the Izdelki view too", async ({ page }) => {
  await page.goto("/domov");
  await page.getByRole("tab", { name: "Izdelki" }).click();
  await expect(homeRail(page).first()).toBeVisible();
  const g = await geometry(homeRail(page));
  expectCorners(g, "home rail (Izdelki)");
  expectSamePillY(g, "home rail (Izdelki)");
  await expectSquarePills(page, "home (Izdelki)");
});

test("Sparko chat welcome carousel: same corner layout, aligned prices, square pills", async ({ page }) => {
  await page.goto("/");
  await expect(chatCarousel(page).first()).toBeVisible();
  const g = await geometry(chatCarousel(page));
  expectCorners(g, "chat carousel");
  expectSamePillY(g, "chat carousel");
  await expectSquarePills(page, "chat");
});

test("Moj katalog recommendation rail: same corner layout, aligned prices, square pills", async ({ page }) => {
  await seed(page);
  await page.goto("/moj-katalog");
  const rail = page.locator("[data-reco-rail]").first();
  if (!(await rail.isVisible().catch(() => false))) {
    const tab = page.getByRole("tab", { name: "Priporočila zate" });
    if (await tab.count()) await tab.click();
  }
  await expect(rail).toBeVisible();
  const cards = rail.locator("[data-mini-card]");
  await expect(cards.first()).toBeVisible();
  const g = await geometry(cards);
  expectCorners(g, "moj-katalog reco rail");
  if (g.length > 1) expectSamePillY(g, "moj-katalog reco rail");
  await expectSquarePills(page, "moj-katalog");
});

test("Moj katalog saved rows: price pills are square", async ({ page }) => {
  await seed(page);
  await page.goto("/moj-katalog");
  await expect(page.locator("[data-price-pill]").first()).toBeVisible();
  await expectSquarePills(page, "moj-katalog rows");
});
