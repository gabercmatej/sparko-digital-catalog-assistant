import { describe, expect, it } from "vitest";
import sources from "@/data/catalog-sources.json";
import { activeProducts, activeRecipes, isProductActive } from "@/lib/activeCatalog";
import { newInCatalog } from "@/lib/assistant/catalogQuery";
import { rankDiscounts } from "@/lib/assistant/discounts";
import {
  catalogs,
  getCatalog,
  getOffer,
  getPlacementsForProduct,
  getPrimaryOffer,
  getProduct,
  isHistoricalProduct,
  newProducts,
  offers,
  placements,
  primaryCatalog,
  products,
  recipes,
} from "@/lib/catalog";
import { futurePromos } from "@/lib/futurePromos";
import { offerState } from "@/lib/offerStatus";
import { isOfferCurrent, offerWindow, referenceDate } from "@/lib/promoCalendar";
import { categoryLabel } from "@/lib/recommendations";
import type { Product } from "@/lib/types";

const src = sources as unknown as { offers: Record<string, { sourceQuote: string; validityEvidence: string | null }> };

describe("leaflet bounding boxes follow the printed cell grid", () => {
  const bb = (productId: string) => getPlacementsForProduct(productId)[0].bbox;
  const bottom = (b: { y: number; height: number }) => b.y + b.height;

  it("SPAR p. 6: the two Perutnina Ptuj cells share the top edge and height; mleto meso and svinjske kocke share the bottom row", () => {
    const italijansko = bb("piscancje-meso-po-italijansko-800g");
    const stajerski = bb("stajerski-piscanec-1kg");
    expect(italijansko.y).toBeCloseTo(stajerski.y, 4);
    expect(italijansko.height).toBeCloseTo(stajerski.height, 4);
    expect(bb("mleto-meso-ave-1kg").y).toBeCloseTo(bb("sb-svinjske-kocke-500g").y, 4);
    expect(bottom(bb("mleto-meso-ave-1kg"))).toBeCloseTo(bottom(bb("sb-svinjske-kocke-500g")), 3);
    // Pivka fillets sit in the middle row of the same page, above the Perutnina Ptuj row
    expect(bottom(bb("piscancji-file-pivka-540g"))).toBeLessThan(italijansko.y + 0.01);
  });

  it("INTERSPAR p. 8: the three bakery blocks are one row side by side", () => {
    const [a, b, c] = ["bio-kornstrucka-76g", "bio-fitnes-strucka-117g", "bio-pirin-kruh-600g"].map(bb);
    expect(a.y).toBeCloseTo(b.y, 4);
    expect(b.y).toBeCloseTo(c.y, 4);
    expect(a.x + a.width).toBeLessThanOrEqual(b.x + 1e-6);
    expect(b.x + b.width).toBeLessThanOrEqual(c.x + 1e-6);
  });

  it("boxes stay inside the page and, on the same page of the same catalog, only touch slightly (lifestyle layouts overlap a little, never replace each other)", () => {
    const byPage = new Map<string, typeof placements>();
    for (const pl of placements) {
      const key = `${pl.catalogId}#${pl.pdfPageIndex}`;
      byPage.set(key, [...(byPage.get(key) ?? []), pl]);
    }
    for (const list of byPage.values()) {
      for (const { bbox: b } of list) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(1.0001);
        expect(b.y + b.height).toBeLessThanOrEqual(1.0001);
      }
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i].bbox;
          const c = list[j].bbox;
          const ox = Math.min(a.x + a.width, c.x + c.width) - Math.max(a.x, c.x);
          const oy = Math.min(a.y + a.height, c.y + c.height) - Math.max(a.y, c.y);
          const inter = ox > 0 && oy > 0 ? ox * oy : 0;
          const iou = inter / (a.width * a.height + c.width * c.height - inter);
          expect(iou, `${list[i].id} × ${list[j].id}`).toBeLessThan(0.5);
        }
    }
  });
});

