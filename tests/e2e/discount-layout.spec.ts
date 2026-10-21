import { expect, test, type Page } from "@playwright/test";
import { catalogOfProduct, catalogs, retailerLabel } from "./catalog-data";

const chatLog = (page: Page) => page.getByRole("log", { name: "Pogovor s Sparkom" });
const replies = (page: Page) => chatLog(page).locator('[data-role="assistant"]');
const input = (page: Page) => page.getByPlaceholder("Vprašaj Sparka o katalogu …");

async function fresh(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
}

async function ask(page: Page, text: string) {
  await input(page).fill(text);
  await input(page).press("Enter");
  await expect(replies(page).last()).not.toContainText("Sparko piše", { timeout: 15_000 });
}

const expectedLabel = (productId: string) => retailerLabel(catalogs.find((c) => c.id === catalogOfProduct(productId))!);

type RowGeo = {
  id: string | null;
  img: { w: number; h: number } | null;
  chevron: Box | null;
  retailer: Box | null;
  retailerText: string;
  now: Box | null;
  upcoming: Box | null;
  radii: string[];
};
type Box = { l: number; t: number; r: number; b: number };

/** Geometry of every product row in the section (any depth). */
async function sectionGeo(page: Page, reply: ReturnType<typeof replies>, section: "current" | "upcoming"): Promise<RowGeo[]> {
  return reply.locator(`[data-timeline-section="${section}"]`).evaluate((sec) => {
    const box = (e: Element | null): Box | null => {
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    return [...sec.querySelectorAll("[data-product-row-id]")].map((row) => {
      const img = row.querySelector("img");
      const ir = img?.getBoundingClientRect();
      const retailer = row.querySelector("[data-retailer]");
      return {
        id: row.getAttribute("data-product-row-id"),
        img: ir ? { w: ir.width, h: ir.height } : null,
        chevron: box(row.querySelector("[data-row-chevron]")),
        retailer: box(retailer),
        retailerText: retailer?.textContent?.trim() ?? "",
        now: box(row.querySelector('[data-price-pill="now"]')),
        upcoming: box(row.querySelector('[data-price-pill="upcoming"]')),
        radii: [...row.querySelectorAll("[data-price-pill]")].flatMap((p) => {
          const cs = getComputedStyle(p);
          return [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius];
        }),
      };
    });
  });
}

const intersects = (a: Box, b: Box) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;

for (const w of [390, 320]) {
  test(`discount rows share one layout in both timeline sections @${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await fresh(page);

    // 1) Generic discount question: current section, no upcoming section.
    await ask(page, "Kaj je najbolj znižano?");
    const first = replies(page).nth(0);
    await expect(first.locator('[data-timeline-section="current"]')).toBeVisible();
    await expect(first.locator('[data-timeline-section="upcoming"]')).toHaveCount(0);

    // 2) Timing question: upcoming section is present (promotion routing still works).
    await ask(page, "Kdaj bo Perutnina Ptuj znižana?");
    const second = replies(page).last();
    await expect(second.locator('[data-timeline-section="upcoming"]')).toBeVisible();

    const cur = await sectionGeo(page, first, "current");
    const up = await sectionGeo(page, second, "upcoming");
    expect(cur.length, "current rows").toBeGreaterThanOrEqual(2);
    expect(up.length, "upcoming rows").toBeGreaterThanOrEqual(1);

    // Same image box across both sections.
    const ref = cur[0].img!;
    expect(ref, "current row has an image").not.toBeNull();
    for (const [name, rows] of [["current", cur], ["upcoming", up]] as const) {
      for (const r of rows) {
        expect(r.img, `${name} ${r.id} image`).not.toBeNull();
        expect(Math.abs(r.img!.w - ref.w), `${name} ${r.id} image width`).toBeLessThanOrEqual(2);
        expect(Math.abs(r.img!.h - ref.h), `${name} ${r.id} image height`).toBeLessThanOrEqual(2);
      }
    }

    for (const [name, rows] of [["current", cur], ["upcoming", up]] as const) {
      for (const r of rows) {
        const ctx = `${name} ${r.id} @${w}px`;
        expect(r.retailer, `${ctx}: retailer label`).not.toBeNull();
        expect(r.retailerText, `${ctx}: retailer text`).toMatch(/^(SPAR|INTERSPAR)$/);
        expect(r.retailerText, `${ctx}: retailer matches catalog`).toBe(expectedLabel(r.id!));
        if (r.chevron) expect(intersects(r.chevron, r.retailer!), `${ctx}: chevron vs retailer`).toBe(false);
        if (r.now && r.upcoming) expect(intersects(r.now, r.upcoming), `${ctx}: red vs blue pill`).toBe(false);
        for (const rad of r.radii) expect(rad, `${ctx}: pill radius`).toBe("0px");
      }
    }
    // Chevrons exist on the rows (shared row component).
    expect(cur.filter((r) => r.chevron).length, "current rows have chevrons").toBeGreaterThan(0);
    // The timing answer shows both price pills on at least one row.
    expect(up.some((r) => r.now && r.upcoming), "an upcoming row shows red now + blue upcoming pill").toBe(true);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal overflow").toBe(true);
  });
}
