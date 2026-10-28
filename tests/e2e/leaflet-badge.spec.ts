import { expect, test, type Page } from "@playwright/test";
import { busiestPage, offerOf, primary } from "./catalog-data";

// The busiest SPAR page (several cells of different sizes side by side).
const BUSY = busiestPage(primary);
const PAGE_IDS = BUSY.ids.slice(0, 4);

async function seed(page: Page, productIds: string[]) {
  await page.goto("/");
  await page.evaluate(
    (saved) => {
      localStorage.setItem(
        "sparko:v2",
        JSON.stringify({ v: 1, saved, conversations: [], activeConversationId: null, settings: { spPlus: "unset", leafletHintSeen: true } }),
      );
    },
    productIds.map((id, i) => ({ productId: id, offerId: offerOf(id), savedAt: 1_700_000_000_000 + i })),
  );
}

for (const width of [360, 390, 430, 1280]) {
  test(`'V Mojem katalogu' label is anchored top-left to its own box and stays inside it @${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 1000 ? 800 : 900 });
    await seed(page, PAGE_IDS);
    await page.goto(`/letak?katalog=${primary.id}&stran=${BUSY.index + 1}`);
    const stage = page.getByTestId("leaflet-stage");
    await expect(stage.locator("[data-saved] [data-badge]")).toHaveCount(PAGE_IDS.length);
    await page.waitForTimeout(300);

    const rows = await stage.evaluate((st) =>
      [...st.querySelectorAll<HTMLElement>("[data-saved]")].map((box) => {
        const badge = box.querySelector<HTMLElement>("[data-badge]")!;
        const b = box.getBoundingClientRect();
        const l = badge.getBoundingClientRect();
        const cs = getComputedStyle(badge);
        // Other saved boxes. Side neighbours (sharing this box's rows) must not be touched at all; a
        // box above may only receive the upper half of the pill that straddles the shared gutter.
        const others = [...st.querySelectorAll<HTMLElement>("[data-saved]")]
          .filter((o) => o !== box)
          .map((o) => o.getBoundingClientRect());
        const hits = (o: DOMRect) => l.right > o.left + 0.5 && l.left < o.right - 0.5 && l.bottom > o.top + 0.5 && l.top < o.bottom - 0.5;
        const side = others.filter((o) => o.bottom > b.top + 1 && o.top < b.bottom - 1);
        const above = others.filter((o) => o.bottom <= b.top + 1);
        return {
          id: box.dataset.productId!,
          position: cs.position,
          // Containing block is the saved box inside this product's own hit area.
          parentIsOwnBox: (badge.offsetParent as HTMLElement | null)?.closest("[data-saved]") === box,
          dLeft: l.left - b.left,
          overRight: l.right - b.right,
          straddlesTop: l.top < b.top && l.bottom > b.top,
          fontPx: parseFloat(cs.fontSize) * (l.height / badge.offsetHeight),
          intoNeighbour: side.some(hits) || above.some((o) => hits(o) && o.bottom - l.top > l.height * 0.6),
          text: badge.textContent?.trim(),
          oneLine: l.height < 22,
        };
      }),
    );
    for (const r of rows) {
      expect(r.position, r.id).toBe("absolute");
      expect(r.parentIsOwnBox, `${r.id} anchored to its own box`).toBe(true);
      expect(r.text).toBe("V Mojem katalogu");
      expect(r.dLeft, `${r.id} left inset`).toBeGreaterThanOrEqual(4);
      expect(r.dLeft, `${r.id} left inset`).toBeLessThanOrEqual(12);
      expect(r.overRight, `${r.id} stays inside its box`).toBeLessThanOrEqual(0);
      expect(r.straddlesTop, `${r.id} sits on the top edge`).toBe(true);
      expect(r.intoNeighbour, `${r.id} reaches a neighbour`).toBe(false);
      expect(r.fontPx, `${r.id} readable`).toBeGreaterThanOrEqual(8.5);
      expect(r.oneLine).toBe(true);
    }
    // The inset is box-relative (capped at 10 px), so it never grows with the viewport.
    for (const r of rows) expect(r.dLeft, `${r.id} inset`).toBeLessThanOrEqual(10.5);
  });
}
