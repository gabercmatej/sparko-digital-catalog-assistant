import { describe, expect, it } from "vitest";
import {
  catalogs,
  getCatalog,
  getOffer,
  getPlacementsForProduct,
  getPrimaryOffer,
  getProduct,
  newProducts,
  offers,
  placements,
  products,
  recipes,
} from "@/lib/catalog";
import { futurePromos } from "@/lib/futurePromos";

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

  it("boxes on the same page of the same catalog never overlap and stay inside the page", () => {
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
          const overlap = a.x < c.x + c.width && c.x < a.x + a.width && a.y < c.y + c.height && c.y < a.y + a.height;
          expect(overlap, `${list[i].id} × ${list[j].id}`).toBe(false);
        }
    }
  });
});

describe("data version 2: two catalogs", () => {
  it("has SPAR 41/26 first and INTERSPAR 14/26 second with the printed validity", () => {
    expect(catalogs.map((c) => c.id)).toEqual(["spar-4126", "interspar-1426"]);
    expect(catalogs.map((c) => c.retailer)).toEqual(["spar", "interspar"]);
    expect(catalogs.map((c) => c.pageCount)).toEqual([36, 8]);
    for (const c of catalogs) {
      expect(c.publishedDate).toBe("2026-10-07");
      expect(c.validFrom).toBe("2026-10-07");
      expect(c.validTo).toBe("2026-10-13");
      expect(c.pages).toHaveLength(c.pageCount);
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
      expect(o.id.endsWith(o.catalogId === "spar-4126" ? "-4126" : "-1426")).toBe(true);
    }
  });

  it("both retailers are represented in the top of the editorial order", () => {
    const topIds = products.slice(0, 10).map((p) => getPrimaryOffer(p.id)!.catalogId);
    expect(new Set(topIds)).toEqual(new Set(["spar-4126", "interspar-1426"]));
  });

  it("covers the categories the home screen browses", () => {
    for (const slug of ["meso", "mlecni-izdelki", "sadje", "zelenjava", "osnovna-zivila", "sladko", "pijace", "pekovsko", "zajtrk"]) {
      expect(products.filter((p) => p.categories.includes(slug)).length, slug).toBeGreaterThanOrEqual(3);
    }
  });

  it("has enough printed percent discounts for the discount ranking, and plain-price items too", () => {
    expect(offers.filter((o) => o.discountPercent !== null).length).toBeGreaterThanOrEqual(10);
    expect(offers.filter((o) => o.discountPercent === null).length).toBeGreaterThan(0);
  });
});

describe("Perutnina Ptuj", () => {
  const ptuj = products.filter((p) => p.brand === "Perutnina Ptuj");

  it("has at least three clean single-pack offers, all verified, with the expected search aliases", () => {
    expect(ptuj.length).toBeGreaterThanOrEqual(3);
    for (const p of ptuj) {
      expect(getPrimaryOffer(p.id)?.verification.status).toBe("verified");
      for (const alias of ["perutnina ptuj", "perutnina", "ptuj", "piščanec"]) expect(p.aliases, `${p.id} ${alias}`).toContain(alias);
    }
  });

  it("prices on the leaflet are the verified ones (SPAR p. 6 and p. 15)", () => {
    const o = (id: string) => getPrimaryOffer(id)!;
    expect(o("piscancje-meso-po-italijansko-800g")).toMatchObject({ priceCents: 519, regularPriceCents: 699, discountPercent: 25 });
    expect(o("stajerski-piscanec-1kg")).toMatchObject({ priceCents: 539, regularPriceCents: 719, discountPercent: 25 });
    expect(o("piscancji-medaljoni-ptuj-750g")).toMatchObject({ priceCents: 699, regularPriceCents: 1119, discountPercent: 37 });
  });
});

describe("novo v katalogu flags", () => {
  it("every isNew product has a documented source; the printed NOVO badges are the two found in the SPAR text layer", () => {
    const flagged = newProducts();
    expect(flagged.length).toBeGreaterThanOrEqual(6);
    expect(flagged.length).toBeLessThanOrEqual(8);
    for (const p of products) {
      if (p.isNew) expect(["printed_badge", "demo_editorial"]).toContain(p.newSource);
      else expect(p.newSource).toBeNull();
    }
    expect(flagged.filter((p) => p.newSource === "printed_badge").map((p) => p.id).sort()).toEqual(["bio-kombucha-330ml", "ocvirki-ave-100g"]);
    // printed badges are on SPAR pages 7 and 13
    expect(getPlacementsForProduct("ocvirki-ave-100g")[0].pdfPageNumber).toBe(7);
    expect(getPlacementsForProduct("bio-kombucha-330ml")[0].pdfPageNumber).toBe(13);
  });

  it("flagged products come from both catalogs", () => {
    expect(new Set(newProducts().map((p) => getPrimaryOffer(p.id)!.catalogId)).size).toBe(2);
  });
});

