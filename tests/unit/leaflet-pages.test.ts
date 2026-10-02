import { describe, expect, it } from "vitest";
import { adjacentPage, allPageIndexes, leafletQuery, nearestPage, pagesWithProducts, parsePageParam } from "@/components/leaflet/pages";
import type { Placement } from "@/lib/types";

const pl = (offerId: string, idx: number): Placement => ({
  id: `pl-${offerId}-${idx}`,
  offerId,
  pdfPageIndex: idx,
  pdfPageNumber: idx + 1,
  printedPageLabel: null,
  bbox: { x: 0, y: 0, width: 0.1, height: 0.1 },
});

describe("leaflet pages", () => {
  it("parses the 1-based stran param into a 0-based index", () => {
    expect(parsePageParam("5", 38)).toBe(4);
    expect(parsePageParam("1", 38)).toBe(0);
    expect(parsePageParam("38", 38)).toBe(37);
    expect(parsePageParam("0", 38)).toBeNull();
    expect(parsePageParam("39", 38)).toBeNull();
    expect(parsePageParam("abc", 38)).toBeNull();
    expect(parsePageParam("5x", 38)).toBeNull();
    expect(parsePageParam(null, 38)).toBeNull();
  });

  it("lists all page indexes", () => {
    expect(allPageIndexes(3)).toEqual([0, 1, 2]);
    expect(allPageIndexes(0)).toEqual([]);
  });

  it("finds unique sorted pages with saved products, including repeated placements", () => {
    const placements = [pl("o-a", 7), pl("o-b", 4), pl("o-a", 2), pl("o-c", 4)];
    const map: Record<string, string> = { "o-a": "a", "o-b": "b", "o-c": "c" };
    expect(pagesWithProducts(["a", "b"], placements, (o) => map[o])).toEqual([2, 4, 7]);
    expect(pagesWithProducts([], placements, (o) => map[o])).toEqual([]);
  });

  it("pages forward/backward within the visible set, even from a page outside it", () => {
    const visible = [2, 4, 7];
    expect(adjacentPage(4, visible, 1)).toBe(7);
    expect(adjacentPage(4, visible, -1)).toBe(2);
    expect(adjacentPage(7, visible, 1)).toBeNull();
    expect(adjacentPage(2, visible, -1)).toBeNull();
    expect(adjacentPage(5, visible, 1)).toBe(7);
    expect(adjacentPage(5, visible, -1)).toBe(4);
  });

  it("nearestPage picks the closest visible page", () => {
    expect(nearestPage(5, [2, 4, 7])).toBe(4);
    expect(nearestPage(6, [2, 4, 8])).toBe(8);
    expect(nearestPage(3, [])).toBeNull();
  });

  it("builds the leaflet query", () => {
    expect(leafletQuery(4)).toBe("?stran=5");
    expect(leafletQuery(4, { productId: "sb-skuta-1kg", mine: true })).toBe("?stran=5&izdelek=sb-skuta-1kg&moji=1");
  });
});
