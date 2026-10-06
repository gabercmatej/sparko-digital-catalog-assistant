import { describe, expect, it } from "vitest";
import { getPlacementsForProduct, placements } from "@/lib/catalog";

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
