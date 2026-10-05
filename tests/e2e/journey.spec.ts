import { expect, test, type Page } from "@playwright/test";

const SKUTA = "sb-skuta-1kg";

async function fresh(page: Page, path = "/") {
  await page.goto(path);
  await page.evaluate(() => localStorage.clear());
  await page.goto(path);
}

const chatLog = (page: Page) => page.getByRole("log", { name: "Pogovor s Sparkom" });

test("core journey: ask → save → Moj katalog → leaflet highlight → add/remove there → all views consistent → reload", async ({ page }) => {
  await fresh(page);

  // Ask via the generic starter: Sparko asks which product, a bare "skuta" answers it.
  await page.getByRole("button", { name: "Koliko stane izdelek?" }).click();
  await expect(chatLog(page).locator('[data-role="assistant"]').last()).toContainText("Seveda. Kateri izdelek te zanima?");
  const input = page.getByPlaceholder("Vprašaj Sparka …");
  await input.fill("skuta");
  await input.press("Enter");
  const card = chatLog(page).locator(`[data-product-card="${SKUTA}"]`).first();
  await expect(card).toBeVisible();
  await expect(card).toContainText("3,38 €");
  await expect(card).toContainText("1 kg");
  // Compact card: each fact once, no validity / source footer clutter.
  await expect(card).not.toContainText("Velja");
  await expect(card).not.toContainText("PDF-stran");

  // Two equal product actions.
  const add = card.getByRole("button", { name: "Dodaj v Moj katalog" });
  const view = card.getByRole("button", { name: "Poglej v SPAR katalogu" });
  const a = (await add.boundingBox())!;
  const b = (await view.boundingBox())!;
  expect(Math.abs(a.width - b.width)).toBeLessThan(1);
  expect(Math.abs(a.height - b.height)).toBeLessThan(1);
  expect(a.height).toBeGreaterThanOrEqual(44);

  // Save (twice → no duplicate).
  await add.click();
  await expect(card.getByRole("link", { name: /V Mojem katalogu/ })).toBeVisible();
  const savedCount = await page.evaluate(() => JSON.parse(localStorage.getItem("sparko:v1")!).saved.length);
  expect(savedCount).toBe(1);
  // Saved-state geometry stays equal.
  const a2 = (await card.getByRole("link", { name: /V Mojem katalogu/ }).boundingBox())!;
  expect(Math.abs(a2.height - b.height)).toBeLessThan(1);
  expect(Math.abs(a2.width - b.width)).toBeLessThan(1);

  // Carousel tile also shows saved state.
  await expect(page.locator(`button[data-product-id="${SKUTA}"][data-saved]`).first()).toBeVisible();

  // Moj katalog.
  await page.getByRole("navigation", { name: "Glavna navigacija" }).getByRole("link", { name: /Moj katalog/ }).click();
  await expect(page).toHaveURL(/\/moj-katalog/);
  await expect(page.getByText("Tvoji izdelki · 1")).toBeVisible();
  await expect(page.locator(`#izdelek-${SKUTA}`)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Priporočeno zate/ })).toBeVisible();

  // Open the leaflet at the product: saved highlight present.
  await page.getByRole("link", { name: /Odpri SPAR letak/ }).click();
  await expect(page).toHaveURL(/\/letak/);
  const skutaOverlay = page.locator(`[data-testid="leaflet-stage"] [data-product-id="${SKUTA}"]`).first();
  await expect(skutaOverlay).toHaveAttribute("data-saved", "true");
  await expect(skutaOverlay).toContainText("V Mojem katalogu");

  // Add pommes from the leaflet.
  await page.getByRole("button", { name: /^Pommes frites, 1 kg, 1,59 € – ni v Mojem katalogu/ }).last().click();
  await page.getByRole("dialog").getByRole("button", { name: "Dodaj v Moj katalog" }).click();
  await expect(page.locator('[data-testid="leaflet-stage"] [data-product-id="sb-pommes-1kg"][data-saved]').first()).toBeVisible();
  await page.keyboard.press("Escape");

  // Remove skuta from the leaflet → highlight disappears immediately.
  await page.getByRole("button", { name: /^Lahka skuta, 1 kg, 3,38 € – v Mojem katalogu/ }).last().click();
  await page.getByRole("dialog").getByRole("button", { name: "Odstrani" }).click();
  await expect(skutaOverlay).not.toHaveAttribute("data-saved", "true");
  await page.keyboard.press("Escape");

  // Moj katalog reflects it.
  await page.getByRole("navigation", { name: "Glavna navigacija" }).getByRole("link", { name: /Moj katalog/ }).click();
  await expect(page.getByText("Tvoji izdelki · 1")).toBeVisible();
  await expect(page.locator("#izdelek-sb-pommes-1kg")).toBeVisible();
  await expect(page.locator(`#izdelek-${SKUTA}`)).toHaveCount(0);

  // Old chat card updates to unsaved.
  await page.getByRole("navigation", { name: "Glavna navigacija" }).getByRole("link", { name: "Sparko" }).click();
  await expect(chatLog(page).locator(`[data-product-card="${SKUTA}"]`).first().getByRole("button", { name: "Dodaj v Moj katalog" })).toBeVisible();

  // Reload: conversation and selection persist.
  await page.reload();
  await expect(chatLog(page).locator('[data-role="user"]').first()).toHaveText("Koliko stane izdelek?");
  await page.getByRole("navigation", { name: "Glavna navigacija" }).getByRole("link", { name: /Moj katalog/ }).click();
  await expect(page.locator("#izdelek-sb-pommes-1kg")).toBeVisible();
});

