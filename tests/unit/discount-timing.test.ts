import { describe, expect, it } from "vitest";
import { catalogs, formatPeriod, formatPrice, formatShortDate, getOffer, getPrimaryOffer, getProduct, products } from "@/lib/catalog";
import { futurePromos, futurePromosForProduct, upcomingItem, upcomingPeriod } from "@/lib/futurePromos";
import { isPercentDiscount, rankDiscounts } from "@/lib/assistant/discounts";
import { detectIntent } from "@/lib/assistant/intents";
import { resolvePlaceholders } from "@/lib/assistant/placeholders";
import { buildDeterministicReply } from "@/lib/assistant/respond";
import { currentDiscountsOf, MAX_UPCOMING, rankUpcoming } from "@/lib/assistant/timing";
import { sanitizeBlocks } from "@/lib/chat/messages";
import type { ChatRequest, MessageBlock } from "@/lib/types";

function req(text: string): ChatRequest {
  return { conversationId: "t", messages: [{ role: "user", text }], savedProductIds: [], spPlus: "unset" };
}
const intentOf = (text: string) => detectIntent(req(text).messages).intent;

type Timeline = Extract<MessageBlock, { type: "discount_timeline" }>;
function timelineOf(r: { blocks: MessageBlock[] }): Timeline | undefined {
  return r.blocks.find((b): b is Timeline => b.type === "discount_timeline");
}

const PTUJ = products.filter((p) => p.brand === "Perutnina Ptuj");
const needsPtuj = PTUJ.length === 0 ? "no Perutnina Ptuj products in the catalog data yet" : false;

describe("discount timing: intent detection", () => {
  it.each([
    "Kdaj je perutnina ptuj znižana?",
    "Kdaj je Perutnina Ptuj znižana?",
    "Kdaj bo skuta znižana?",
    "Ali bo skuta v akciji naslednji teden?",
    "Kaj bo znižano naslednji teden?",
    "Kaj bo v akciji prihodnji teden?",
    "Kdaj bo akcija za jogurt?",
  ])("%s -> discount_timing", (text) => {
    expect(intentOf(text)).toBe("discount_timing");
  });

  it("does not steal existing intents", () => {
    expect(intentOf("Kaj je najbolj znižano?")).toBe("discounts");
    expect(intentOf("Kaj je najbolj znižano v katalogu?")).toBe("discounts");
    expect(intentOf("Kje je mleko?")).not.toBe("discount_timing");
    expect(intentOf("Kje je skuta v letaku?")).toBe("where_in_leaflet");
    expect(intentOf("Kje je najbližji SPAR?")).toBe("nearest_store");
    expect(intentOf("Koliko stane skuta?")).toBe("price_lookup");
  });
});

describe("discount timing: data invariants", () => {
  it("every future price is below the product's current price and each promo has a verified current offer", () => {
    expect(futurePromos.length).toBeGreaterThan(0);
    for (const p of futurePromos) {
      const item = upcomingItem(p.id)!;
      expect(item.currentOffer.verification.status).toBe("verified");
      expect(p.priceCents).toBeLessThan(item.currentOffer.priceCents);
      expect(p.validFrom >= upcomingPeriod.from && p.validTo <= upcomingPeriod.to).toBe(true);
    }
  });
});

