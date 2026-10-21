import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { offerOf } from "./catalog-data";

type RawOffer = { productId: string };
const ids = (JSON.parse(readFileSync("src/data/catalog.json", "utf8")) as { offers: RawOffer[] }).offers.slice(0, 3).map((o) => o.productId);

async function seed(page: Page) {
  await page.goto("/");
  await page.evaluate(
    (saved) =>
      localStorage.setItem("sparko:v2", JSON.stringify({ v: 1, saved, conversations: [], activeConversationId: null, settings: { spPlus: "unset", leafletHintSeen: true } })),
    ids.map((id, i) => ({ productId: id, offerId: offerOf(id), savedAt: 1_700_000_000_000 + i })),
  );
}

type Badge = { text: string; children: number; fontSizes: number; dy: number; dx: number; lines: number };

/**
 * Every visible price badge: one run of text ("7,19 €": no separately sized / raised € element), on one line, with the
 * digits' cap block centred vertically (dy) and the text centred horizontally (dx) in the badge.
 */
function badges(page: Page): Promise<Badge[]> {
  return page.evaluate(() => {
    const ctx = document.createElement("canvas").getContext("2d")!;
    const out: Badge[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("[data-price]")) {
      const badge = (el.closest("[data-price-pill]") as HTMLElement | null) ?? el;
      const r = badge.getBoundingClientRect();
      if (!r.height || r.bottom < 0 || r.top > innerHeight) continue;
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize);
      ctx.font = `${cs.fontWeight} 200px ${cs.fontFamily}`;
      const cap = (ctx.measureText("0").actualBoundingBoxAscent / 200) * size;
      // Baseline: a zero-size inline-block probe inside a temporary inline wrapper (the badge may be a flex container).
      const wrap = document.createElement("span");
      const probe = document.createElement("span");
      probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
      const kids = [...el.childNodes];
      kids.forEach((n) => wrap.appendChild(n));
      wrap.appendChild(probe);
      el.appendChild(wrap);
      const base = probe.getBoundingClientRect().top;
      probe.remove();
      kids.forEach((n) => el.insertBefore(n, wrap));
      wrap.remove();
      const range = document.createRange();
      range.selectNodeContents(el);
      const t = range.getBoundingClientRect();
      out.push({
        text: el.textContent ?? "",
        children: el.children.length,
        fontSizes: new Set([...el.querySelectorAll("*")].map((c) => getComputedStyle(c).fontSize).concat(cs.fontSize)).size,
        dy: base - cap - r.top - (r.bottom - base),
        dx: t.left - r.left - (r.right - t.right),
        lines: range.getClientRects().length,
      });
    }
    return out;
  });
}

function expectCentred(list: Badge[]) {
  expect(list.length).toBeGreaterThan(0);
  for (const b of list) {
    expect(b.text).toMatch(/^\d+,\d{2} €$/);
    expect(b.children).toBe(0);
    expect(b.fontSizes).toBe(1);
    expect(b.lines).toBe(1);
    expect(Math.abs(b.dy), `vertical offset of ${b.text}`).toBeLessThanOrEqual(1.2);
    expect(Math.abs(b.dx), `horizontal offset of ${b.text}`).toBeLessThanOrEqual(1.2);
  }
}

test("price badges: the € is the digits' size and baseline, and the price is centred (Home, rail, Moj katalog)", async ({ page }) => {
  await seed(page);
  await page.goto("/domov");
  await page.getByRole("tab", { name: "Izdelki" }).click();
  await expect(page.locator("[data-price]").first()).toBeVisible();
  expectCentred(await badges(page));
  await page.goto("/moj-katalog");
  await expect(page.locator("main [data-price-pill] [data-price]").first()).toBeVisible();
  expectCentred(await badges(page));
});

test("price badges: chat carousel and product card share the same treatment", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  const input = page.getByPlaceholder("Vprašaj Sparka o katalogu …");
  await input.fill("Nutella");
  await input.press("Enter");
  await expect(page.locator("[data-price-block] [data-price]").first()).toBeVisible({ timeout: 15_000 });
  expectCentred(await badges(page));
});

test("long prices stay on one line inside their badge", async ({ page }) => {
  await seed(page);
  await page.goto("/domov");
  await page.getByRole("tab", { name: "Izdelki" }).click();
  await expect(page.locator("[data-price]").first()).toBeVisible();
  for (const text of ["12,99 €", "129,99 €"]) {
    const ok = await page.evaluate((t) => {
      return [...document.querySelectorAll<HTMLElement>("[data-price]")].every((el) => {
        el.textContent = t;
        const badge = (el.closest("[data-price-pill]") as HTMLElement | null) ?? el;
        const range = document.createRange();
        range.selectNodeContents(el);
        const tr = range.getBoundingClientRect();
        const br = badge.getBoundingClientRect();
        return range.getClientRects().length <= 1 && tr.left >= br.left - 0.5 && tr.right <= br.right + 0.5;
      });
    }, text);
    expect(ok, text).toBe(true);
  }
});
