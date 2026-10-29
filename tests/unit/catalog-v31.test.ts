/**
 * V3.1 data contract: six re-indexed catalogs, offer-level validity (general dates, page rules mapped through printed
 * page labels, printed per-offer dates), store restrictions, historical data that is never current, and the
 * shopping view (activeProducts) every list starts from. Data-driven: survives re-indexing.
 */
import { describe, expect, it } from "vitest";
import sources from "@/data/catalog-sources.json";
import futureRaw from "@/data/future-promos.json";
import { activeProducts, activeProductsInCatalog, currentEquivalent, isProductActive } from "@/lib/activeCatalog";
import {
  catalogs,
  getCatalog,
  getOffer,
  getPrimaryOffer,
  getProduct,
  historical,
  isHistoricalProduct,
  knownProductIds,
  offers,
  placements,
  products,
} from "@/lib/catalog";
import { catalogValidity, offerState } from "@/lib/offerStatus";
import { isOfferCurrent, referenceDate } from "@/lib/promoCalendar";

const AT = (iso: string) => new Date(`${iso}T12:00:00+01:00`);
const TODAY = AT("2026-10-28");
const pageOf = (offerId: string) => placements.find((p) => p.offerId === offerId)!.pdfPageNumber;
const src = sources as unknown as {
  offers: Record<string, { sourceQuote: string; validityEvidence: string | null }>;
  pages: Record<string, Record<string, { offersOnPage: number | null }>>;
  excluded: Record<string, { page: number }[]>;
};

describe("six current catalogs", () => {
  it("are the V3.1 catalogs in Home order, all with indexed offers", () => {
    expect(catalogs.map((c) => c.id)).toEqual(["spar-4426", "interspar-1526", "spar-online-4426", "despar-koper-1626", "mega-spar-0826", "spar-4326"]);
    for (const c of catalogs) expect(offers.filter((o) => o.catalogId === c.id).length, c.id).toBeGreaterThan(0);
  });

  it("map the printed page numbers of the footnotes to the right PDF pages", () => {
    const rule = (id: string) => getCatalog(id)!.pageRules;
    expect(rule("spar-4426")).toEqual([{ pdfPages: [34, 35, 36, 37, 38, 39], printedLabels: ["22", "23", "24", "25", "26", "27"], from: "2026-10-28", to: "2026-11-10" }]);
    expect(rule("interspar-1526")).toEqual([{ pdfPages: [3, 4, 5, 6, 7], printedLabels: ["3", "4", "5", "6", "7"], from: "2026-10-21", to: "2026-11-03" }]);
    expect(rule("spar-4326")).toEqual([{ pdfPages: [3, 36], printedLabels: ["3", "23"], from: "2026-10-21", to: "2026-11-03" }]);
    expect(rule("spar-online-4426")).toEqual([]);
    expect(rule("despar-koper-1626")).toEqual([]);
  });

  it("every offer's page lies inside its catalog and every product has an image and a placement", () => {
    for (const o of offers) {
      const c = getCatalog(o.catalogId)!;
      const n = pageOf(o.id);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(c.pageCount);
      expect(getProduct(o.productId)!.image.src).toMatch(/^\/products\/.+\.webp$/);
    }
  });

  it("product ids carry the catalog context and are unique", () => {
    const ids = products.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const suffix: Record<string, string> = {
      "spar-4426": "4426",
      "interspar-1526": "1526",
      "spar-online-4426": "online4426",
      "despar-koper-1626": "despar1626",
      "mega-spar-0826": "mega0826",
      "spar-4326": "4326",
    };
    for (const o of offers) expect(o.productId.endsWith(`-${suffix[o.catalogId]}`), o.productId).toBe(true);
  });

  it("every price is traceable to a printed quote, and no regular price / percentage contradicts the price", () => {
    for (const o of offers) {
      expect(src.offers[o.id]?.sourceQuote, o.id).toBeTruthy();
      if (o.regularPriceCents != null) expect(o.regularPriceCents).toBeGreaterThan(o.priceCents);
      if (o.regularPriceCents != null && o.discountPercent != null) {
        expect(Math.abs(Math.round((1 - o.priceCents / o.regularPriceCents) * 100) - o.discountPercent), o.id).toBeLessThanOrEqual(3);
      }
    }
  });

  it("coverage: indexed + excluded = printed offers on every page", () => {
    for (const c of catalogs) {
      for (let n = 1; n <= c.pageCount; n++) {
        const pg = src.pages[c.id][String(n)];
        const indexed = placements.filter((p) => p.catalogId === c.id && p.pdfPageNumber === n).length;
        const ex = src.excluded[c.id].filter((e) => e.page === n).length;
        expect(pg.offersOnPage, `${c.id} p${n}`).toBe(indexed + ex);
      }
    }
  });
});

