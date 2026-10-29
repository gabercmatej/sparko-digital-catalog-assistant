import { expect, test, type Page } from "@playwright/test";
import { CATEGORIES, LEAFLET_IDS, cardHref, leaflets } from "./leaflets-data";

const stageImg = (page: Page) => page.locator('[data-testid="leaflet-stage"]').locator(":scope > img");
const sw = (page: Page) => page.getByTestId("catalog-switch");
const input = (page: Page) => page.getByPlaceholder("Vprašaj Sparka o katalogu …");
const homeInput = (page: Page) => page.locator("#home-chat-input");
const chatLog = (page: Page) => page.getByRole("log", { name: "Pogovor s Sparkom" });
const userMsgs = (page: Page) => chatLog(page).locator('[data-role="user"]');
const assistantMsgs = (page: Page) => chatLog(page).locator('[data-role="assistant"]');
const storedConversations = (page: Page) => page.evaluate(() => (JSON.parse(localStorage.getItem("sparko:v2") ?? "{}").conversations ?? []).length as number);

async function freshHome(page: Page) {
  await page.goto("/domov");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/domov");
  await expect(page.locator("[data-home-composer]")).toBeVisible();
  await page.waitForLoadState("networkidle"); // hydrated: before that Enter would be a native form submit
}

function countChatRequests(page: Page) {
  const reqs: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/chat") reqs.push(r.url());
  });
  return reqs;
}

test.describe("home catalog carousel", () => {
  test("six cards in Home order with four categories, covers loaded, hrefs as specified", async ({ page }) => {
    await page.goto("/domov");
    const cards = page.locator("[data-catalog-card]");
    await expect(cards).toHaveCount(6);
    expect(await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-catalog-card")))).toEqual(LEAFLET_IDS);
    expect(await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-category")))).toEqual(CATEGORIES);
    expect(new Set(CATEGORIES).size).toBe(4);
    for (const [i, id] of LEAFLET_IDS.entries()) {
      const card = cards.nth(i);
      await expect(card).toHaveAttribute("href", cardHref(id));
      await expect(card.locator("[data-catalog-title]")).not.toHaveText("");
      await expect(card.locator("[data-catalog-dates]")).toHaveText(/\d+\.\s\d+\.\s– \d+\.\s\d+\.\s\d{4}/);
      await expect(card.locator("[data-catalog-cover] img")).toHaveAttribute("src", `/catalog/${id}/cover.webp`);
    }
    // The first covers are eager, the rest lazy: scroll the track to the end so every cover loads.
    await page.locator("[data-testid=catalog-carousel] ul").evaluate((el) => el.scrollTo({ left: el.scrollWidth, behavior: "instant" }));
    for (const img of await page.locator("[data-catalog-cover] img").all()) {
      await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.naturalWidth)).toBeGreaterThan(0);
    }
  });

  for (const [i, id] of LEAFLET_IDS.entries()) {
    test(`card ${i + 1} (${id}) opens that leaflet on page 1 with its image loaded`, async ({ page }) => {
      const rec = leaflets.find((l) => l.id === id)!;
      await page.goto("/domov");
      const card = page.locator(`[data-catalog-card="${id}"]`);
      await card.scrollIntoViewIfNeeded();
      await card.click();
      await expect(page).toHaveURL(id === LEAFLET_IDS[0] ? /\/letak$/ : new RegExp(`/letak\\?katalog=${id}$`));
      await expect(sw(page)).toHaveAttribute("data-catalog-id", id);
      await expect(page.getByTestId("page-indicator")).toHaveText(new RegExp(`^1 / ${rec.pageCount}$`));
      await expect(stageImg(page)).toHaveAttribute("src", new RegExp(`/catalog/${id}/`));
      await expect.poll(() => stageImg(page).evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth)).toBeGreaterThan(0);
      await expect(page.getByTestId("catalog-validity")).toBeVisible();
    });
  }

  test("/letak without a katalog parameter opens the first leaflet (spar-4426)", async ({ page }) => {
    await page.goto("/letak");
    await expect(sw(page)).toHaveAttribute("data-catalog-id", "spar-4426");
    await expect(stageImg(page)).toHaveAttribute("src", /\/catalog\/spar-4426\//);
  });

  test("scrolling the track moves to later cards and the last card can be reached", async ({ page }) => {
    await page.goto("/domov");
    const track = page.locator("[data-testid=catalog-carousel] ul");
    await expect(page.locator("[data-catalog-card]")).toHaveCount(6);
    expect(await track.evaluate((el) => el.scrollLeft)).toBe(0);
    await track.evaluate((el) => el.scrollBy({ left: el.clientWidth, behavior: "instant" }));
    await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(50);
    await expect(page.locator('[data-catalog-card="spar-online-4426"]')).toBeInViewport();
    await track.evaluate((el) => el.scrollTo({ left: el.scrollWidth, behavior: "instant" }));
    const last = page.locator('[data-catalog-card="spar-4326"]');
    await expect(last).toBeInViewport({ ratio: 0.95 });
    const m = await page.evaluate(() => {
      const t = document.querySelector("[data-testid=catalog-carousel] ul")!.getBoundingClientRect();
      const l = document.querySelector('[data-catalog-card="spar-4326"]')!.getBoundingClientRect();
      return { tr: t.right, lr: l.right, ll: l.left, tl: t.left };
    });
    expect(m.lr).toBeLessThanOrEqual(m.tr + 1);
    expect(m.ll).toBeGreaterThanOrEqual(m.tl - 1);
    // And back again.
    const before = await track.evaluate((el) => el.scrollLeft);
    await track.evaluate((el) => el.scrollBy({ left: -el.clientWidth, behavior: "instant" }));
    expect(await track.evaluate((el) => el.scrollLeft)).toBeLessThan(before);
    await expect(page.getByTestId("catalog-progress")).toBeAttached();
  });

  test.describe("hover-capable desktop pointer", () => {
    test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });
    test("previous / next buttons step through the cards", async ({ page }) => {
      await page.goto("/domov");
      const track = page.locator("[data-testid=catalog-carousel] ul");
      const next = page.getByTestId("catalog-next");
      const prev = page.getByTestId("catalog-prev");
      await expect(next).toBeVisible();
      await expect(prev).toBeDisabled();
      await next.click();
      await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(50);
      await expect(prev).toBeEnabled();
      for (let i = 0; i < 6 && (await next.isEnabled()); i++) {
        await next.click();
        await page.waitForTimeout(350);
      }
      await expect(next).toBeDisabled();
      await expect(page.locator('[data-catalog-card="spar-4326"]')).toBeInViewport({ ratio: 0.95 });
    });
  });
});

