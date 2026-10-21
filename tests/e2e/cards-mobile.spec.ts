import { expect, test, type Locator, type Page } from "@playwright/test";

const homeRail = (page: Page) => page.locator("[data-testid=home-rail] [data-mini-card]");
const chatCarousel = (page: Page) => page.locator('section[aria-label="Izdelki iz kataloga"] [data-mini-card]');

type Box = { x: number; y: number; width: number; height: number; right: number; bottom: number };
type Geo = { card: Box; badge: Box | null; pack: Box | null; pill: Box | null; nameLines: number };

async function geo(cards: Locator): Promise<Geo[]> {
  return cards.evaluateAll((els) =>
    els.slice(0, 6).map((el) => {
      const box = (e: Element | null) => {
        if (!e) return null;
        const b = e.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height, right: b.right, bottom: b.bottom };
      };
      const nameEl = el.querySelector<HTMLElement>("button > span:nth-of-type(3), [role=group] > span:nth-of-type(3)");
      let nameLines = 0;
      if (nameEl) {
        const lh = parseFloat(getComputedStyle(nameEl).lineHeight);
        nameLines = Math.round(nameEl.clientHeight / lh);
      }
      return {
        card: box(el)!,
        badge: box(el.querySelector("[data-retailer]")),
        pack: box(el.querySelector("[data-card-pack]")),
        pill: box(el.querySelector('[data-price-pill="now"]')),
        nameLines,
      };
    }),
  );
}

function expectCompact(list: Geo[], where: string) {
  expect(list.length, `${where}: has cards`).toBeGreaterThan(1);
  for (const g of list) {
    expect(g.card.width, `${where} width`).toBeLessThanOrEqual(124);
    expect(g.card.height, `${where} height`).toBeLessThanOrEqual(165);
    expect(Math.abs(g.card.height - list[0].card.height), `${where} equal heights`).toBeLessThanOrEqual(1);
    expect(Math.abs(g.pill!.bottom - list[0].pill!.bottom + (list[0].card.y - g.card.y)), `${where} price bottoms aligned`).toBeLessThanOrEqual(1);
    expect(g.pill!.right, `${where} price inside`).toBeLessThanOrEqual(g.card.right + 0.5);
    expect(g.pill!.bottom, `${where} price inside (bottom)`).toBeLessThanOrEqual(g.card.bottom + 0.5);
    expect(g.pack!.right, `${where} pack inside`).toBeLessThanOrEqual(g.card.right);
    expect(g.pack!.right, `${where} pack left of price`).toBeLessThanOrEqual(g.pill!.x + 1);
    expect(g.nameLines, `${where} name lines`).toBeLessThanOrEqual(2);
    expect(g.badge!.x, `${where} label left`).toBeGreaterThanOrEqual(g.card.x);
    expect(g.badge!.y, `${where} label top`).toBeGreaterThanOrEqual(g.card.y);
    expect(g.badge!.x - g.card.x, `${where} label top-left`).toBeLessThan(g.card.width / 4);
    expect(g.badge!.y - g.card.y, `${where} label top-left`).toBeLessThan(g.card.height / 4);
  }
}

test("phone: home rail and chat carousel share one compact card", async ({ page }) => {
  await page.goto("/domov");
  await expect(homeRail(page).first()).toBeVisible();
  const home = await geo(homeRail(page));
  expectCompact(home, "home");

  await page.goto("/");
  await expect(chatCarousel(page).first()).toBeVisible();
  const chat = await geo(chatCarousel(page));
  expectCompact(chat, "chat");

  expect(Math.abs(home[0].card.width - chat[0].card.width), "home/chat width").toBeLessThanOrEqual(1);
  expect(Math.abs(home[0].card.height - chat[0].card.height), "home/chat height").toBeLessThanOrEqual(1);

  // Desktop keeps the roomier card.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(chatCarousel(page).first()).toBeVisible();
  const wide = await geo(chatCarousel(page));
  expect(wide[0].card.width, "desktop card width").toBeGreaterThanOrEqual(130);
  expect(wide[0].card.width).toBeGreaterThan(chat[0].card.width);
});