describe("offer-level validity", () => {
  it("SPAR 44/26: general pages end 3. 11., printed pages 22–27 (PDF 34–39) end 10. 11. — never a blanket period", () => {
    const own = offers.filter((o) => o.catalogId === "spar-4426");
    const general = own.filter((o) => o.validity.status === "catalog_default");
    expect(general.length).toBeGreaterThan(0);
    for (const o of general) expect(o.validity.to).toBe("2026-11-03");
    for (const o of own.filter((x) => [34, 35, 36, 37, 38, 39].includes(pageOf(x.id)))) expect(o.validity.to! >= "2026-11-10", o.id).toBe(true);
    for (const o of own.filter((x) => pageOf(x.id) < 34 && x.validity.status === "catalog_default")) expect(o.validity.to).toBe("2026-11-03");
  });

  it("INTERSPAR 15/26: pages 3–7 run to 3. 11., the rest ended 27. 10.", () => {
    for (const o of offers.filter((x) => x.catalogId === "interspar-1526")) {
      const n = pageOf(o.id);
      if (n >= 3 && n <= 7) expect(o.validity.to, o.id).toBe("2026-11-03");
      else if (o.validity.status === "catalog_default") expect(o.validity.to).toBe("2026-10-27");
    }
  });

  it("SPAR 43/26: PDF pages 3 and 36 (printed 3, 23) run to 3. 11.; elsewhere only offers with their own printed dates outlive 27. 10.", () => {
    for (const o of offers.filter((x) => x.catalogId === "spar-4326")) {
      const n = pageOf(o.id);
      if (n === 3 || n === 36) expect(o.validity.to, o.id).toBe("2026-11-03");
      else if (o.validity.to! > "2026-10-27") expect(src.offers[o.id].validityEvidence, o.id).toMatch(/»/);
    }
  });

  it("on 28. 10. 2026 no offer that ended 27. 10. is current, and the 3. 11. exceptions are", () => {
    expect(referenceDate(TODAY)).toBe("2026-10-28");
    for (const o of offers) {
      if (o.validity.to! < "2026-10-28") expect(isOfferCurrent(o, TODAY), o.id).toBe(false);
      if (o.validity.from! <= "2026-10-28" && o.validity.to! >= "2026-10-28") expect(isOfferCurrent(o, TODAY), o.id).toBe(true);
    }
    const p3 = offers.filter((o) => o.catalogId === "spar-4326" && pageOf(o.id) === 3);
    if (p3.length) expect(p3.every((o) => isOfferCurrent(o, TODAY))).toBe(true);
  });

  it("on 4. 11. the SPAR 44/26 general pages are expired while its pages 22–27 are still current", () => {
    const at = AT("2026-11-04");
    const own = offers.filter((o) => o.catalogId === "spar-4426");
    for (const o of own.filter((x) => x.validity.status === "catalog_default")) expect(isOfferCurrent(o, at)).toBe(false);
    const late = own.filter((x) => x.validity.status === "explicit" && x.validity.from! <= "2026-11-04" && x.validity.to! >= "2026-11-04");
    for (const o of late) expect(isOfferCurrent(o, at)).toBe(true);
  });

  it("catalog cards: 43/26 and INTERSPAR show an expired general period with a still-valid part on 28. 10.", () => {
    const norm = (v: { state: string; extra: string | null }) => ({ state: v.state, extra: v.extra?.replace(/\s/g, " ") });
    expect(norm(catalogValidity(getCatalog("spar-4326")!, TODAY))).toEqual({ state: "partial", extra: "Del ponudbe do 3. 11." });
    expect(norm(catalogValidity(getCatalog("interspar-1526")!, TODAY))).toEqual({ state: "partial", extra: "Del ponudbe do 3. 11." });
    expect(norm(catalogValidity(getCatalog("spar-4426")!, TODAY))).toEqual({ state: "current", extra: "Del ponudbe do 10. 11." });
    expect(catalogValidity(getCatalog("spar-4326")!, AT("2026-11-05")).state).toBe("expired");
  });
});