test.describe("leaflet switching via the picker", () => {
  test("every catalog opens on its own page 1 without a stale image from the previous one", async ({ page }) => {
    await page.goto("/letak");
    const order = ["interspar-1526", "spar-online-4426", "despar-koper-1626", "mega-spar-0826", "spar-4326", "spar-4126", "interspar-1426", "spar-4426"];
    const counts: Record<string, number> = Object.fromEntries(leaflets.map((l) => [l.id, l.pageCount]));
    let prevId = "spar-4426";
    for (const id of order) {
      // Move off page 1 first so a stale page would be visible.
      // (spar-online-4426 is a single page: nothing to move to.)
      const nextBtn = page.getByRole("button", { name: "Naslednja stran" });
      if (await nextBtn.count()) {
        await nextBtn.click();
        await expect(page.getByTestId("page-indicator")).toHaveText(/^2 \//);
      }
      await expect(stageImg(page)).toHaveAttribute("src", new RegExp(`/catalog/${prevId}/`));

      await sw(page).click();
      const dialog = page.getByRole("dialog", { name: "Izberi katalog" });
      await expect(dialog).toBeVisible();
      await dialog.locator(`[data-picker-catalog="${id}"]`).click();
      await expect(dialog).toHaveCount(0);
      await expect(sw(page)).toHaveAttribute("data-catalog-id", id);
      await expect(page.getByTestId("catalog-title")).not.toHaveText("");
      await expect(stageImg(page)).toHaveAttribute("src", new RegExp(`/catalog/${id}/`));
      const indicator = page.getByTestId("page-indicator");
      if (counts[id]) await expect(indicator).toHaveText(new RegExp(`^1 / ${counts[id]}$`));
      else await expect(indicator).toHaveText(/^1 \/ \d+$/);
      await expect.poll(() => stageImg(page).evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth)).toBeGreaterThan(0);
      expect(await stageImg(page).getAttribute("src")).not.toContain(`/catalog/${prevId}/`);
      prevId = id;
    }
  });

  test("the picker lists the six Home leaflets first, then the earlier catalogs, and marks the current one", async ({ page }) => {
    await page.goto("/letak?katalog=despar-koper-1626");
    await sw(page).click();
    const dialog = page.getByRole("dialog", { name: "Izberi katalog" });
    const ids = await dialog.locator("[data-picker-catalog]").evaluateAll((els) => els.map((e) => e.getAttribute("data-picker-catalog")));
    expect(ids).toEqual([...LEAFLET_IDS, "spar-4126", "interspar-1426"]);
    await expect(dialog.locator('[data-picker-catalog="despar-koper-1626"]')).toHaveAttribute("aria-current", "true");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(sw(page)).toHaveAttribute("data-catalog-id", "despar-koper-1626");
  });
});