describe("discount timing: product-scoped answer (Perutnina Ptuj)", () => {
  it.skipIf(needsPtuj)("returns a timeline with verified current discounts and the brand's upcoming promos", () => {
    const r = buildDeterministicReply(req("Kdaj je Perutnina Ptuj znižana?"));
    expect(r.intent).toBe("discount_timing");
    expect(r.allowModel).toBe(false);
    const tl = timelineOf(r)!;
    expect(tl).toBeTruthy();
    const ptujIds = new Set(PTUJ.map((p) => p.id));
    for (const id of tl.currentOfferIds) {
      const o = getOffer(id)!;
      expect(ptujIds.has(o.productId)).toBe(true);
      expect(isPercentDiscount(o)).toBe(true);
    }
    expect(tl.upcomingPromoIds.length).toBeGreaterThanOrEqual(3);
    const expectedPromos = PTUJ.flatMap((p) => futurePromosForProduct(p.id)).map((p) => p.id);
    expect([...tl.upcomingPromoIds].sort()).toEqual([...expectedPromos].sort());
    // Every promo shows a current price above the upcoming one.
    for (const id of tl.upcomingPromoIds) {
      const item = upcomingItem(id)!;
      expect(item.promo.priceCents).toBeLessThan(item.currentOffer.priceCents);
    }
    expect(r.contextProductIds.every((id) => ptujIds.has(id))).toBe(true);
  });

  it.skipIf(needsPtuj)("text is fully resolved (brand genitive, demo forecast wording) and carries no model-written facts", () => {
    const r = buildDeterministicReply(req("Kdaj je perutnina ptuj znižana?"));
    expect(r.text).not.toMatch(/\{\{|\}\}/);
    expect(r.text).toBe("Izdelki Perutnine Ptuj bodo v naši demo napovedi znižani naslednji teden. Poglej, kateri izdelki so vključeni.");
  });
});

describe("discount timing: any product with promos", () => {
  const promo = futurePromos[0];
  const product = promo && getProduct(promo.productId);

  it("a named product returns its own upcoming promo next to its verified current price", () => {
    const r = buildDeterministicReply(req(`Kdaj bo ${product!.name} znižan?`));
    expect(r.intent).toBe("discount_timing");
    const tl = timelineOf(r)!;
    expect(tl.upcomingPromoIds).toContain(promo.id);
    for (const id of tl.upcomingPromoIds) expect(upcomingItem(id)!.currentOffer.id).toBe(getPrimaryOffer(upcomingItem(id)!.product.id)!.id);
    expect(r.text).not.toMatch(/\{\{|\}\}/);
    expect(r.text).toContain(formatShortDate(promo.validFrom));
  });

  it("current section only holds verified percentage discounts", () => {
    const ids = products.map((p) => p.id);
    for (const r of currentDiscountsOf(ids)) expect(isPercentDiscount(r.offer)).toBe(true);
  });
});

describe("discount timing: general next-week question", () => {
  it("lists all upcoming promos (discount desc) and omits the current section", () => {
    const r = buildDeterministicReply(req("Kaj bo znižano naslednji teden?"));
    expect(r.intent).toBe("discount_timing");
    expect(r.allowModel).toBe(false);
    const tl = timelineOf(r)!;
    expect(tl.currentOfferIds).toEqual([]);
    expect(tl.upcomingPromoIds.length).toBe(Math.min(futurePromos.length, MAX_UPCOMING));
    expect(tl.upcomingPromoIds).toEqual(rankUpcoming().map((u) => u.promo.id));
    const pcts = tl.upcomingPromoIds.map((id) => upcomingItem(id)!.promo.discountPercent ?? 0);
    expect([...pcts].sort((a, b) => b - a)).toEqual(pcts);
    expect(r.text).toContain(formatPeriod(upcomingPeriod.from, upcomingPeriod.to));
    expect(r.text).not.toMatch(/\{\{|\}\}/);
  });
});

describe("discount timing: honest empty and unknown cases", () => {
  const noTiming = products.find(
    (p) => futurePromosForProduct(p.id).length === 0 && currentDiscountsOf([p.id]).length === 0 && getPrimaryOffer(p.id)?.priceUnit === "pack",
  );

  it.skipIf(!noTiming)("a product without a structured promo gets a demo forecast row: period only, no future price", () => {
    const r = buildDeterministicReply(req(`Kdaj bo ${noTiming!.name} znižan?`));
    expect(r.intent).toBe("discount_timing");
    const tl = timelineOf(r)!;
    expect(tl.upcomingPromoIds).toEqual([]);
    expect(tl.forecastProductIds).toContain(noTiming!.id);
    expect(r.text).toContain("demo napovedi");
    expect(r.text).not.toMatch(/\d/);
    expect(r.allowModel).toBe(false);
  });

  it("an unknown product follows the existing unknown-product flow", () => {
    const r = buildDeterministicReply(req("Kdaj bo kaviar znižan?"));
    expect(r.intent).toBe("unknown_product");
    expect(timelineOf(r)).toBeUndefined();
    expect(r.allowModel).toBe(false);
  });
});

