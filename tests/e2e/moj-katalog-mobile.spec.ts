import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { offerOf } from "./catalog-data";

type RawOffer = { productId: string; priceCents: number; priceUnit: string; regularPriceCents: number | null };
const rawOffers = (JSON.parse(readFileSync("src/data/catalog.json", "utf8")) as { offers: RawOffer[] }).offers;
const byId = (id: string) => rawOffers.find((o) => o.productId === id)!;
const eur = (c: number) => `${Math.floor(c / 100)},${String(c % 100).padStart(2, "0")} €`;

const KG = rawOffers.find((o) => o.priceUnit === "kg" && typeof o.regularPriceCents === "number" && o.regularPriceCents > o.priceCents)!.productId;
const PACKS = rawOffers.filter((o) => (o.priceUnit === "pack" || o.priceUnit === "kos") && o.productId !== KG);
const WITH_REG = PACKS.find((o) => typeof o.regularPriceCents === "number" && o.regularPriceCents > o.priceCents)!.productId;
const NO_REG = PACKS.find((o) => o.regularPriceCents == null)!.productId;
const SAVED = [WITH_REG, NO_REG, KG];

function expected(ids: string[]) {
  const total = ids.reduce((a, id) => a + byId(id).priceCents, 0);
  const sv = ids.reduce((a, id) => a + (typeof byId(id).regularPriceCents === "number" ? Math.max(0, byId(id).regularPriceCents! - byId(id).priceCents) : 0), 0);
  return { total: eur(total), savings: sv > 0 ? `−${eur(sv)}` : eur(sv) };
}

async function seed(page: Page, ids: string[], path = "/moj-katalog") {
  await page.goto("/");
  await page.evaluate(
    (saved) =>
      localStorage.setItem("sparko:v2", JSON.stringify({ v: 1, saved, conversations: [], activeConversationId: null, settings: { spPlus: "unset", leafletHintSeen: true } })),
    ids.map((id, i) => ({ productId: id, offerId: offerOf(id), savedAt: 1_700_000_000_000 + i })),
  );
  await page.goto(path);
}

const bar = (page: Page) => page.locator("[data-collection-summary]");
const nav = (page: Page) => page.getByRole("navigation", { name: "Glavna navigacija" });
const rowSel = "main li[data-product-id]:not([data-reco-item])";

test("total equals the sum of the saved card prices, per-kg included", async ({ page }) => {
  await seed(page, SAVED);
  const e = expected(SAVED);
  await expect(bar(page).locator("[data-total-price]")).toHaveText(e.total);
  await expect(bar(page).locator("[data-total-savings]")).toHaveText(e.savings);
  // The visible price pills on the cards add up to the same total.
  await expect(page.locator(rowSel)).toHaveCount(SAVED.length);
  const pills = await page.locator(`${rowSel} [data-price-pill='now'] [data-price]`).allTextContents();
  expect(pills.length).toBe(SAVED.length);
  const cents = pills.map((t) => Number(t.replace(/[^\d,]/g, "").replace(",", "")));
  expect(cents.reduce((a, b) => a + b, 0)).toBe(SAVED.reduce((a, id) => a + byId(id).priceCents, 0));
});