test("both starters send a real message and get an answer", async ({ page }) => {
  await fresh(page);
  await page.getByRole("button", { name: "Kaj je najbolj znižano?" }).click();
  const last = chatLog(page).locator('[data-role="assistant"]').last();
  await expect(last).toContainText(/€/, { timeout: 15_000 });
  await expect(last).toContainText(/ceneje/);
  await fresh(page);
  await page.getByRole("button", { name: "Koliko stane izdelek?" }).click();
  await expect(chatLog(page).locator('[data-role="assistant"]').last()).toHaveText(/Seveda\. Kateri izdelek te zanima\?/);
  await expect(chatLog(page).locator("[data-product-card]")).toHaveCount(0);
});

test("dinner for two stays within 10 € using whole packs with visible assumptions", async ({ page }) => {
  await fresh(page);
  const input = page.getByPlaceholder("Vprašaj Sparka …");
  await input.fill("Večerja za dva do 10 €");
  await input.press("Enter");
  const last = chatLog(page).locator('[data-role="assistant"]').last();
  await expect(last).toContainText(/V tvojem proračunu|v okviru/i, { timeout: 15_000 });
  await expect(last).toContainText(/doma/i); // pantry assumption
});

test("unknown product does not produce an invented card", async ({ page }) => {
  await fresh(page);
  const input = page.getByPlaceholder("Vprašaj Sparka …");
  await input.fill("Koliko stane kaviar?");
  await input.press("Enter");
  const last = chatLog(page).locator('[data-role="assistant"]').last();
  await expect(last).toContainText(/ne najdem/i, { timeout: 15_000 });
  await expect(last.locator("[data-product-card]")).toHaveCount(0);
});

test("contextual follow-up: kje je v letaku?", async ({ page }) => {
  await fresh(page);
  const input = page.getByPlaceholder("Vprašaj Sparka …");
  await input.fill("koliko stane skuto");
  await input.press("Enter");
  await expect(chatLog(page).locator('[data-role="assistant"]').last()).toContainText("3,38 €", { timeout: 15_000 });
  await input.fill("kje je v letaku?");
  await input.press("Enter");
  await expect(chatLog(page).locator('[data-role="assistant"]').last()).toContainText("PDF-strani 5", { timeout: 15_000 });
});