test.describe("home composer", () => {
  test("Enter sends one question to the Chat tab and the deterministic answer appears", async ({ page }) => {
    await freshHome(page);
    const reqs = countChatRequests(page);
    await homeInput(page).fill("Koliko stane mleko?");
    await homeInput(page).press("Enter");
    await expect(page).toHaveURL(/\/$/);
    await expect(userMsgs(page)).toHaveCount(1);
    await expect(userMsgs(page).first()).toContainText("Koliko stane mleko?");
    await expect(assistantMsgs(page).last()).not.toContainText("Sparko piše", { timeout: 15_000 });
    await expect(assistantMsgs(page)).toHaveCount(1);
    expect((await assistantMsgs(page).last().innerText()).trim().length).toBeGreaterThan(0);
    expect(reqs.length).toBe(1);
    await expect(input(page)).toHaveValue("");
  });

  test("the Send button works too and swaps with the mic when empty", async ({ page }) => {
    await freshHome(page);
    const reqs = countChatRequests(page);
    const btn = page.locator("[data-home-composer] button");
    await expect(btn).toHaveAttribute("data-action", "mic");
    await homeInput(page).fill("Kje je zaseka?");
    await expect(btn).toHaveAttribute("data-action", "send");
    await expect(btn).toHaveAttribute("aria-label", "Pošlji");
    await btn.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(userMsgs(page)).toHaveCount(1);
    await expect(userMsgs(page).first()).toContainText("Kje je zaseka?");
    await expect(assistantMsgs(page).last()).not.toContainText("Sparko piše", { timeout: 15_000 });
    expect(reqs.length).toBe(1);
  });

  test("empty or blank submit does nothing", async ({ page }) => {
    await freshHome(page);
    const reqs = countChatRequests(page);
    await homeInput(page).press("Enter");
    await homeInput(page).fill("   ");
    await homeInput(page).press("Enter");
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/\/domov$/);
    expect(reqs.length).toBe(0);
    expect(await storedConversations(page)).toBe(0);
  });

  test("a double Enter sends exactly once", async ({ page }) => {
    await freshHome(page);
    const reqs = countChatRequests(page);
    await homeInput(page).fill("zaseka");
    await homeInput(page).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(userMsgs(page)).toHaveCount(1);
    await expect(assistantMsgs(page).last()).not.toContainText("Sparko piše", { timeout: 15_000 });
    expect(reqs.length).toBe(1);
  });

  test("a Home question starts a new conversation (previous messages absent, history kept)", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.goto("/");
    await input(page).fill("zaseka");
    await input(page).press("Enter");
    await expect(assistantMsgs(page).last()).not.toContainText("Sparko piše", { timeout: 15_000 });
    await expect(userMsgs(page)).toHaveCount(1);

    await page.getByRole("navigation", { name: "Glavna navigacija" }).getByRole("link", { name: "Domov" }).click();
    await expect(page).toHaveURL(/\/domov$/);
    const reqs = countChatRequests(page);
    await homeInput(page).fill("Koliko stane mleko?");
    await homeInput(page).press("Enter");
    await expect(page).toHaveURL(/\/$/);
    await expect(userMsgs(page)).toHaveCount(1);
    await expect(userMsgs(page).first()).toContainText("Koliko stane mleko?");
    await expect(assistantMsgs(page).last()).not.toContainText("Sparko piše", { timeout: 15_000 });
    expect(reqs.length).toBe(1);
    expect(await storedConversations(page)).toBe(2);
  });

  test("rapid repeated submits from Home create exactly one conversation", async ({ page }) => {
    await freshHome(page);
    const reqs = countChatRequests(page);
    await homeInput(page).fill("Koliko stane mleko?");
    const send = page.locator("[data-home-composer] button[data-action='send']");
    await Promise.all([send.click({ timeout: 3000 }).catch(() => {}), send.click({ force: true }).catch(() => {}), homeInput(page).press("Enter").catch(() => {})]);
    await expect(page).toHaveURL(/\/$/);
    await expect(userMsgs(page)).toHaveCount(1);
    await expect(assistantMsgs(page).last()).not.toContainText("Sparko piše", { timeout: 15_000 });
    expect(reqs.length).toBe(1);
    expect(await storedConversations(page)).toBe(1);
  });

  test("the four quick actions still exist and work", async ({ page }) => {
    await page.goto("/domov");
    await expect(page.locator('[data-home-zone="actions"] button')).toHaveCount(4);
    await expect(page.locator("[data-chat-entry]")).toHaveCount(0);
    await page.getByRole("button", { name: "Kaj je najbolj znižano" }).click();
    await expect(page.getByRole("tab", { name: "Izdelki" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Najbolj znižano", exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Kaj je novega v katalogu" }).click();
    await expect(page.getByRole("heading", { name: "Novo v katalogu", exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Poglej izdelke po kategoriji" }).click();
    await expect(page.getByRole("dialog", { name: "Izberi kategorijo" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Kje je najbližji SPAR" }).click();
    await expect(page.getByRole("dialog", { name: "Najbližji SPAR" })).toBeVisible();
  });
});