test("split bar: price white on red, savings red on yellow with a leading minus; halves centred and equal; no info / coverage text", async ({ page }) => {
  await seed(page, SAVED);
  const sv = bar(page).locator("[data-total-savings]");
  await expect(sv).toHaveText(/^−\d+,\d{2} €$/);
  const red = await page.evaluate(() => {
    const el = document.createElement("i");
    el.style.color = "var(--c-red)";
    document.body.appendChild(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c;
  });
  expect(await sv.evaluate((el) => getComputedStyle(el).color)).toBe(red);
  const halves = await bar(page).evaluate((el) =>
    [...el.children].map((c) => ({
      bg: getComputedStyle(c).backgroundColor,
      label: getComputedStyle(c.querySelector("span")!).color,
      value: getComputedStyle(c.querySelector("strong")!).color,
    })),
  );
  expect(halves[0]).toEqual({ bg: red, label: "rgb(255, 255, 255)", value: "rgb(255, 255, 255)" }); // SPAR red, white text
  expect(halves[1]).toEqual({ bg: "rgb(255, 229, 0)", label: red, value: red }); // catalog discount-label yellow, red text

  const barBox = (await bar(page).boundingBox())!;
  const cols = bar(page).locator(":scope > div");
  await expect(cols).toHaveCount(2);
  const widths: number[] = [];
  for (let i = 0; i < 2; i++) {
    const col = (await cols.nth(i).boundingBox())!;
    widths.push(col.width);
    const label = (await cols.nth(i).locator("span").first().boundingBox())!;
    const value = (await cols.nth(i).locator("strong").boundingBox())!;
    const cx = col.x + col.width / 2;
    expect(Math.abs(label.x + label.width / 2 - cx)).toBeLessThanOrEqual(2);
    expect(Math.abs(value.x + value.width / 2 - cx)).toBeLessThanOrEqual(2);
  }
  expect(Math.abs(widths[0] - widths[1])).toBeLessThanOrEqual(1);
  // The halves fill the bar edge to edge with no gap, at the same height.
  const [h0, h1] = [(await cols.nth(0).boundingBox())!, (await cols.nth(1).boundingBox())!];
  expect(Math.abs(h0.x - barBox.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(h1.x - (h0.x + h0.width))).toBeLessThanOrEqual(0.5);
  expect(Math.abs(h1.x + h1.width - (barBox.x + barBox.width))).toBeLessThanOrEqual(0.5);
  expect(Math.abs(h0.height - barBox.height)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(h1.height - barBox.height)).toBeLessThanOrEqual(0.5);
  expect(barBox.height).toBeGreaterThanOrEqual(52);
  expect(barBox.height).toBeLessThanOrEqual(72);

  await expect(bar(page).getByRole("button")).toHaveCount(0);
  await expect(bar(page)).not.toContainText(/\bod\b/);
});

test("bar is in the viewport directly above the bottom nav", async ({ page }) => {
  await seed(page, SAVED);
  await expect(bar(page)).toBeVisible();
  const b = (await bar(page).boundingBox())!;
  const n = (await nav(page).boundingBox())!;
  const vh = page.viewportSize()!.height;
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.y + b.height).toBeLessThanOrEqual(vh);
  expect(Math.abs(b.y + b.height - n.y)).toBeLessThanOrEqual(1);
  // A soft shadow lifts the bar (cast upward); the shared bottom nav gets none.
  expect(await bar(page).evaluate((el) => getComputedStyle(el).boxShadow)).toMatch(/^rgba\(0, 0, 0, 0\.22\) 0px -5px 18px/);
  expect(await nav(page).evaluate((el) => getComputedStyle(el).boxShadow)).toBe("none");
});

test("last row scrolls fully above the bar; removing an item updates the total immediately", async ({ page }) => {
  await seed(page, SAVED);
  await expect(page.locator(rowSel)).toHaveCount(SAVED.length);
  await page.locator("main .page-scroll").first().evaluate((el) => (el.scrollTop = el.scrollHeight));
  const lb = (await page.locator(rowSel).last().boundingBox())!;
  const bb = (await bar(page).boundingBox())!;
  expect(lb.y + lb.height).toBeLessThanOrEqual(bb.y + 1);

  await page.locator("main .page-scroll").first().evaluate((el) => (el.scrollTop = 0));
  await page.getByRole("button", { name: "Odstrani izdelke" }).click();
  await page.getByRole("button", { name: /^Odstrani: / }).first().click();
  await expect(page.locator(rowSel)).toHaveCount(SAVED.length - 1);
  const left = await page.locator(rowSel).evaluateAll((els) => els.map((e) => e.getAttribute("data-product-id")!));
  const e = expected(left);
  await expect(bar(page).locator("[data-total-price]")).toHaveText(e.total);
  await expect(bar(page).locator("[data-total-savings]")).toHaveText(e.savings);
});

test("zero savings show 0,00 € without a minus", async ({ page }) => {
  await seed(page, [NO_REG]);
  await expect(bar(page).locator("[data-total-savings]")).toHaveText("0,00 €");
});

test("the summary is not present on /domov or /", async ({ page }) => {
  await seed(page, SAVED, "/domov");
  await expect(nav(page)).toBeVisible();
  await expect(bar(page)).toHaveCount(0);
  await page.goto("/");
  await expect(bar(page)).toHaveCount(0);
});

test("summary labels and amounts are visible; no recommendation info icon; no '1 kg · za kg'", async ({ page }) => {
  await seed(page, SAVED);
  for (const t of ["Skupni znesek", "Skupni prihranek"]) await expect(bar(page).getByText(t)).toBeVisible();
  await expect(bar(page).locator("[data-total-price]")).toBeVisible();
  await expect(bar(page).locator("[data-total-savings]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Zakaj ta priporočila?" })).toHaveCount(0);
  await expect(page.locator("[data-reco-rail]")).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/1\s?kg\s*·\s*za kg/);
});
