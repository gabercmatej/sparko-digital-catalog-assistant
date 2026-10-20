import { expect, test, type Page } from "@playwright/test";
import { offerOf, primary, productsByPage, secondary, pagesWithProducts, retailerLabel } from "./catalog-data";

// Three SPAR products and one INTERSPAR product, derived from the data.
const SPAR_IDS = pagesWithProducts(primary.id)
  .flatMap((i) => productsByPage(primary.id).get(i)!)
  .slice(0, 3);
const IS_ID = productsByPage(secondary.id).get(pagesWithProducts(secondary.id)[0])![0];
const SAVED = [...SPAR_IDS, IS_ID];

async function seed(page: Page, productIds: string[], path = "/moj-katalog") {
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

const rows = (page: Page) => page.locator("main ul > li[data-product-id]");
const nav = (page: Page) => page.getByRole("navigation", { name: "Glavna navigacija" });

test("page header: menu, centred title, trash; the global logo header is replaced", async ({ page }) => {
  await seed(page, SAVED);
  await expect(page.getByRole("heading", { name: "Moj katalog", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Odstrani izdelke" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Več možnosti" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nov pogovor" })).toHaveCount(0);
  const title = (await page.getByRole("heading", { name: "Moj katalog", level: 1 }).boundingBox())!;
  const vp = page.viewportSize()!;
  expect(Math.abs(title.x + title.width / 2 - vp.width / 2)).toBeLessThan(6);
  // The menu button opens the sidebar.
  await page.getByRole("button", { name: "Odpri meni" }).click();
  await expect(page.getByRole("dialog", { name: "Meni" })).toBeVisible();
});

test("tabs, action buttons and the old subtitle / dock are gone", async ({ page }) => {
  await seed(page, SAVED);
  const tabs = page.getByRole("tablist");
  await expect(tabs.getByRole("tab", { name: `Moji izdelki (${SAVED.length})` })).toHaveAttribute("aria-selected", "true");
  await expect(tabs.getByRole("tab", { name: "Priporočila zate" })).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("link", { name: "Pokaži na letaku" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Deli seznam" })).toBeVisible();
  await expect(page.getByText("Tvoj izbor. Ideje zate.")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Odpri SPAR letak/ })).toHaveCount(0);
  // The green underline sits under the active tab.
  const under = await tabs.getByRole("tab", { name: /Moji izdelki/ }).evaluate((el) => getComputedStyle(el, "::after").backgroundColor);
  expect(under).not.toBe("rgba(0, 0, 0, 0)");
});

test("rows: grey list area, white rows with SPAR / INTERSPAR label, red price pill, no visible remove controls", async ({ page }) => {
  await seed(page, SAVED);
  await expect(rows(page)).toHaveCount(SAVED.length);
  for (const id of SAVED) {
    const row = page.locator(`#izdelek-${id}`);
    await expect(row.locator("[data-retailer]")).toHaveCount(1);
    await expect(row.locator('[data-price-pill="now"]')).toBeVisible();
    expect(await row.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)");
    const bg = await row.locator('[data-price-pill="now"]').evaluate((el) => getComputedStyle(el).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g)!.map(Number);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(60);
    expect(b).toBeLessThan(60);
    const h = (await row.boundingBox())!.height;
    expect(h).toBeGreaterThanOrEqual(76);
    expect(h).toBeLessThanOrEqual(110);
  }
  await expect(page.locator(`#izdelek-${IS_ID} [data-retailer="interspar"]`)).toBeVisible();
  await expect(page.locator(`#izdelek-${SPAR_IDS[0]} [data-retailer="spar"]`)).toBeVisible();
  // No remove / X controls in the normal state.
  await expect(rows(page).getByRole("button", { name: /Odstrani/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Odstrani:/ })).toHaveCount(0);
  // The list area behind the white rows is light grey.
  const area = await page.getByRole("region", { name: "Moji izdelki" }).evaluate((el) => getComputedStyle(el.parentElement!).backgroundColor);
  expect(area).not.toBe("rgb(255, 255, 255)");
});

test("trash toggles the removal mode: remove, count and bottom-nav badge update, 'Končano' leaves it", async ({ page }) => {
  await seed(page, SAVED);
  await expect(nav(page)).toContainText(String(SAVED.length));
  await page.getByRole("button", { name: "Odstrani izdelke" }).click();
  await expect(page.getByRole("button", { name: "Končano" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Odstrani:/ })).toHaveCount(SAVED.length);
  await page.getByRole("button", { name: /^Odstrani:/ }).first().click();
  await expect(rows(page)).toHaveCount(SAVED.length - 1);
  await expect(page.getByRole("tab", { name: `Moji izdelki (${SAVED.length - 1})` })).toBeVisible();
  await expect(nav(page)).toContainText(String(SAVED.length - 1));
  // Existing undo toast.
  await page.getByRole("button", { name: "Razveljavi" }).click();
  await expect(rows(page)).toHaveCount(SAVED.length);
  await page.getByRole("button", { name: "Končano" }).click();
  await expect(page.getByRole("button", { name: "Odstrani izdelke" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Odstrani:/ })).toHaveCount(0);
});

test("removing the last item leaves the removal mode and shows the friendly empty state", async ({ page }) => {
  await seed(page, [SPAR_IDS[0]]);
  await page.getByRole("button", { name: "Odstrani izdelke" }).click();
  await page.getByRole("button", { name: /^Odstrani:/ }).click();
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText("Tvoj katalog je še prazen")).toBeVisible();
  await expect(page.getByRole("link", { name: "Vprašaj Sparka" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "Odpri katalog" })).toHaveAttribute("href", "/domov");
  await expect(page.getByRole("button", { name: "Končano" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Odstrani izdelke" })).toBeDisabled();
});

test("kebab menu: 'Izprazni seznam' empties the list with an undo toast", async ({ page }) => {
  await seed(page, SAVED);
  await page.getByRole("button", { name: "Več možnosti" }).click();
  await expect(page.getByRole("menuitem", { name: "Deli seznam" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Izprazni seznam" }).click();
  await expect(rows(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Razveljavi" }).click();
  await expect(rows(page)).toHaveCount(SAVED.length);
});

test("'Pokaži na letaku' opens the leaflet at the first saved page; INTERSPAR-only lists open INTERSPAR", async ({ page }) => {
  await seed(page, SAVED);
  const firstPage = pagesWithProducts(primary.id).find((i) => productsByPage(primary.id).get(i)!.some((id) => SPAR_IDS.includes(id)))!;
  await page.getByRole("link", { name: "Pokaži na letaku" }).click();
  await expect(page).toHaveURL(new RegExp(`/letak\\?stran=${firstPage + 1}$`));
  await seed(page, [IS_ID]);
  await page.getByRole("link", { name: "Pokaži na letaku" }).click();
  await expect(page).toHaveURL(new RegExp(`/letak\\?katalog=${secondary.id}&stran=${pagesWithProducts(secondary.id)[0] + 1}$`));
  await expect(page.getByRole("button", { name: retailerLabel(secondary), exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("'Deli seznam' shares a plain-text list (navigator.share) and falls back to the clipboard with a toast", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  await seed(page, SAVED);
  // 1) navigator.share available.
  await page.evaluate(() => {
    (window as unknown as { __shared: unknown }).__shared = null;
    navigator.share = async (d) => {
      (window as unknown as { __shared: unknown }).__shared = d;
    };
  });
  await page.getByRole("button", { name: "Deli seznam" }).click();
  const shared = (await page.evaluate(() => (window as unknown as { __shared: { text: string } }).__shared)) as { text: string };
  expect(shared.text).toMatch(/ – \d+,\d{2} €/);
  expect(shared.text).toContain("(SPAR)");
  expect(shared.text).toContain("(INTERSPAR)");
  expect(shared.text.split("\n").length).toBe(SAVED.length + 1);
  // 2) no share API → clipboard + toast.
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    (window as unknown as { __clip: string }).__clip = "";
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t: string) => ((window as unknown as { __clip: string }).__clip = t) }, configurable: true });
  });
  await page.getByRole("button", { name: "Deli seznam" }).click();
  await expect(page.getByText("Seznam je kopiran v odložišče.")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __clip: string }).__clip)).toContain("(INTERSPAR)");
});

test("green recommendation band: premium green, heading, 'Poglej vse', '+' adds and flashes the new row", async ({ page }) => {
  await seed(page, [SPAR_IDS[0]]);
  const band = page.getByRole("region", { name: "Priporočila zate iz kataloga" });
  await band.scrollIntoViewIfNeeded();
  await expect(band.getByRole("heading", { name: "Priporočila zate iz kataloga" })).toBeVisible();
  const look = await band.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, img: cs.backgroundImage, radius: parseFloat(cs.borderTopLeftRadius) };
  });
  // Background is a green gradient (not white / transparent).
  expect(look.img).toContain("gradient");
  const greens = [...look.img.matchAll(/rgb\((\d+), (\d+), (\d+)\)/g)].map((m) => m.slice(1).map(Number));
  expect(greens.length).toBeGreaterThan(0);
  expect(greens.some(([r, g, b]) => g > r + 40 && g > b + 20)).toBe(true);
  expect(look.radius).toBeGreaterThanOrEqual(16);
  const cards = band.locator("[data-mini-card]");
  expect(await cards.count()).toBeGreaterThan(0);
  await expect(cards.first().locator("[data-retailer]")).toBeVisible();
  await expect(cards.first().evaluate((el) => getComputedStyle(el).backgroundColor)).resolves.toBe("rgb(255, 255, 255)");

  // "+" saves and flashes the new row in the list.
  const add = band.getByRole("button", { name: /^Dodaj v Moj katalog/ }).first();
  const id = await add.locator("xpath=ancestor::*[@data-mini-card]").getAttribute("data-product-id");
  await add.click();
  await expect(rows(page)).toHaveCount(2);
  await expect(page.locator(`#izdelek-${id}`)).toHaveAttribute("data-flash", "true");
  await expect(nav(page)).toContainText("2");
  await expect(page.getByRole("tab", { name: "Moji izdelki (2)" })).toBeVisible();
});

test("'Poglej vse' opens the recommendations tab: 2-column grid on green with reasons", async ({ page }) => {
  await seed(page, [SPAR_IDS[0]]);
  await page.getByRole("button", { name: /^Poglej vse/ }).click();
  await expect(page.getByRole("tab", { name: "Priporočila zate" })).toHaveAttribute("aria-selected", "true");
  const items = page.locator("main li[data-editorial], main li:has([data-mini-card])");
  const n = await items.count();
  expect(n).toBeGreaterThan(1);
  const xs = await page.locator("[data-mini-card]").evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().left)))]);
  expect(xs.length).toBe(2);
  await expect(page.getByRole("button", { name: /^Dodaj v Moj katalog/ }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Priporočila zate iz kataloga" })).toBeVisible();
  await page.getByRole("tab", { name: /Moji izdelki/ }).click();
  await expect(rows(page)).toHaveCount(1);
});