test("Domov placeholder keeps state", async ({ page }) => {
  await fresh(page);
  await page.locator(`button[data-product-id="${SKUTA}"]`).first().click();
  await chatLog(page).getByRole("button", { name: "Dodaj v Moj katalog" }).first().click();
  await page.getByRole("link", { name: "Domov" }).click();
  await expect(page.getByText("Demo domača stran je v pripravi.")).toBeVisible();
  await page.getByRole("link", { name: "Nazaj k Sparku" }).click();
  await expect(chatLog(page).locator(`[data-product-card="${SKUTA}"]`)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Glavna navigacija" })).toContainText("1");
});

test("email PDF button only explains availability and sends nothing", async ({ page }) => {
  await fresh(page, "/letak?stran=5");
  const requests: string[] = [];
  page.on("request", (r) => {
    if (!/\.(webp|png|svg|woff2?|js|css)(\?|$)/.test(r.url())) requests.push(`${r.method()} ${r.url()}`);
  });
  await page.getByRole("button", { name: "Pošlji PDF na e-pošto" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Pošlji PDF na e-pošto" });
  await expect(dialog).toContainText("Pošiljanje PDF-ja na e-pošto bo na voljo v prihodnji različici.");
  await expect(dialog.locator("input")).toHaveCount(0);
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  await dialog.getByRole("button", { name: "Zapri" }).first().click();
  expect(requests.filter((r) => r.startsWith("POST"))).toEqual([]);
});

test("demo conversation can be continued without changing the example", async ({ page }) => {
  await fresh(page);
  await page.getByRole("button", { name: "Odpri meni" }).click();
  const demoLink = page.getByRole("button", { name: /Primer/ }).first();
  await demoLink.click();
  const userCountBefore = await chatLog(page).locator('[data-role="user"]').count();
  expect(userCountBefore).toBeGreaterThan(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("sparko:v1") ?? '{"saved":[]}').saved.length);
  expect(saved).toBe(0);
  const input = page.getByPlaceholder("Vprašaj Sparka …");
  await input.fill("Kaj je najbolj znižano?");
  await input.press("Enter");
  await expect(chatLog(page).locator('[data-role="assistant"]').last()).toContainText(/€/, { timeout: 15_000 });
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("sparko:v1")!));
  expect(state.conversations.length).toBe(1);
  expect(state.conversations[0].forkedFrom).toMatch(/^demo-/);
});

for (const width of [360, 390, 430]) {
  test(`layout at ${width}px: no horizontal overflow, square tiles, no avatar gutter`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await fresh(page);
    for (const path of ["/", "/moj-katalog", "/letak?stran=5"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => {
        const els = [document.documentElement, ...document.querySelectorAll<HTMLElement>(".page-scroll, main")];
        return els.some((e) => e.scrollWidth > e.clientWidth + 1);
      });
      expect(overflow, `${path} overflows`).toBe(false);
    }
    await page.goto("/");
    const input = page.getByPlaceholder("Vprašaj Sparka …");
    await input.fill("Koliko stane skuta?");
    await input.press("Enter");
    await expect(chatLog(page).locator("[data-product-card]").first()).toBeVisible();
    const tiles = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-product-id]")]
        .filter((e) => !e.closest('[data-testid="leaflet-stage"]'))
        .map((e) => {
          const r = e.getBoundingClientRect();
          return { w: r.width, h: r.height, radius: getComputedStyle(e).borderRadius };
        }),
    );
    expect(tiles.length).toBeGreaterThan(0);
    for (const t of tiles) {
      expect(Math.abs(t.w - t.h)).toBeLessThan(1);
      expect(t.radius).toBe("0px");
    }
    // Assistant text aligns with the content column (no avatar gutter).
    const offset = await page.evaluate(() => {
      const msg = document.querySelector<HTMLElement>('[data-role="assistant"]')!;
      const log = msg.closest('[role="log"]') as HTMLElement;
      return msg.getBoundingClientRect().left - log.getBoundingClientRect().left;
    });
    expect(offset).toBeLessThan(2);
    // Composer does not overlap the bottom navigation.
    const overlap = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Glavna navigacija"]')!.getBoundingClientRect();
      const form = document.querySelector("form:has(#chat-input)")!.getBoundingClientRect();
      return form.bottom > nav.top + 0.5;
    });
    expect(overlap).toBe(false);
  });
}