describe("discounts intent shows ONLY current discounts", () => {
  it("current top discounts and no upcoming promos or forecast", () => {
    const r = buildDeterministicReply(req("Kaj je najbolj znižano?"));
    expect(r.intent).toBe("discounts");
    expect(r.blocks[0].type).toBe("discount_timeline");
    const tl = timelineOf(r)!;
    expect(tl.currentOfferIds).toEqual(rankDiscounts({ limit: 4 }).map((x) => x.offer.id));
    expect(tl.upcomingPromoIds).toEqual([]);
    expect(tl.forecastProductIds).toBeUndefined();
    expect(r.text).not.toMatch(/\{\{|\}\}/);
  });
});

describe("future placeholders", () => {
  const promo = futurePromos[0];
  const ctx = { spPlus: "unset" as const };

  it("resolve from data only", () => {
    const offer = getPrimaryOffer(promo.productId)!;
    const text = resolvePlaceholders(
      `{{futurePrice:${promo.id}}}|{{futureFrom:${promo.id}}}|{{futurePeriod}}|{{currentPeriod:${offer.id}}}|{{catalogs}}`,
      ctx,
    );
    expect(text.ok).toBe(true);
    if (!text.ok) return;
    const cat = catalogs.find((c) => c.id === offer.catalogId)!;
    expect(text.text.split("|")).toEqual([
      formatPrice(promo.priceCents),
      formatShortDate(promo.validFrom),
      formatPeriod(upcomingPeriod.from, upcomingPeriod.to),
      formatPeriod(cat.validFrom, cat.validTo),
      catalogs.map((c) => `${c.retailer === "spar" ? "SPAR" : "INTERSPAR"} ${c.issueLabel}`).join(" in "),
    ]);
  });

  it("reject unknown promo ids and promos outside the allow-list (model output)", () => {
    expect(resolvePlaceholders("{{futurePrice:fp-does-not-exist}}", ctx).ok).toBe(false);
    expect(resolvePlaceholders(`{{futureFrom:${promo.id}}}`, { ...ctx, allowedPromoIds: new Set() }).ok).toBe(false);
    expect(resolvePlaceholders(`{{futureFrom:${promo.id}}}`, { ...ctx, allowedPromoIds: new Set([promo.id]) }).ok).toBe(true);
  });
});

describe("sanitizeBlocks keeps valid discount timelines", () => {
  it("filters unknown ids and drops empty timelines", () => {
    const promo = futurePromos[0];
    const offer = getPrimaryOffer(promo.productId)!;
    const out = sanitizeBlocks([
      { type: "discount_timeline", currentOfferIds: [offer.id, "nope"], upcomingPromoIds: [promo.id, "nope", 5] },
      { type: "discount_timeline", currentOfferIds: ["nope"], upcomingPromoIds: [] },
      { type: "discount_timeline" },
    ]);
    expect(out).toEqual([{ type: "discount_timeline", currentOfferIds: [offer.id], upcomingPromoIds: [promo.id] }]);
  });
});

describe("bulk-purchase prices are not ranked as discounts", () => {
  it("Radler (0,81 € only when buying 24 cans) is excluded from the discount ranking", () => {
    const radler = getPrimaryOffer("radler-cola-limeta-union-0-5l");
    expect(radler).toBeDefined();
    expect(radler!.conditions.note).toMatch(/ob nakupu 24 kosov/);
    expect(isPercentDiscount(radler!)).toBe(false);
    expect(rankDiscounts({ limit: Infinity }).some((r) => r.offer.id === radler!.id)).toBe(false);
  });
});