test("deep link #izdelek-<id> highlights the row", async ({ page }) => {
  await seed(page, SAVED, `/moj-katalog#izdelek-${SPAR_IDS[1]}`);
  await expect(page.locator(`#izdelek-${SPAR_IDS[1]}`)).toHaveAttribute("data-flash", "true");
});

test("tapping a row opens the product sheet", async ({ page }) => {
  await seed(page, SAVED);
  await page.locator(`#izdelek-${SPAR_IDS[0]}`).getByRole("button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").locator(`[data-product-card="${SPAR_IDS[0]}"]`)).toBeVisible();
});

for (const width of [360, 390, 430]) {
  test(`no horizontal overflow @${width}px (list, removal mode, recommendations tab)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await seed(page, SAVED);
    const overflow = () =>
      page.evaluate(() => [document.documentElement, ...document.querySelectorAll<HTMLElement>(".page-scroll, main, header, [role=tablist]")].some((e) => e.scrollWidth > e.clientWidth + 1));
    await page.waitForLoadState("networkidle");
    expect(await overflow()).toBe(false);
    await page.getByRole("button", { name: "Odstrani izdelke" }).click();
    expect(await overflow()).toBe(false);
    await page.getByRole("button", { name: "Končano" }).click();
    await page.getByRole("tab", { name: "Priporočila zate" }).click();
    expect(await overflow()).toBe(false);
  });
}
