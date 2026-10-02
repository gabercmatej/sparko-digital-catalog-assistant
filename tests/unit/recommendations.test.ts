import { describe, expect, it } from "vitest";
import { getPrimaryOffer, getProduct, products, recipes } from "@/lib/catalog";
import {
  DEFAULT_RECOMMENDATION_LIMIT,
  EDITORIAL_REASON,
  MAX_PER_PRIMARY_CATEGORY,
  RECOMMENDATION_WEIGHTS,
  explainSignals,
  getRecommendations,
  signalReason,
  type Recommendation,
} from "@/lib/recommendations";

const allIds = products.map((p) => p.id);
const SKUTA = "sb-skuta-1kg";
const POMMES = "sb-pommes-1kg";

/** Every saved-set we probe: each single product, and a few pairs. */
const probes: string[][] = [...allIds.map((id) => [id]), allIds.slice(0, 2), allIds.slice(1, 3), allIds.slice(-2)];

function primaryCat(id: string) {
  return getProduct(id)!.categories[0];
}

function checkDiversity(recs: Recommendation[]) {
  const counts = new Map<string, number>();
  for (const r of recs) counts.set(primaryCat(r.productId), (counts.get(primaryCat(r.productId)) ?? 0) + 1);
  return counts;
}

describe("getRecommendations", () => {
  it("never recommends saved or excluded products", () => {
    for (const saved of probes) {
      const recs = getRecommendations(saved);
      for (const r of recs) expect(saved).not.toContain(r.productId);
    }
    const excluded = allIds.slice(0, 1);
    for (const r of getRecommendations([allIds[allIds.length - 1]], { excludeIds: excluded })) {
      expect(excluded).not.toContain(r.productId);
    }
  });

  it("returns valid product/offer pairs with positive scores equal to the signal weights", () => {
    for (const saved of probes) {
      for (const r of getRecommendations(saved)) {
        expect(getProduct(r.productId)).toBeDefined();
        expect(getPrimaryOffer(r.productId)?.id).toBe(r.offerId);
        expect(r.editorial).toBe(false);
        expect(r.score).toBeGreaterThan(0);
        expect(r.score).toBe(r.signals.reduce((s, x) => s + x.weight, 0));
        for (const s of r.signals) expect(saved).toContain(s.viaProductId);
      }
    }
  });

  it("derives the visible reason from the strongest real signal", () => {
    for (const saved of probes) {
      for (const r of getRecommendations(saved)) {
        expect(r.signals.length).toBeGreaterThan(0);
        expect(r.reason).toBe(signalReason(r.signals[0]));
        expect(r.reason).toBe(explainSignals(r.signals)[0]);
        const cand = getProduct(r.productId)!;
        for (const s of r.signals) {
          if (s.kind === "line") {
            expect(cand.line).toBe(s.detail);
            expect(getProduct(s.viaProductId)!.line).toBe(s.detail);
          }
          if (s.kind === "brand") expect(cand.brand).toBe(s.detail);
          if (s.kind === "recipe") {
            const recipe = recipes.find((x) => x.id === s.detail)!;
            expect(recipe).toBeDefined();
          }
          if (s.kind === "category") expect(cand.categories).toContain(s.detail);
          if (s.kind === "theme") expect(cand.theme).toBe(s.detail);
        }
      }
    }
  });

  it("uses the S-BUDGET line reason for the seed products", () => {
    // Use the full ranked list: with a larger dataset pommes may fall outside the top 6.
    const recs = getRecommendations([SKUTA], { limit: 1000 });
    const pommes = recs.find((r) => r.productId === POMMES);
    expect(pommes).toBeDefined();
    expect(pommes!.reason).toBe("Tudi iz linije S-BUDGET");
    expect(pommes!.signals[0].kind).toBe("line");
  });

  it("lets a +3 line match dominate over category-only matches", () => {
    for (const saved of probes) {
      const all = getRecommendations(saved, { limit: 1000 });
      const lineRecs = all.filter((r) => r.signals.some((s) => s.kind === "line" || s.kind === "brand"));
      const catOnly = all.filter((r) => r.signals.length === 1 && r.signals[0].kind === "category");
      for (const l of lineRecs) {
        expect(l.score).toBeGreaterThanOrEqual(RECOMMENDATION_WEIGHTS.line);
        expect(["line", "brand"]).toContain(l.signals[0].kind);
        for (const c of catOnly) {
          expect(l.score).toBeGreaterThan(c.score);
          // Same primary category -> diversification cannot reorder them: line first.
          if (primaryCat(l.productId) === primaryCat(c.productId)) {
            expect(all.indexOf(l)).toBeLessThan(all.indexOf(c));
          }
        }
      }
    }
  });

  it("is deterministic", () => {
    for (const saved of probes) {
      expect(getRecommendations(saved)).toEqual(getRecommendations(saved));
      expect(getRecommendations([...saved].reverse())).toEqual(getRecommendations(saved));
    }
  });

  it("returns at most 6 results by default and honours limit", () => {
    for (const saved of [...probes, []]) {
      expect(getRecommendations(saved).length).toBeLessThanOrEqual(DEFAULT_RECOMMENDATION_LIMIT);
      expect(getRecommendations(saved, { limit: 2 }).length).toBeLessThanOrEqual(2);
    }
  });

  it("diversifies: at most two per primary category unless filling is unavoidable", () => {
    for (const saved of [...probes, []]) {
      const recs = getRecommendations(saved);
      const counts = checkDiversity(recs);
      const over = [...counts.values()].some((n) => n > MAX_PER_PRIMARY_CATEGORY);
      if (over) {
        // Over the cap only when no other eligible category was available to fill the slots.
        const all = getRecommendations(saved, { limit: 1000 });
        const distinct = new Set(all.map((r) => primaryCat(r.productId)));
        expect(distinct.size * MAX_PER_PRIMARY_CATEGORY).toBeLessThan(Math.min(DEFAULT_RECOMMENDATION_LIMIT, all.length) + 1);
      }
    }
  });

  it("returns editorial picks when nothing is saved, never presented as personalised", () => {
    const recs = getRecommendations([]);
    expect(recs.length).toBe(Math.min(DEFAULT_RECOMMENDATION_LIMIT, products.filter((p) => getPrimaryOffer(p.id)).length));
    for (const r of recs) {
      expect(r.editorial).toBe(true);
      expect(r.reason).toBe(EDITORIAL_REASON);
      expect(r.signals).toEqual([]);
    }
    // Lowest editorial rank comes first.
    expect(recs[0].productId).toBe(products[0].id);
    // Unknown saved IDs are treated as nothing saved.
    expect(getRecommendations(["does-not-exist"])).toEqual(recs);
  });

  it("fillEditorial tops up with flagged editorial picks only", () => {
    const recs = getRecommendations([SKUTA], { fillEditorial: true });
    expect(new Set(recs.map((r) => r.productId)).size).toBe(recs.length);
    for (const r of recs) {
      expect(r.productId).not.toBe(SKUTA);
      if (r.editorial) expect(r.reason).toBe(EDITORIAL_REASON);
    }
  });

  it("is pure: does not mutate its inputs or the catalog", () => {
    const saved = Object.freeze([SKUTA]) as unknown as string[];
    const exclude = Object.freeze([POMMES]) as unknown as string[];
    const before = JSON.stringify(products);
    getRecommendations(saved, { excludeIds: exclude });
    getRecommendations([]);
    expect(JSON.stringify(products)).toBe(before);
    expect(saved).toEqual([SKUTA]);
  });
});