describe("verified facts of selected offers", () => {
  it("cover offers (SPAR p. 1, INTERSPAR p. 1)", () => {
    expect(getPrimaryOffer("nutella-1kg")).toMatchObject({ priceCents: 719, regularPriceCents: 959, discountPercent: 25, priceKind: "loyalty_price" });
    expect(getPrimaryOffer("belo-grozdje-1kg")).toMatchObject({ priceCents: 169, regularPriceCents: 249, discountPercent: 32, priceUnit: "kg" });
    expect(getPrimaryOffer("jedilna-cokolada-250g")).toMatchObject({ priceCents: 275, regularPriceCents: 369, discountPercent: 25 });
    expect(getPrimaryOffer("pistacijev-namaz-150g")).toMatchObject({ priceCents: 339, regularPriceCents: null, priceKind: "catalog_price" });
    expect(getPrimaryOffer("vleceno-testo-zito-400g")).toMatchObject({ priceCents: 143, regularPriceCents: 219, discountPercent: 34 });
  });

  it("S-BUDGET items carry no printed discount", () => {
    for (const id of ["sb-svinjske-kocke-500g", "sb-sampinjoni-500g"]) {
      expect(getPrimaryOffer(id)).toMatchObject({ regularPriceCents: null, discountPercent: null, priceKind: "catalog_price" });
      expect(getProduct(id)?.brand).toBe("S-BUDGET");
    }
  });

  it("food pages without their own date fall back to the general catalog validity, others carry the printed »DO TORKA 13. 10.«", () => {
    const cover = getPrimaryOffer("nutella-1kg")!;
    expect(cover.validity).toMatchObject({ status: "catalog_default", from: "2026-10-07", to: "2026-10-13" });
    const meat = getPrimaryOffer("piscancje-meso-po-italijansko-800g")!;
    expect(meat.validity).toMatchObject({ status: "explicit", from: "2026-10-07", to: "2026-10-13" });
    expect(meat.validity.evidence).toContain("DO TORKA 13. 10.");
  });
});

describe("recipes", () => {
  it("cover a dinner, a lunch and a breakfast, use only existing whole-pack offers, and one dinner uses Perutnina Ptuj", () => {
    expect(new Set(recipes.map((r) => r.kind))).toEqual(new Set(["dinner", "lunch", "breakfast"]));
    for (const r of recipes)
      for (const ing of r.ingredients) {
        const o = getOffer(ing.offerId);
        expect(o, ing.offerId).toBeDefined();
        expect(o!.priceUnit).toBe("pack");
      }
    const dinner = recipes.find((r) => r.kind === "dinner")!;
    expect(dinner.ingredients.some((i) => getProduct(getOffer(i.offerId)!.productId)?.brand === "Perutnina Ptuj")).toBe(true);
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
  it("every promo is cheaper than the product's current offer, belongs to the offer's catalog and starts after its validity", () => {
    expect(futurePromos.length).toBeGreaterThanOrEqual(8);
    for (const p of futurePromos) {
      const offer = getPrimaryOffer(p.productId)!;
      expect(offer, p.id).toBeDefined();
      expect(p.priceCents, p.id).toBeLessThan(offer.priceCents);
      expect(p.catalogId).toBe(offer.catalogId);
      expect(p.validFrom > getCatalog(p.catalogId)!.validTo).toBe(true);
      if (p.regularPriceCents !== null) expect(p.discountPercent).toBe(Math.round(((p.regularPriceCents - p.priceCents) / p.regularPriceCents) * 100));
    }
  });

  it("include at least three Perutnina Ptuj products and both retailers", () => {
    const ptuj = futurePromos.filter((p) => getProduct(p.productId)?.brand === "Perutnina Ptuj");
    expect(ptuj.length).toBeGreaterThanOrEqual(3);
    expect(new Set(futurePromos.map((p) => p.catalogId)).size).toBe(2);
  });
});