describe("store restrictions", () => {
  it("DESPAR Koper and SPAR Online offers always carry their restriction", () => {
    for (const o of offers.filter((x) => x.catalogId === "despar-koper-1626")) {
      expect(o.availability.restricted).toBe(true);
      expect(o.availability.note).toMatch(/DESPAR Koper/);
    }
    for (const o of offers.filter((x) => x.catalogId === "spar-online-4426")) expect(o.availability.note).toMatch(/SPAR Online/);
  });
});

describe("historical data (SPAR 41/26, INTERSPAR 14/26)", () => {
  it("resolves by id for saved items but is never listed or current", () => {
    const h = historical.products[0];
    expect(getProduct(h.id)).toBeDefined();
    expect(isHistoricalProduct(h.id)).toBe(true);
    expect(knownProductIds.has(h.id)).toBe(true);
    expect(products.some((p) => p.id === h.id)).toBe(false);
    for (const o of historical.offers) expect(isOfferCurrent(o, TODAY)).toBe(false);
    expect(offerState(getPrimaryOffer(h.id)!, TODAY)).toBe("expired");
    expect(activeProducts(TODAY).some((p) => isHistoricalProduct(p.id))).toBe(false);
  });

  it("maps a historical saved item only to the identical article (same identityKey)", () => {
    for (const h of historical.products) {
      const eq = currentEquivalent(h.id, TODAY);
      if (eq) expect(eq.identityKey).toBe(h.identityKey);
    }
  });
});

describe("shopping view (activeProducts)", () => {
  it("contains only current offers, one card per article", () => {
    const list = activeProducts(TODAY);
    expect(list.length).toBeGreaterThan(50);
    for (const p of list) expect(isProductActive(p.id, TODAY)).toBe(true);
    const keys = list.map((p) => p.identityKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has current offers from SPAR 44/26 and none from expired SPAR 43/26 general pages", () => {
    expect(activeProductsInCatalog("spar-4426", TODAY).length).toBeGreaterThan(0);
    for (const p of activeProductsInCatalog("spar-4326", TODAY)) {
      const o = getPrimaryOffer(p.id)!;
      if (![3, 36].includes(pageOf(o.id))) expect(src.offers[o.id].validityEvidence, o.id).toMatch(/»/);
    }
  });
});

describe("simulated next-week promos (DEMO MOCK)", () => {
  const fp = futureRaw as { mock: boolean; period: { from: string }; promos: { productId: string; priceCents: number; validFrom: string }[] };
  it("are marked mock, use real current products and never undercut into the current period", () => {
    expect(fp.mock).toBe(true);
    for (const p of fp.promos) {
      const o = getPrimaryOffer(p.productId)!;
      expect(o).toBeDefined();
      expect(p.priceCents).toBeLessThan(o.priceCents);
      expect(p.validFrom > o.validity.to!).toBe(true);
      expect(getOffer(o.id)).toBe(o);
    }
  });
});

describe("line detection", () => {
  it("prefers the longest line/brand match (Natur Premium is not the PREMIUM line)", async () => {
    const { detectLine } = await import("@/lib/assistant/search");
    expect(detectLine("Koliko stane Piščanec Natur Premium IK?")).toBe("naturpremium");
    expect(detectLine("Kaj je v liniji S-BUDGET?")).toBe("sbudget");
  });
});