describe("data version 3: six catalogs", () => {
  it("has the six current catalogs in Home order with consistent pages, pdf and cover", () => {
    expect(catalogs.map((c) => c.id)).toEqual(["spar-4426", "interspar-1526", "spar-online-4426", "despar-koper-1626", "mega-spar-0826", "spar-4326"]);
    expect(catalogs.map((c) => c.retailer)).toEqual(["spar", "interspar", "spar-online", "despar", "spar", "spar"]);
    for (const c of catalogs) {
      expect(c.pageCount, c.id).toBeGreaterThan(0);
      expect(c.pages, c.id).toHaveLength(c.pageCount);
      expect(c.validFrom <= c.validTo, c.id).toBe(true);
      expect(c.publishedDate <= c.validFrom, c.id).toBe(true);
      expect(c.cover.src).toBe(`/catalog/${c.id}/cover.webp`);
      expect(c.pdfUrl).toBe(`/catalog/${c.id}/katalog.pdf`);
    }
  });

  it("every offer belongs to an existing catalog, has exactly one product-offer and at least one placement on a page of that catalog", () => {
    for (const o of offers) {
      const cat = getCatalog(o.catalogId);
      expect(cat, o.id).toBeDefined();
      expect(offers.filter((x) => x.productId === o.productId), o.productId).toHaveLength(1);
      const pls = placements.filter((p) => p.offerId === o.id);
      expect(pls.length, o.id).toBeGreaterThan(0);
      for (const pl of pls) {
        expect(pl.catalogId).toBe(o.catalogId);
        expect(pl.pdfPageIndex).toBeLessThan(cat!.pageCount);
      }
    }
  });

  it("the shopping view (current offers) spans more than one catalog and more than one retailer", () => {
    const cats = activeProducts().map((p) => getPrimaryOffer(p.id)!.catalogId);
    expect(new Set(cats).size).toBeGreaterThanOrEqual(2);
    expect(new Set(cats.map((id) => getCatalog(id)!.retailer)).size).toBeGreaterThanOrEqual(2);
  });

  it("covers the categories the home screen browses (among current products)", () => {
    for (const slug of ["meso", "mlecni-izdelki", "sadje", "zelenjava", "osnovna-zivila", "sladko", "pijace", "pekovsko", "zajtrk"]) {
      expect(activeProducts().filter((p) => p.categories.includes(slug)).length, slug).toBeGreaterThanOrEqual(3);
    }
  });

  it("has enough printed percent discounts for the discount ranking, and plain-price items too", () => {
    expect(offers.filter((o) => o.discountPercent !== null).length).toBeGreaterThanOrEqual(10);
    expect(offers.filter((o) => o.discountPercent === null).length).toBeGreaterThan(0);
    expect(rankDiscounts({ limit: Infinity }).length).toBeGreaterThanOrEqual(10);
  });
});

describe("branded products", () => {
  // The brand with the most current products stands in for the old fixed brand (Perutnina Ptuj): it must be searchable.
  const byBrand = new Map<string, Product[]>();
  for (const p of activeProducts()) if (p.brand) byBrand.set(p.brand, [...(byBrand.get(p.brand) ?? []), p]);
  const [brand, list] = [...byBrand.entries()].sort((a, b) => b[1].length - a[1].length)[0];

  it("the most frequent brand has at least three current offers, all verified, with the brand among the search aliases or name", () => {
    expect(list.length).toBeGreaterThanOrEqual(3);
    for (const p of list) {
      expect(getPrimaryOffer(p.id)?.verification.status, p.id).toBe("verified");
      const hay = [p.name, ...p.aliases].join(" ").toLowerCase();
      expect(hay, `${p.id} ${brand}`).toContain(brand.toLowerCase());
    }
  });

  it("every product has search aliases and every offer is verified", () => {
    for (const p of products) expect(p.aliases.length, p.id).toBeGreaterThan(0);
    for (const o of offers) expect(o.verification.status, o.id).toBe("verified");
  });

  it("prices of offers with a printed discount are internally consistent and traceable to the printed quote", () => {
    const withDiscount = activeProducts()
      .map((p) => getPrimaryOffer(p.id)!)
      .filter((o) => o.discountPercent != null && o.regularPriceCents != null);
    expect(withDiscount.length).toBeGreaterThanOrEqual(10);
    for (const o of withDiscount) {
      expect(o.regularPriceCents!, o.id).toBeGreaterThan(o.priceCents);
      expect(Math.abs(Math.round((1 - o.priceCents / o.regularPriceCents!) * 100) - o.discountPercent!), o.id).toBeLessThanOrEqual(1);
      expect(src.offers[o.id]?.sourceQuote, o.id).toBeTruthy();
    }
  });
});

