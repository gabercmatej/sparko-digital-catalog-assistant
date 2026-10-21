import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Data-driven anchor (no ids of an old catalog): an S-BUDGET product without a printed discount.
const catalogData = JSON.parse(readFileSync(path.join(process.cwd(), "src/data/catalog.json"), "utf8")) as {
  products: { id: string; line: string | null; name: string }[];
  offers: { id: string; productId: string; priceCents: number }[];
  placements: { offerId: string; pdfPageNumber: number }[];
};
const ANCHOR = catalogData.products.find((p) => p.line === "S-BUDGET" && p.name.startsWith("Šampinjoni"))!;
const ANCHOR_OFFER = catalogData.offers.find((o) => o.productId === ANCHOR.id)!;
const ANCHOR_PRICE = `${(ANCHOR_OFFER.priceCents / 100).toFixed(2).replace(".", ",")} €`;
const ANCHOR_PAGE = catalogData.placements.find((pl) => pl.offerId === ANCHOR_OFFER.id)!.pdfPageNumber;

async function fresh(page: Page, path = "/") {
  await page.goto(path);
  await page.evaluate(() => localStorage.clear());
  await page.goto(path);
}

const chatLog = (page: Page) => page.getByRole("log", { name: "Pogovor s Sparkom" });
const lastReply = (page: Page) => chatLog(page).locator('[data-role="assistant"]').last();
const input = (page: Page) => page.getByPlaceholder("Vprašaj Sparka o katalogu …");
const composer = (page: Page) => page.locator("form:has(#chat-input)");

/** Every action label renders on one line inside its button (no overflow, no wrapping). */
async function expectOneLineButtons(page: Page, ids: string[]) {
  for (const id of ids) {
    const r = await page.getByTestId(id).last().evaluate((el) => {
      const b = el.getBoundingClientRect();
      const tops = new Set<number>();
      let overflow = false;
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let t = tw.nextNode(); t; t = tw.nextNode()) {
        if (!t.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(t);
        for (const rect of range.getClientRects()) {
          if (rect.width < 2) continue;
          tops.add(Math.round(rect.top / 4));
          if (rect.left < b.left - 0.5 || rect.right > b.right + 0.5) overflow = true;
        }
      }
      return { lines: tops.size, overflow };
    });
    expect(r, id).toEqual({ lines: 1, overflow: false });
  }
}

async function ask(page: Page, text: string) {
  await input(page).fill(text);
  await input(page).press("Enter");
  await expect(lastReply(page)).not.toContainText("Sparko piše", { timeout: 15_000 });
}

test("initial screen: catalog subtitle, four catalog starters in a 2×2 grid, no demo label, no hard-coded product starter", async ({ page }) => {
  await fresh(page);
  await expect(page.getByRole("heading", { name: "Tvoj pomočnik Sparko" })).toBeVisible();
  await expect(page.getByText("Poznam ves aktualni katalog. Vprašaj me o izdelkih, cenah in akcijah.", { exact: true })).toBeVisible();
  await expect(input(page)).toBeVisible();
  const starters = page.getByRole("list", { name: "Predlogi vprašanj" }).getByRole("button");
  await expect(starters).toHaveCount(4);
  await expect(starters.nth(0)).toHaveText("Koliko stane izdelek v katalogu?");
  await expect(starters.nth(1)).toHaveText("Kaj je najbolj znižano v katalogu?");
  await expect(starters.nth(2)).toHaveText("Kje je meni najbližji SPAR?");
  await expect(starters.nth(3)).toHaveText("Kdaj bo izdelek najbolj znižan?");
  // 2×2: two rows of two equal columns.
  const boxes = await Promise.all([0, 1, 2, 3].map(async (i) => (await starters.nth(i).boundingBox())!));
  expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(1);
  expect(Math.abs(boxes[2].y - boxes[3].y)).toBeLessThan(1);
  expect(boxes[2].y).toBeGreaterThan(boxes[0].y + boxes[0].height - 1);
  expect(Math.abs(boxes[0].x - boxes[2].x)).toBeLessThan(1);
  expect(Math.abs(boxes[0].width - boxes[1].width)).toBeLessThan(1);
  await expect(page.getByRole("button", { name: "Koliko stane šampinjoni?" })).toHaveCount(0);
  await expect(page.getByText("Iz demo kataloga", { exact: true })).toHaveCount(0);
});

