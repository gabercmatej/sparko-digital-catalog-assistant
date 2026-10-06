import { describe, expect, it } from "vitest";
import { discountLine, getOffer, getPlacementsForProduct, offers, placements } from "@/lib/catalog";
import type { Offer } from "@/lib/types";

const base = getOffer("offer-moka-manitoba-1kg-4026")!;
const variant = (patch: Partial<Offer>, conditions: Partial<Offer["conditions"]> = {}): Offer => ({
  ...base,
  ...patch,
  conditions: { ...base.conditions, ...conditions },
});

describe("discountLine (compact chat rows)", () => {
  it("formats card, percentage and regular price from verified offer fields only", () => {
    expect(base.conditions.note).toMatch(/natisnjeno/);
    expect(discountLine(base)).toBe("S kartico SPAR plus · 46 % znižano · redna cena 1,39 €");
  });

  it("never prints the printed note, labels or validity", () => {
    for (const o of offers) {
      const line = discountLine(o);
      if (line) expect(line).not.toMatch(/natisnjeno|MEGA|Velja|PC /);
    }
  });

  it("omits parts whose data is null", () => {
    expect(discountLine(variant({}, { spPlusRequired: false }))).toBe("46 % znižano · redna cena 1,39 €");
    expect(discountLine(variant({ regularPriceCents: null }, { spPlusRequired: false }))).toBe("46 % znižano");
    expect(discountLine(variant({ discountPercent: null }, { spPlusRequired: false }))).toBe("redna cena 1,39 €");
    expect(discountLine(variant({ discountPercent: null, regularPriceCents: null }))).toBe("S kartico SPAR plus");
    expect(discountLine(variant({ discountPercent: null, regularPriceCents: null }, { spPlusRequired: false }))).toBeNull();
  });

  it("every discounted offer yields the short row format", () => {
    for (const o of offers.filter((x) => x.discountPercent != null && x.regularPriceCents != null)) {
      expect(discountLine(o)).toMatch(/^(S kartico SPAR plus · )?\d+ % znižano · redna cena \d+,\d{2} €$/);
    }
  });
});

describe("leaflet bounding boxes follow the printed cell grid", () => {
  const bb = (productId: string) => getPlacementsForProduct(productId)[0].bbox;
  const bottom = (b: { y: number; height: number }) => b.y + b.height;

  it("page 5: salama and skuta fill the same bottom-row cell height; pommes and zrezki share the top edge", () => {
    const salama = bb("sb-salama-400g");
    const skuta = bb("sb-skuta-1kg");
    expect(salama.y).toBeCloseTo(skuta.y, 4);
    expect(salama.height).toBeCloseTo(skuta.height, 4);
    expect(bb("sb-pommes-1kg").y).toBeCloseTo(bb("sb-zrezki-500g").y, 4);
    expect(bottom(bb("sb-pommes-1kg"))).toBeCloseTo(bottom(skuta), 3);
  });

  it("boxes on the same page never overlap and stay inside the page", () => {
    const byPage = new Map<number, typeof placements>();
    for (const pl of placements) byPage.set(pl.pdfPageIndex, [...(byPage.get(pl.pdfPageIndex) ?? []), pl]);
    for (const list of byPage.values()) {
      for (const { bbox: b } of list) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(1.0001);
        expect(bottom(b)).toBeLessThanOrEqual(1.0001);
      }
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i].bbox, c = list[j].bbox;
          const overlap = a.x < c.x + c.width && c.x < a.x + a.width && a.y < c.y + c.height && c.y < a.y + a.height;
          expect(overlap, `${list[i].id} × ${list[j].id}`).toBe(false);
        }
    }
  });
});