describe("novo v katalogu flags", () => {
  it("every isNew product has a documented source and a real placement; newProducts() lists exactly the flagged ones", () => {
    const flagged = newProducts();
    expect(flagged.map((p) => p.id)).toEqual(products.filter((p) => p.isNew).map((p) => p.id));
    expect(flagged.length).toBeGreaterThan(0);
    for (const p of products) {
      if (p.isNew) expect(["printed_badge", "demo_editorial"]).toContain(p.newSource);
      else expect(p.newSource).toBeNull();
    }
    for (const p of flagged) {
      const pl = getPlacementsForProduct(p.id)[0];
      expect(pl, p.id).toBeDefined();
      expect(pl.pdfPageNumber).toBeGreaterThanOrEqual(1);
    }
  });

  it("Home »Kaj je novega« lists printed NOVO offers among the current ones, else the newest-start offers", () => {
    const { products: list } = newInCatalog();
    const active = new Set(activeProducts().map((p) => p.id));
    expect(list.length).toBeGreaterThan(0);
    for (const p of list) expect(active.has(p.id), p.id).toBe(true);
    if (activeProducts().some((p) => p.isNew)) for (const p of list) expect(p.isNew).toBe(true);
  });

  it("flagged products come from more than one catalog", () => {
    expect(new Set(newProducts().map((p) => getPrimaryOffer(p.id)!.catalogId)).size).toBeGreaterThanOrEqual(2);
  });
});

describe("verified facts of selected offers", () => {
  it("an active loyalty-price offer with a printed discount keeps price, regular price and percent coherent and needs the card", () => {
    const o = activeProducts()
      .map((p) => getPrimaryOffer(p.id)!)
      .find((x) => x.discountPercent != null && x.regularPriceCents != null && x.priceKind === "loyalty_price")!;
    expect(o).toBeDefined();
    expect(o.conditions.spPlusRequired).toBe(true);
    expect(o.priceCents).toBeLessThan(o.regularPriceCents!);
    expect(offerState(o)).toBe("current");
  });

  it("unit prices are per kg or l and positive", () => {
    const withUnit = offers.filter((o) => o.unitPrice);
    expect(withUnit.length).toBeGreaterThan(0);
    for (const o of withUnit) {
      expect(["kg", "l"]).toContain(o.unitPrice!.per);
      expect(o.unitPrice!.cents, o.id).toBeGreaterThan(0);
    }
  });

  it("S-BUDGET items carry no printed discount", () => {
    expect(activeProducts().some((p) => p.line === "S-BUDGET")).toBe(true);
    for (const p of products.filter((x) => x.line === "S-BUDGET")) {
      expect(getPrimaryOffer(p.id), p.id).toMatchObject({ regularPriceCents: null, discountPercent: null, priceKind: "catalog_price" });
    }
  });

  it("offers without a page exception fall back to the general catalog validity; offers with their own date carry the printed evidence", () => {
    const defaults = offers.filter((o) => o.validity.status === "catalog_default");
    const explicit = offers.filter((o) => o.validity.status === "explicit");
    expect(defaults.length).toBeGreaterThan(0);
    expect(explicit.length).toBeGreaterThan(0);
    for (const o of defaults) {
      const c = getCatalog(o.catalogId)!;
      expect(o.validity, o.id).toMatchObject({ from: c.validFrom, to: c.validTo });
    }
    for (const o of explicit) {
      expect(o.validity.from! <= o.validity.to!, o.id).toBe(true);
      expect(src.offers[o.id]?.validityEvidence, o.id).toBeTruthy();
    }
  });
});

describe("recipes", () => {
  it("cover a dinner, a lunch and a breakfast and use only existing whole-pack offers", () => {
    expect(new Set(recipes.map((r) => r.kind))).toEqual(new Set(["dinner", "lunch", "breakfast"]));
    for (const r of recipes)
      for (const ing of r.ingredients) {
        const o = getOffer(ing.offerId);
        expect(o, ing.offerId).toBeDefined();
        expect(o!.priceUnit).toBe("pack");
      }
  });

  it("recipes are only suggested when every ingredient is on a current offer (activeRecipes)", () => {
    const ok = activeRecipes();
    expect(ok.length).toBeGreaterThan(0);
    for (const r of ok) for (const i of r.ingredients) expect(isOfferCurrent(getOffer(i.offerId)!), i.offerId).toBe(true);
  });

  it("totals stay within budget, even at regular prices for card-only lines", () => {
    for (const r of recipes) {
      if (r.budgetCents === null) continue;
      let withCard = 0;
      let without = 0;
      for (const ing of r.ingredients) {
        const o = getOffer(ing.offerId)!;
        withCard += ing.packsNeeded * o.priceCents;
        without += ing.packsNeeded * (o.conditions.spPlusRequired ? (o.regularPriceCents ?? o.priceCents) : o.priceCents);
      }
      expect(withCard, r.id).toBeLessThanOrEqual(r.budgetCents);
      expect(without, r.id).toBeLessThanOrEqual(r.budgetCents);
    }
  });
});

