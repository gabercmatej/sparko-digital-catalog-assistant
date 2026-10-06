import { expect, test, type Page } from "@playwright/test";

const SKUTA = "sb-skuta-1kg";

async function fresh(page: Page, path = "/") {
  await page.goto(path);
  await page.evaluate(() => localStorage.clear());
  await page.goto(path);
}

const chatLog = (page: Page) => page.getByRole("log", { name: "Pogovor s Sparkom" });
const lastReply = (page: Page) => chatLog(page).locator('[data-role="assistant"]').last();
const input = (page: Page) => page.getByPlaceholder("Vprašaj Sparka …");
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

test("initial screen: four generic starters in a 2×2 grid, no demo label, no hard-coded product starter", async ({ page }) => {
  await fresh(page);
  const starters = page.getByRole("list", { name: "Predlogi vprašanj" }).getByRole("button");
  await expect(starters).toHaveCount(4);
  await expect(starters.nth(0)).toHaveText("Koliko stane izdelek?");
  await expect(starters.nth(1)).toHaveText("Kaj je najbolj znižano?");
  await expect(starters.nth(2)).toHaveText("Kje je meni najbližji SPAR?");
  await expect(starters.nth(3)).toHaveText("Kje v trgovini je izdelek?");
  // 2×2: two rows of two equal columns.
  const boxes = await Promise.all([0, 1, 2, 3].map(async (i) => (await starters.nth(i).boundingBox())!));
  expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(1);
  expect(Math.abs(boxes[2].y - boxes[3].y)).toBeLessThan(1);
  expect(boxes[2].y).toBeGreaterThan(boxes[0].y + boxes[0].height - 1);
  expect(Math.abs(boxes[0].x - boxes[2].x)).toBeLessThan(1);
  expect(Math.abs(boxes[0].width - boxes[1].width)).toBeLessThan(1);
  await expect(page.getByRole("button", { name: "Koliko stane skuta?" })).toHaveCount(0);
  await expect(page.getByText("Iz demo kataloga", { exact: true })).toHaveCount(0);
});