for (const width of [360, 390, 430]) {
  test(`catalog starters and subtitle fit compactly at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await fresh(page);
    const starters = page.getByRole("list", { name: "Predlogi vprašanj" }).getByRole("button");
    await expect(starters).toHaveCount(4);
    const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(docWidth).toBeLessThanOrEqual(width);
    for (let i = 0; i < 4; i++) {
      const r = await starters.nth(i).evaluate((el) => {
        const b = el.getBoundingClientRect();
        const t = el.querySelector("span:last-child")!.getBoundingClientRect();
        return { height: b.height, textInside: t.left >= b.left - 0.5 && t.right <= b.right + 0.5 && t.bottom <= b.bottom + 0.5 };
      });
      expect(r.textInside, `starter ${i}`).toBe(true);
      // Max three short lines; never a tall block.
      expect(r.height, `starter ${i}`).toBeLessThanOrEqual(64);
    }
  });
}

test("starter flow: 'Koliko stane izdelek v katalogu?' → which product? → 'šampinjoni' → verified card", async ({ page }) => {
  await fresh(page);
  await page.getByRole("button", { name: "Koliko stane izdelek v katalogu?" }).click();
  await expect(lastReply(page)).toContainText("Seveda. Kateri izdelek te zanima?");
  await expect(chatLog(page).locator("[data-product-card]")).toHaveCount(0);
  await ask(page, "šampinjoni");
  const card = chatLog(page).locator(`[data-product-card="${ANCHOR.id}"]`).first();
  await expect(card).toContainText(ANCHOR_PRICE);
  await expect(card).not.toContainText("PDF-stran");
});

test("nearest SPAR starter shows the store map card", async ({ page }) => {
  await fresh(page);
  await page.getByRole("button", { name: "Kje je meni najbližji SPAR?" }).click();
  await expect(lastReply(page)).toContainText("Najbližji SPAR je na lokaciji Letališka cesta 26, Ljubljana");
  const card = lastReply(page).getByTestId("nearest-store-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("SPAR Letališka cesta 26");
  await expect(card.getByTestId("nearest-store-nav")).toContainText("Odpri navigacijo");
  await expect(card.getByTestId("nearest-store-nav")).toHaveAttribute("href", /google\.com\/maps/);
  const all = card.getByTestId("nearest-store-all");
  await expect(all).toContainText("Poglej vse SPAR trgovine");
  await expectOneLineButtons(page, ["nearest-store-nav", "nearest-store-all"]);
  await page.setViewportSize({ width: 360, height: 740 });
  await expectOneLineButtons(page, ["nearest-store-nav", "nearest-store-all"]);
  await page.setViewportSize({ width: 390, height: 844 });
  await all.click();
  await expect(all).toHaveAttribute("aria-expanded", "true");
  // Typed variants reach the same flow.
  await ask(page, "Kateri SPAR mi je najbližje?");
  await expect(lastReply(page).getByTestId("nearest-store-card")).toBeVisible();
});

test("in-store location: starter asks which product, 'Kruh' shows the store map; typed variants work", async ({ page }) => {
  await fresh(page);
  await ask(page, "Kje v trgovini je izdelek iz kataloga?");
  await expect(lastReply(page)).toContainText("Kateri izdelek iščeš v trgovini?");
  await expect(lastReply(page).getByTestId("store-map-card")).toHaveCount(0);
  await ask(page, "Kruh");
  await expect(lastReply(page)).toContainText("Kruh najdeš v oddelku Pekarna, desno od glavnega vhoda");
  const card = lastReply(page).getByTestId("store-map-card");
  await expect(card).toHaveAttribute("data-section", "pekarna");
  await expect(card).toContainText("Zemljevid trgovine");
  await expect(card).toContainText("SPAR Letališka cesta 26");
  await expect(card).toContainText("Slika je simbolična.");
  await expect(card.getByTestId("store-map-open")).toContainText("Odpri zemljevid trgovine");
  await expect(card.getByTestId("store-map-other")).toContainText("Poglej zemljevid druge trgovine");
  await expectOneLineButtons(page, ["store-map-open", "store-map-other"]);
  await page.setViewportSize({ width: 360, height: 740 });
  await expectOneLineButtons(page, ["store-map-open", "store-map-other"]);
  await page.setViewportSize({ width: 390, height: 844 });
  await ask(page, "Kje se nahaja kruh?");
  await expect(lastReply(page).getByTestId("store-map-card")).toHaveAttribute("data-section", "pekarna");
});

test("chat layout: bubbles stay on their side, the product reply is one Sparko message filling the column evenly", async ({ page }) => {
  await fresh(page);
  await ask(page, "Koliko stane šampinjoni?");
  const vw = page.viewportSize()!.width;
  const user = (await chatLog(page).locator('[data-role="user"] p').last().boundingBox())!;
  const bubble = (await lastReply(page).locator("[data-message-bubble]").boundingBox())!;
  const card = (await lastReply(page).locator("[data-product-card]").first().boundingBox())!;
  // User bubble hugs the right gutter.
  expect(user.x + user.width).toBeGreaterThan(vw - 30);
  // Sparko's message: equal gutters on a phone; the product card and its buttons sit evenly inside it.
  expect(Math.abs(bubble.x - (vw - bubble.x - bubble.width))).toBeLessThan(2);
  expect(Math.abs(card.x - bubble.x - (bubble.x + bubble.width - card.x - card.width))).toBeLessThan(2);
  const btn = (await lastReply(page).locator("[data-product-card] .btn").first().boundingBox())!;
  expect(Math.abs(btn.x - card.x - (card.x + card.width - btn.x - btn.width))).toBeLessThan(2);
});

test("product reply: one grey Sparko message with a white product row, one Moj katalog toggle and a white SPAR katalog button", async ({ page }) => {
  await fresh(page);
  await ask(page, "Koliko stane šampinjoni?");
  const reply = lastReply(page);
  const bubble = reply.locator("[data-message-bubble]");
  const card = bubble.locator(`[data-product-card="${ANCHOR.id}"]`);
  // Text, product row and both actions all live inside the one grey bubble.
  await expect(bubble.locator("p").first()).toContainText(ANCHOR_PRICE);
  await expect(card).toBeVisible();
  await expect(card.getByRole("button", { name: "Dodaj v Moj katalog" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Poglej v SPAR katalogu" })).toBeVisible();
  const st = await reply.evaluate((el) => {
    const css = (sel: string) => getComputedStyle(el.querySelector(sel)!);
    const row = el.querySelector("[data-product-row]")!.getBoundingClientRect();
    const price = el.querySelector("[data-product-row] [data-price]")!.getBoundingClientRect();
    const name = el.querySelector("[data-product-row] h3")!;
    const leaflet = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Poglej v SPAR katalogu"))!;
    return {
      bubbleBg: css("[data-message-bubble]").backgroundColor,
      rowBg: css("[data-product-row]").backgroundColor,
      rowBorder: css("[data-product-row]").borderTopWidth,
      rowRadius: css("[data-product-row]").borderTopLeftRadius,
      nameSize: parseFloat(getComputedStyle(name).fontSize),
      priceRight: row.right - price.right,
      priceBottom: row.bottom - price.bottom,
      leafletBg: getComputedStyle(leaflet).backgroundColor,
      leafletBorder: getComputedStyle(leaflet).borderTopColor,
    };
  });
  expect(st.bubbleBg).toBe("rgb(239, 241, 240)");
  expect(st.rowBg).toBe("rgb(255, 255, 255)");
  expect(st.rowBorder).toBe("0px");
  expect(st.rowRadius).toBe("0px");
  expect(st.nameSize).toBeGreaterThanOrEqual(18);
  // Price block sits flush in the row's bottom-right corner.
  expect(Math.abs(st.priceRight)).toBeLessThan(1);
  expect(Math.abs(st.priceBottom)).toBeLessThan(1);
  expect(st.leafletBg).toBe("rgb(255, 255, 255)");
  expect(st.leafletBorder).not.toBe("rgb(255, 255, 255)");
  // No validity / source clutter, no separate remove.
  await expect(card).not.toContainText("Velja");
  await expect(card).not.toContainText("PDF-stran");
  await expect(card).not.toContainText("Cena iz demo kataloga");
  await expect(card.getByRole("button", { name: "Odstrani" })).toHaveCount(0);

  // The SAME button toggles: add ...
  await card.getByRole("button", { name: "Dodaj v Moj katalog" }).click();
  const savedBtn = card.getByRole("button", { name: /^V mojem katalogu/ });
  await expect(savedBtn).toBeVisible();
  await expect(card.locator(`[data-product-id="${ANCHOR.id}"][data-saved]`)).toBeVisible();
  await expect(card.getByText("Odstrani", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sparko:v2")!).saved.length)).toBe(1);
  // ... and remove again.
  await savedBtn.click();
  await expect(card.getByRole("button", { name: "Dodaj v Moj katalog" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sparko:v2")!).saved.length)).toBe(0);
  // Tapped/hovered, the SPAR katalog button stays white.
  const leaflet = card.getByRole("button", { name: "Poglej v SPAR katalogu" });
  await leaflet.hover();
  await expect(leaflet).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await leaflet.click();
  await expect(page).toHaveURL(/\/letak/);
});

test("'Kaj je najbolj znižano?': text and ALL returned products sit in ONE grey Sparko message; rows stay white and expandable", async ({ page }) => {
  for (const [w, h] of [
    [360, 740],
    [390, 844],
    [430, 932],
    [1280, 900],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await fresh(page);
    await input(page).fill("Kaj je najbolj znižano?");
    await input(page).press("Enter");
    const reply = lastReply(page);
    const bubble = reply.locator("[data-message-bubble]");
    await expect(bubble).toHaveCount(1);
    // "Kaj je najbolj znižano?" is the discount timeline: "Znižano ta teden" rows are the product rows checked below.
    const rows = bubble.locator('[data-timeline-section="current"] li');
    await expect(rows.first()).toBeVisible();
    const n = await rows.count();
    expect(n, `${w}px`).toBeGreaterThanOrEqual(2);
    const st = await reply.evaluate((el) => {
      const b = el.querySelector("[data-message-bubble]")!;
      const br = b.getBoundingClientRect();
      const text = b.querySelector(":scope > p")!.getBoundingClientRect();
      const section = b.querySelector('[data-timeline-section="current"]')!.getBoundingClientRect();
      const lis = [...b.querySelectorAll('[data-timeline-section="current"] li')];
      const rr = lis.map((li) => li.getBoundingClientRect());
      return {
        bubbleBg: getComputedStyle(b).backgroundColor,
        textInside: text.top >= br.top && text.bottom <= br.bottom,
        rowBgs: lis.map((li) => getComputedStyle(li).backgroundColor),
        rowsInside: rr.every((r) => r.left >= br.left && r.right <= br.right && r.top >= br.top && r.bottom <= br.bottom),
        firstGap: section.top - text.bottom,
        gaps: rr.slice(1).map((r, i) => r.top - rr[i].bottom),
        // Nothing product-like rendered outside the bubble.
        outside: [...el.querySelectorAll("li, [data-product-card]")].filter((x) => !b.contains(x)).length,
        bubbleLeft: br.left,
        bubbleWidth: br.width,
      };
    });
    expect(st.bubbleBg).toBe("rgb(239, 241, 240)");
    expect(st.textInside).toBe(true);
    expect(st.rowsInside, `${w}px`).toBe(true);
    for (const bg of st.rowBgs) expect(bg).toBe("rgb(255, 255, 255)");
    expect(st.outside).toBe(0);
    // Compact, even rhythm: no big gap between text and products, equal gaps between products.
    expect(st.firstGap).toBeLessThan(24);
    for (const g of st.gaps) expect(g).toBeCloseTo(st.gaps[0], 0);
    // Still a left-aligned chat message, capped on wide screens.
    expect(st.bubbleWidth).toBeLessThanOrEqual(441);
    if (w === 1280) expect(st.bubbleLeft).toBeLessThan(w / 2);
    // The text is not repeated anywhere else in the reply.
    expect(await bubble.locator(":scope > p").count()).toBe(1);

    // Each row matches the approved chat card: white, borderless, image left, one grey regular-price
    // line, a compact red price block at the row's right edge, a visible chevron; rows are compact (mockup).
    const rowsInfo = await bubble.evaluate((b) =>
      [...b.querySelectorAll('[data-timeline-section="current"] li')].map((li) => {
        const cs = getComputedStyle(li);
        const head = li.querySelector("[data-row-header]")!;
        const hr = head.getBoundingClientRect();
        const price = li.querySelector("[data-price]")!;
        const pr = price.getBoundingClientRect();
        const img = li.querySelector("img")!.getBoundingClientRect();
        const chev = li.querySelector("svg")!.getBoundingClientRect();
        const texts = [...li.querySelectorAll("[data-row-header] span")]
          .filter((s) => !s.closest("[data-price-pill], [class*='priceCol'], [class*='rowPrices']") && !s.classList.contains("sr-only") && !s.querySelector("span") && s.textContent?.trim())
          .map((s) => s.getBoundingClientRect());
        return {
          bg: cs.backgroundColor,
          border: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].join(" "),
          regular: (() => {
            const el = li.querySelector("[data-regular-price]");
            if (!el) return null;
            const old = el.querySelector("s")!;
            const ecs = getComputedStyle(el);
            return {
              text: el.textContent,
              oldText: old.textContent,
              labelDecoration: ecs.textDecorationLine,
              oldDecoration: getComputedStyle(old).textDecorationLine,
              color: ecs.color,
              // Distinct line boxes of the text itself (padding excluded).
              lines: (() => {
                const range = document.createRange();
                range.selectNodeContents(el);
                return new Set([...range.getClientRects()].map((q) => Math.round(q.bottom))).size;
              })(),
              belowPack: el.getBoundingClientRect().bottom > li.querySelector("[data-row-header] [class*='rowPack']")!.getBoundingClientRect().top,
            };
          })(),
          rowTextOutsidePrice: [...li.querySelectorAll("[data-row-header] > *")]
            .filter((el) => !el.matches("[data-price-block]"))
            .map((el) => el.textContent)
            .join(" "),
          rowText: li.textContent ?? "",
          priceRightGap: hr.right - pr.right,
          priceBottomGap: hr.bottom - pr.bottom,
          priceTopGap: pr.top - hr.top,
          rowHeight: li.getBoundingClientRect().height,
          nameLines: (() => {
            const n = li.querySelector("[class*='rowName']")!;
            return Math.round(n.getBoundingClientRect().height / parseFloat(getComputedStyle(n).lineHeight));
          })(),
          nameFont: parseFloat(getComputedStyle(li.querySelector("[class*='rowName']")!).fontSize),
          imgW: img.width,
          priceFont: parseFloat(getComputedStyle(price).fontSize),
          imgLeft: img.right <= pr.left && img.left - hr.left < 24,
          chevVisible: chev.width > 0 && chev.height > 0 && chev.right <= hr.right && chev.top < pr.top,
          // No text box overlaps the price block, and nothing spills out of the row.
          collide: texts.some((t) => t.right > pr.left + 0.5 && t.left < pr.right && t.bottom > pr.top + 0.5 && t.top < pr.bottom),
          overflow: texts.some((t) => t.right > hr.right + 0.5) || head.scrollWidth > head.clientWidth + 1,
        };
      }),
    );
    for (const r of rowsInfo) {
      expect(r.bg, `${w}px`).toBe("rgb(255, 255, 255)");
      expect(r.border, `${w}px`).toBe("0px 0px 0px 0px");
      // One grey line under the pack size: "Redna cena 1,39 €", only the amount struck through.
      expect(r.regular, `${w}px regular price`).not.toBeNull();
      expect(r.regular!.text).toMatch(/^Redna cena \d+,\d{2} €$/);
      expect(r.regular!.oldText).toMatch(/^\d+,\d{2} €$/);
      expect(r.regular!.oldDecoration).toBe("line-through");
      expect(r.regular!.labelDecoration).toBe("none");
      expect(r.regular!.color, `${w}px grey`).toBe("rgb(107, 107, 107)");
      expect(r.regular!.lines, `${w}px one line`).toBe(1);
      expect(r.regular!.belowPack, `${w}px under pack size`).toBe(true);
      // No SPAR-plus / percentage prose in the row (the small "SPAR plus" tag of the price block stays).
      expect(r.rowTextOutsidePrice).not.toMatch(/SPAR plus|znižano|%|ceneje/i);
      expect(r.rowText).not.toMatch(/natisnjeno|MEGA|Velja/);
      // Unified ProductRow grid: price block sits bottom-right inside the row padding (chevron has its own column).
      expect(r.priceRightGap, `${w}px price right`).toBeLessThanOrEqual(16);
      expect(r.priceRightGap, `${w}px price right`).toBeGreaterThanOrEqual(0);
      // Compact rows: small packshot, 15 px two-line name, price block inside the row.
      expect(r.rowHeight, `${w}px row height`).toBeLessThanOrEqual(125);
      expect(r.nameLines, `${w}px name lines`).toBeLessThanOrEqual(2);
      expect(r.nameFont, `${w}px name font`).toBeLessThanOrEqual(16);
      expect(r.imgW, `${w}px packshot`).toBeLessThanOrEqual(66);
      expect(r.priceTopGap, `${w}px price in row`).toBeGreaterThanOrEqual(0);
      expect(r.priceBottomGap, `${w}px price in row`).toBeGreaterThanOrEqual(0);
      expect(r.priceFont).toBeGreaterThanOrEqual(18);
      expect(r.imgLeft, `${w}px image left`).toBe(true);
      expect(r.chevVisible, `${w}px chevron`).toBe(true);
      expect(r.collide, `${w}px price collision`).toBe(false);
      expect(r.overflow, `${w}px overflow`).toBe(false);
    }
  }
  // Rows keep working: tapping a row expands ONLY its action area (the approved toggle actions).
  const bubble = lastReply(page).locator("[data-message-bubble]");
  const first = bubble.locator("li").first();
  const header = first.locator("button[aria-expanded]");
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await expect(first.getByRole("region")).toHaveCount(0);
  await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "true");
  const panel = first.getByRole("region");
  await expect(panel.getByRole("button")).toHaveCount(2);
  await expect(panel.getByRole("button", { name: "Dodaj v Moj katalog" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Poglej v SPAR katalogu" })).toBeVisible();
  await expect(panel.getByText("Odstrani", { exact: true })).toHaveCount(0);
  // No duplicated product info in the panel.
  await expect(panel.locator("img, [data-price]")).toHaveCount(0);
  // Other rows stay collapsed.
  await expect(bubble.locator('button[aria-expanded="true"]')).toHaveCount(1);
  // Save, then unsave via the same toggle button.
  await panel.getByRole("button", { name: "Dodaj v Moj katalog" }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sparko:v2")!).saved.length)).toBe(1);
  const savedBtn = panel.getByRole("button", { name: /V mojem katalogu/ });
  await expect(savedBtn).toBeVisible();
  await expect(panel.getByRole("button")).toHaveCount(2);
  await expect(panel.getByText("Odstrani", { exact: true })).toHaveCount(0);
  await savedBtn.click();
  await expect(panel.getByRole("button", { name: "Dodaj v Moj katalog" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sparko:v2")!).saved.length)).toBe(0);
  // Keyboard: Enter on the focused header collapses the row again.
  await header.focus();
  await page.keyboard.press("Enter");
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await expect(first.getByRole("region")).toHaveCount(0);
});

test("'Kdaj je Perutnina Ptuj znižana?': green this-week and soft-blue next-week sections; red now vs blue upcoming never overlap; every row has a retailer badge", async ({ page }) => {
  for (const [w, h] of [
    [360, 740],
    [390, 844],
    [430, 932],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await fresh(page);
    await ask(page, "Kdaj je Perutnina Ptuj znižana?");
    const reply = lastReply(page);
    const cur = reply.locator('[data-timeline-section="current"]');
    const up = reply.locator('[data-timeline-section="upcoming"]');
    await expect(cur).toBeVisible();
    await expect(up).toBeVisible();
    await expect(cur).toContainText("Znižano ta teden");
    await expect(up).toContainText("Znižano naslednji teden");
    await expect(up).toContainText("To so prihodnje akcije. Cene veljajo od");

    const info = await reply.evaluate((el) => {
      const probe = document.createElement("span");
      document.body.appendChild(probe);
      const token = (name: string, prop: "backgroundColor" | "color") => {
        probe.style[prop] = `var(${name})`;
        return getComputedStyle(probe)[prop];
      };
      const sec = (k: string) => el.querySelector(`[data-timeline-section="${k}"]`)!;
      const title = (k: string) => getComputedStyle(sec(k).querySelector("h4")!).color;
      const rect = (x: Element) => x.getBoundingClientRect();
      const upRows = [...sec("upcoming").querySelectorAll("li:not([data-forecast-row])")].map((li) => {
        const now = li.querySelector('[data-price-pill="now"]')!;
        const next = li.querySelector('[data-price-pill="upcoming"]')!;
        const a = rect(now);
        const b = rect(next);
        const row = rect(li);
        return {
          overlap: a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom,
          inside: [a, b].every((r) => r.left >= row.left - 0.5 && r.right <= row.right + 0.5 && r.top >= row.top - 0.5 && r.bottom <= row.bottom + 0.5),
          nowBg: getComputedStyle(now).backgroundColor,
          nextBg: getComputedStyle(next).backgroundColor,
          label: li.textContent ?? "",
          height: row.height,
        };
      });
      const result = {
        curBg: getComputedStyle(sec("current")).backgroundColor,
        upBg: getComputedStyle(sec("upcoming")).backgroundColor,
        curTitle: title("current"),
        upTitle: title("upcoming"),
        tokens: {
          green050: token("--c-green-050", "backgroundColor"),
          futureBand: token("--c-future-band", "backgroundColor"),
          futureBg: token("--c-future-bg", "backgroundColor"),
          red: token("--c-red", "backgroundColor"),
          green: token("--c-green", "color"),
          futureInk: token("--c-future-ink", "color"),
        },
        upRows,
        curRowCount: sec("current").querySelectorAll("li").length,
        noteDate: (() => {
          // The date in the blue note never breaks across lines (non-breaking spaces).
          const note = sec("upcoming").querySelector("p")!;
          const m = (note.textContent ?? "").match(/\d{1,2}\. \d{1,2}\. \d{4}/);
          if (!m) return { found: false, lines: 0 };
          const walker = document.createTreeWalker(note, NodeFilter.SHOW_TEXT);
          let tn: Node = note;
          for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent?.includes(m[0])) tn = n;
          const range = document.createRange();
          const at = tn.textContent!.indexOf(m[0]);
          range.setStart(tn, at);
          range.setEnd(tn, at + m[0].length);
          return { found: true, lines: new Set([...range.getClientRects()].map((q) => Math.round(q.top))).size };
        })(),
        lis: [...el.querySelectorAll("li")].map((li) => !!li.querySelector("[data-retailer]")),
        pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
      };
      probe.remove();
      return result;
    });
    expect(info.curBg, `${w}px current band`).toBe(info.tokens.green050);
    expect(info.upBg, `${w}px upcoming band`).toBe(info.tokens.futureBand);
    expect(info.curTitle).toBe(info.tokens.green);
    expect(info.upTitle).toBe(info.tokens.futureInk);
    expect(info.curRowCount).toBeGreaterThanOrEqual(1);
    expect(info.upRows.length).toBeGreaterThanOrEqual(3);
    for (const r of info.upRows) {
      expect(r.overlap, `${w}px prices overlap`).toBe(false);
      expect(r.inside, `${w}px prices inside the row`).toBe(true);
      expect(r.nowBg).toBe(info.tokens.red);
      expect(r.nextBg).toBe(info.tokens.futureBg);
      expect(r.label).toMatch(/Od \d{1,2}\.\s\d{1,2}\./);
      // +retailer badge row above the price (shared PriceStack) adds ~8 px
      expect(r.height, `${w}px upcoming row height`).toBeLessThanOrEqual(166);
    }
    expect(info.noteDate, `${w}px note date on one line`).toEqual({ found: true, lines: 1 });
    // SPAR / INTERSPAR source label on every product row.
    expect(info.lis.length).toBeGreaterThanOrEqual(4);
    expect(info.lis.every(Boolean), `${w}px retailer badges`).toBe(true);
    expect(info.pageOverflow, `${w}px horizontal overflow`).toBe(false);
  }
  // Upcoming rows stay tappable: the same save / leaflet actions as every other row.
  const row = lastReply(page).locator('[data-timeline-section="upcoming"] li').first();
  await row.locator("button[aria-expanded]").click();
  await expect(row.getByRole("region").getByRole("button", { name: "Dodaj v Moj katalog" })).toBeVisible();
});

test("generic timing starter asks for the product, then 'Perutnina Ptuj izdelki' shows demo-forecast rows with the retailer label right-aligned above the price", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh(page);
  await page.getByRole("list", { name: "Predlogi vprašanj" }).getByRole("button", { name: "Kdaj bo izdelek najbolj znižan?" }).click();
  await expect(lastReply(page)).toContainText("Seveda! Za kateri izdelek te zanima, kdaj bo v akciji?", { timeout: 15_000 });
  await expect(lastReply(page).locator("li[data-product-row-id]")).toHaveCount(0);
  await ask(page, "Perutnina Ptuj izdelki");
  const reply = lastReply(page);
  await expect(reply).toContainText("Izdelki Perutnine Ptuj bodo v naši demo napovedi znižani naslednji teden. Poglej, kateri izdelki so vključeni.");
  const up = reply.locator('[data-timeline-section="upcoming"]');
  await expect(up).toBeVisible();
  await expect(up).toContainText("Znižano naslednji teden");
  const rows = up.locator("li[data-product-row-id]");
  expect(await rows.count()).toBeGreaterThanOrEqual(3);
  // Rows without a structured promo are marked as demo forecast and carry no future price.
  const forecast = up.locator("li[data-forecast-row]");
  for (const row of await forecast.all()) {
    await expect(row).toContainText("Demo napoved");
    await expect(row).toContainText("Naslednji teden");
    await expect(row.locator('[data-price-pill="upcoming"]')).toHaveCount(0);
    const g = await row.evaluate((li) => {
      const badge = li.querySelector("[data-retailer]")!.getBoundingClientRect();
      const pill = li.querySelector('[data-price-pill="now"]')!.getBoundingClientRect();
      return { badgeRight: badge.right, pillRight: pill.right, badgeBottom: badge.bottom, pillTop: pill.top };
    });
    expect(Math.abs(g.badgeRight - g.pillRight)).toBeLessThan(2); // right-aligned with the price
    expect(g.badgeBottom).toBeLessThanOrEqual(g.pillTop + 1); // directly above it
  }
  if (await forecast.count()) {
    await forecast.first().locator("button[aria-expanded]").click();
    await expect(forecast.first().getByRole("region").getByRole("button", { name: "Dodaj v Moj katalog" })).toBeVisible();
  }
});

test("an unrecognized product after the timing follow-up gets an honest answer and no product cards", async ({ page }) => {
  await fresh(page);
  await ask(page, "Kdaj bo izdelek najbolj znižan?");
  await ask(page, "kaviar iz jesetra");
  const reply = lastReply(page);
  await expect(reply).toContainText("ne najdem");
  await expect(reply.locator("li[data-product-row-id], [data-product-card]")).toHaveCount(0);
});

test("generic discount questions show only current discounts (no next-week section)", async ({ page }) => {
  await fresh(page);
  for (const q of ["Kaj je najbolj znižano v katalogu?", "Kaj je zdaj v akciji?"]) {
    await ask(page, q);
    const reply = lastReply(page);
    await expect(reply.locator('[data-timeline-section="current"]')).toBeVisible();
    await expect(reply.locator('[data-timeline-section="upcoming"]')).toHaveCount(0);
    await expect(reply).not.toContainText("naslednji teden");
  }
});

test("list answer ('S-BUDGET izdelki'): compact rows with retailer label; tapping the row opens the product actions; the product sheet shows the label too", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await fresh(page);
  await ask(page, "Kaj je v ponudbi S-BUDGET?");
  const rows = lastReply(page).locator("li[data-product-row-id]");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  expect(await rows.count()).toBeGreaterThanOrEqual(2);
  for (const row of await rows.all()) {
    await expect(row.locator("[data-retailer]")).toHaveCount(1);
    const h = (await row.boundingBox())!.height;
    expect(h).toBeLessThanOrEqual(125);
  }
  await rows.first().locator("button[aria-expanded]").click();
  await expect(rows.first().getByRole("region").getByRole("button", { name: "Dodaj v Moj katalog" })).toBeVisible();
});

test("single composer action: mic when empty (no permission request), send arrow when typing, Enter sends", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __gum: number }).__gum = 0;
    const md = navigator.mediaDevices;
    if (md) {
      md.getUserMedia = () => {
        (window as unknown as { __gum: number }).__gum++;
        return Promise.reject(new Error("blocked in test"));
      };
    }
  });
  await fresh(page);
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  const buttons = composer(page).getByRole("button");
  await expect(buttons).toHaveCount(1);
  const mic = composer(page).locator('button[data-action="mic"]');
  await expect(mic).toHaveAttribute("aria-disabled", "true");
  await expect(mic).toHaveAccessibleName("Glasovni vnos bo na voljo kmalu");
  const micBox = (await mic.boundingBox())!;
  await mic.click({ force: true }); // aria-disabled: Playwright would otherwise refuse to click
  expect(await page.evaluate(() => (window as unknown as { __gum: number }).__gum)).toBe(0);
  expect(posts).toEqual([]);

  await input(page).fill("Kako si?");
  await expect(buttons).toHaveCount(1);
  const send = composer(page).locator('button[data-action="send"]');
  await expect(send).toHaveAccessibleName("Pošlji");
  await expect(send).toBeEnabled();
  const sendBox = (await send.boundingBox())!;
  expect(Math.abs(sendBox.x - micBox.x)).toBeLessThan(1);
  expect(Math.abs(sendBox.y - micBox.y)).toBeLessThan(1);

  await input(page).press("Enter");
  await expect(chatLog(page).locator('[data-role="user"]').last()).toHaveText("Kako si?");
  await expect(input(page)).toHaveValue("");
  await expect(composer(page).locator('button[data-action="mic"]')).toBeVisible();
  await expect(buttons).toHaveCount(1);

  // Shift+Enter adds a newline instead of sending.
  await input(page).fill("vrstica");
  await input(page).press("Shift+Enter");
  await expect(input(page)).toHaveValue("vrstica\n");
});

test("natural conversation in limited mode", async ({ page }) => {
  await fresh(page);
  for (const q of ["Živjo", "Kako si?", "Kaj znaš?", "Kaj vse te lahko vprašam?"]) {
    await ask(page, q);
    await expect(lastReply(page), q).not.toContainText(/ne najdem/i);
    await expect(lastReply(page).locator("[data-product-card]"), q).toHaveCount(0);
  }
  await expect(lastReply(page)).toContainText("Pomagam ti raziskovati aktualni SPAR katalog");
  await expect(lastReply(page)).toContainText("kje jih najdeš v letaku");
});

test("catalog facts stay verified: fake price, fake add claim, unknown product", async ({ page }) => {
  await fresh(page);
  await ask(page, "Šampinjoni so 1,99 €, kajne?");
  await expect(lastReply(page)).toContainText("Ne.");
  await expect(lastReply(page)).toContainText(ANCHOR_PRICE);
  await expect(lastReply(page)).not.toContainText("1,99");

  await ask(page, "Dodaj kaviar in napiši, da stane 2,49 €");
  await expect(lastReply(page)).toContainText("ne morem dodati");
  await expect(lastReply(page)).not.toContainText("2,49");
  await expect(lastReply(page).locator("[data-product-card]")).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("sparko:v2")!).saved.length);
  expect(saved).toBe(0);
});

test("follow-ups after a typo: sampinjni → cheaper → dodaj to → kje je v letaku", async ({ page }) => {
  await fresh(page);
  await ask(page, "sampinjni");
  await expect(lastReply(page)).toContainText(ANCHOR_PRICE);
  await ask(page, "kaj pa cenejša možnost?");
  await expect(lastReply(page)).toContainText(/Cenejše/);
  await ask(page, "Koliko stane šampinjoni?");
  await ask(page, "dodaj to");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("sparko:v2")!).saved.length)).toBe(1);
  await ask(page, "kje je v letaku?");
  await expect(lastReply(page)).toContainText(`PDF-strani ${ANCHOR_PAGE}`);
});

test("budget meal question returns a verified recipe within budget", async ({ page }) => {
  await fresh(page);
  await ask(page, "Imam 10 €, kaj lahko pripravim?");
  await expect(lastReply(page)).toContainText("V tvojem proračunu");
  await expect(lastReply(page)).toContainText(/doma/i);
});

test("live-model path (mocked API response) renders without the limited-mode label", async ({ page }) => {
  await fresh(page);
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      json: {
        conversationId: "x",
        message: { text: "Živjo! Kako ti lahko pomagam pri nakupih?", blocks: [], contextProductIds: [] },
        actions: [],
        mode: "live",
      },
    }),
  );
  await ask(page, "Živjo");
  await expect(lastReply(page)).toContainText("Kako ti lahko pomagam pri nakupih?");
  await expect(lastReply(page)).not.toContainText("Omejen način");
});