describe("future promos (demo mock)", () => {
  it("every promo is cheaper than the product's current offer, belongs to the offer's catalog and starts after the reference date and the offer's validity", () => {
    expect(futurePromos.length).toBeGreaterThanOrEqual(8);
    for (const p of futurePromos) {
      const offer = getPrimaryOffer(p.productId)!;
      expect(offer, p.id).toBeDefined();
      expect(p.priceCents, p.id).toBeLessThan(offer.priceCents);
      expect(p.catalogId).toBe(offer.catalogId);
      expect(p.validFrom > referenceDate(), p.id).toBe(true);
      expect(p.validFrom > offerWindow(offer)!.to, p.id).toBe(true);
      if (p.regularPriceCents !== null) expect(p.discountPercent).toBe(Math.round(((p.regularPriceCents - p.priceCents) / p.regularPriceCents) * 100));
    }
  });

  it("cover at least three distinct current products of at least three different brands or lines", () => {
    expect(new Set(futurePromos.map((p) => p.productId)).size).toBeGreaterThanOrEqual(3);
    for (const p of futurePromos) expect(isProductActive(p.productId), p.productId).toBe(true);
    const labels = new Set(futurePromos.map((p) => getProduct(p.productId)!.brand ?? getProduct(p.productId)!.line));
    expect(labels.size).toBeGreaterThanOrEqual(3);
  });
});

describe("extended leaflet coverage", () => {
  const onPage = (catalogId: string, page: number) =>
    placements.filter((p) => p.catalogId === catalogId && p.pdfPageNumber === page).map((p) => getOffer(p.offerId)!.productId);

  it("maps hundreds of products, every catalog has placements, and placements, offers and products are 1:1", () => {
    expect(products.length).toBeGreaterThan(300);
    for (const c of catalogs) expect(placements.filter((p) => p.catalogId === c.id).length, c.id).toBeGreaterThan(0);
    expect(placements).toHaveLength(offers.length);
    expect(offers).toHaveLength(products.length);
  });

  it("the cover page of the default catalog is interactive: its products have prices and resolve back to that page", () => {
    const ids = onPage(primaryCatalog.id, 1);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(getPrimaryOffer(id)!.priceCents, id).toBeGreaterThan(0);
      expect(getPlacementsForProduct(id).some((pl) => pl.pdfPageNumber === 1 && pl.catalogId === primaryCatalog.id)).toBe(true);
    }
  });

  it("multi-buy offers keep their printed condition in the offer note (the cheap price is not unconditional)", () => {
    const multi = offers.filter((o) => /ob nakupu|\d\s*\+\s*\d\b|gratis|VEČ JE CENEJE/i.test(src.offers[o.id]?.sourceQuote ?? ""));
    expect(multi.length).toBeGreaterThan(0);
    for (const o of multi) expect(o.conditions.note, o.id).toBeTruthy();
  });

  it("products use well-formed category slugs, have a primary category, an image and a unique editorial rank", () => {
    for (const p of products) {
      expect(p.categories.length, p.id).toBeGreaterThan(0);
      for (const c of p.categories) {
        expect(c, p.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(categoryLabel(c).length, `${p.id}: ${c}`).toBeGreaterThan(0);
      }
      expect(p.image.src).toBe(`/products/${p.id}.webp`);
    }
    const ranks = products.map((p) => p.editorialRank);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it("category labels read as Slovenian words (hyphenated slugs and diacritics are not shown raw)", () => {
    expect(categoryLabel("alkoholne-pijace")).toBe("alkoholne pijače");
    expect(categoryLabel("hisni-ljubljencki")).toBe("hišni ljubljenčki");
    expect(categoryLabel("otroska-hrana")).toBe("otroška hrana");
  });

  it("editorial ranks are contiguous from 1 in the exported order; historical products never leak into the current list", () => {
    expect(products.map((p) => p.editorialRank)).toEqual(products.map((_, i) => i + 1));
    for (const p of products) expect(isHistoricalProduct(p.id), p.id).toBe(false);
  });
});