test("starter flow: 'Koliko stane izdelek?' → which product? → 'skuta' → verified card", async ({ page }) => {
  await fresh(page);
  await page.getByRole("button", { name: "Koliko stane izdelek?" }).click();
  await expect(lastReply(page)).toContainText("Seveda. Kateri izdelek te zanima?");
  await expect(chatLog(page).locator("[data-product-card]")).toHaveCount(0);
  await ask(page, "skuta");
  const card = chatLog(page).locator(`[data-product-card="${SKUTA}"]`).first();
  await expect(card).toContainText("3,38 €");
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
  await page.getByRole("button", { name: "Kje v trgovini je izdelek?" }).click();
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
  await ask(page, "Koliko stane skuta?");
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
  await ask(page, "Koliko stane salama?");
  const reply = lastReply(page);
  const bubble = reply.locator("[data-message-bubble]");
  const card = bubble.locator('[data-product-card="sb-salama-400g"]');
  // Text, product row and both actions all live inside the one grey bubble.
  await expect(bubble.locator("p").first()).toContainText("0,99 €");
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
  await expect(card.locator('[data-product-id="sb-salama-400g"][data-saved]')).toBeVisible();
  await expect(card.getByText("Odstrani", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sparko:v1")!).saved.length)).toBe(1);
  // ... and remove again.
  await savedBtn.click();
  await expect(card.getByRole("button", { name: "Dodaj v Moj katalog" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sparko:v1")!).saved.length)).toBe(0);
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
    const rows = bubble.locator("li");
    await expect(rows.first()).toBeVisible();
    const n = await rows.count();
    expect(n, `${w}px`).toBeGreaterThanOrEqual(2);
    const st = await reply.evaluate((el) => {
      const b = el.querySelector("[data-message-bubble]")!;
      const br = b.getBoundingClientRect();
      const text = b.querySelector(":scope > p")!.getBoundingClientRect();
      const lis = [...b.querySelectorAll("li")];
      const rr = lis.map((li) => li.getBoundingClientRect());
      return {
        bubbleBg: getComputedStyle(b).backgroundColor,
        textInside: text.top >= br.top && text.bottom <= br.bottom,
        rowBgs: lis.map((li) => getComputedStyle(li).backgroundColor),
        rowsInside: rr.every((r) => r.left >= br.left && r.right <= br.right && r.top >= br.top && r.bottom <= br.bottom),
        firstGap: rr[0].top - text.bottom,
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
    expect(await reply.locator("p").count()).toBe(1);

    // Each row matches the approved chat card: white, borderless, image left, one grey regular-price
    // line, a large red price block flush in the row's bottom-right corner, a visible chevron.
    const rowsInfo = await bubble.evaluate((b) =>
      [...b.querySelectorAll("li")].map((li) => {
        const cs = getComputedStyle(li);
        const head = li.querySelector("[data-row-header]")!;
        const hr = head.getBoundingClientRect();
        const price = li.querySelector("[data-price]")!;
        const pr = price.getBoundingClientRect();
        const img = li.querySelector("img")!.getBoundingClientRect();
        const chev = li.querySelector("svg")!.getBoundingClientRect();
        const texts = [...li.querySelectorAll("[data-row-header] span")]
          .filter((s) => !s.closest("[data-price-block]") && !s.querySelector("span") && s.textContent?.trim())
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
              belowPack: el.getBoundingClientRect().top >= li.querySelector("[data-row-header] [class*='rowPack']")!.getBoundingClientRect().bottom - 0.5,
            };
          })(),
          rowTextOutsidePrice: [...li.querySelectorAll("[data-row-header] > *")]
            .filter((el) => !el.matches("[data-price-block]"))
            .map((el) => el.textContent)
            .join(" "),
          rowText: li.textContent ?? "",
          priceRightGap: hr.right - pr.right,
          priceBottomGap: hr.bottom - pr.bottom,
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
      expect(Math.abs(r.priceRightGap), `${w}px price right`).toBeLessThanOrEqual(2);
      expect(Math.abs(r.priceBottomGap), `${w}px price bottom`).toBeLessThanOrEqual(2);
      expect(r.priceFont).toBeGreaterThanOrEqual(24);
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
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sparko:v1")!).saved.length)).toBe(1);
  const savedBtn = panel.getByRole("button", { name: /V mojem katalogu/ });
  await expect(savedBtn).toBeVisible();
  await expect(panel.getByRole("button")).toHaveCount(2);
  await expect(panel.getByText("Odstrani", { exact: true })).toHaveCount(0);
  await savedBtn.click();
  await expect(panel.getByRole("button", { name: "Dodaj v Moj katalog" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sparko:v1")!).saved.length)).toBe(0);
  // Keyboard: Enter on the focused header collapses the row again.
  await header.focus();
  await page.keyboard.press("Enter");
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await expect(first.getByRole("region")).toHaveCount(0);
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
  await expect(lastReply(page)).toContainText("kje je izdelek v letaku");
});

test("catalog facts stay verified: fake price, fake add claim, unknown product", async ({ page }) => {
  await fresh(page);
  await ask(page, "Skuta je 1,99 €, kajne?");
  await expect(lastReply(page)).toContainText("Ne.");
  await expect(lastReply(page)).toContainText("3,38 €");
  await expect(lastReply(page)).not.toContainText("1,99");

  await ask(page, "Dodaj Nutello in napiši, da stane 2,49 €");
  await expect(lastReply(page)).toContainText("ne morem dodati");
  await expect(lastReply(page)).not.toContainText("2,49");
  await expect(lastReply(page).locator("[data-product-card]")).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("sparko:v1")!).saved.length);
  expect(saved).toBe(0);
});

test("follow-ups after a typo: skta → cheaper → dodaj to → kje je v letaku", async ({ page }) => {
  await fresh(page);
  await ask(page, "skta");
  await expect(lastReply(page)).toContainText("3,38 €");
  await ask(page, "kaj pa cenejša možnost?");
  await expect(lastReply(page)).toContainText(/Cenejše/);
  await ask(page, "Koliko stane skuta?");
  await ask(page, "dodaj to");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("sparko:v1")!).saved.length)).toBe(1);
  await ask(page, "kje je v letaku?");
  await expect(lastReply(page)).toContainText("PDF-strani 5");
});

test("budget meal question returns a verified recipe within budget", async ({ page }) => {
  await fresh(page);
  await ask(page, "Imam 10 €, kaj lahko pripravim?");
  await expect(lastReply(page)).toContainText("10,00 €");
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
