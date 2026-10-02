import { describe, expect, it } from "vitest";
import { formatPrice, getOffer, getPrimaryOffer, getProduct, offers, recipes, recipeTotals } from "@/lib/catalog";
import type { ChatRequest, ChatRequestMessage, Recipe, SpPlusSetting } from "@/lib/types";
import { fold, stem } from "@/lib/assistant/normalize";
import { searchProducts, cheaperAlternatives, comparablePrice } from "@/lib/assistant/search";
import { detectIntent, parseBudgetCents, parseServings } from "@/lib/assistant/intents";
import { rankDiscounts, isPercentDiscount } from "@/lib/assistant/discounts";
import { evaluateRecipe, mealTemplate, suggestMeal } from "@/lib/assistant/meals";
import { render, resolvePlaceholders } from "@/lib/assistant/placeholders";
import { buildDeterministicReply } from "@/lib/assistant/respond";

const SKUTA = "sb-skuta-1kg";
const SKUTA_OFFER = "offer-sb-skuta-1kg-4026";

function req(text: string, opts: { history?: ChatRequestMessage[]; spPlus?: SpPlusSetting; saved?: string[] } = {}): ChatRequest {
  return {
    conversationId: "test-conv",
    messages: [...(opts.history ?? []), { role: "user", text }],
    savedProductIds: opts.saved ?? [],
    spPlus: opts.spPlus ?? "unset",
  };
}

function productOfferIds(r: { blocks: { type: string; offerIds?: string[] }[] }): string[] {
  return r.blocks.flatMap((b) => (b.type === "products" ? (b.offerIds ?? []) : []));
}

const skutaContext: ChatRequestMessage[] = [
  { role: "user", text: "Koliko stane skuta?" },
  { role: "assistant", text: "V demo katalogu je S-BUDGET lahka skuta, 1 kg, po 3,38 €.", contextProductIds: [SKUTA] },
];

describe("normalize", () => {
  it("folds diacritics, punctuation and S-BUDGET variants", () => {
    expect(fold("Piščančja SALAMA!")).toBe("piscancja salama");
    expect(fold("S-BUDGET skuta")).toBe("sbudget skuta");
    expect(fold("s budget skuta")).toBe("sbudget skuta");
    expect(fold("sbudget")).toBe("sbudget");
    expect(fold("do 10 €")).toBe("do 10 eur");
    expect(fold("3,38 €")).toBe("3,38 eur");
  });
  it("stems Slovenian inflections to a shared stem", () => {
    expect(new Set(["skuta", "skute", "skuto", "skuti"].map(stem)).size).toBe(1);
    expect(stem("mleko")).toBe(stem("mleka"));
    expect(new Set(["jajca", "jajc", "jajce"].map(stem)).size).toBe(1);
    expect(new Set(["zrezki", "zrezke", "zrezek"].map(stem)).size).toBe(1);
  });
});

describe("search", () => {
  it.each(["Koliko stane skuta?", "koliko stane skuto", "skute", "sbudget skuta", "S-BUDGET skuta", "skta"])("finds the skuta anchor for %s", (q) => {
    const hits = searchProducts(q);
    expect(hits.map((h) => h.product.id)).toContain(SKUTA);
    expect(hits[0].score).toBeGreaterThan(0);
  });
  it("returns nothing for an unknown product", () => {
    expect(searchProducts("kaviar")).toEqual([]);
  });
  it("applies line and max price filters", () => {
    const hits = searchProducts("izdelki", { filters: { line: "sbudget", maxPriceCents: 200 } });
    for (const h of hits) {
      expect(h.product.line?.toUpperCase()).toBe("S-BUDGET");
      expect(h.offer.priceCents).toBeLessThanOrEqual(200);
    }
  });
  it("cheaper alternatives share the primary category and have a lower comparable price", () => {
    for (const p of [SKUTA, "sb-zrezki-500g"]) {
      const base = getProduct(p)!;
      const bo = getPrimaryOffer(p)!;
      for (const alt of cheaperAlternatives(p)) {
        expect(alt.product.categories[0]).toBe(base.categories[0]);
        expect(comparablePrice(alt.product, alt.offer).value).toBeLessThan(comparablePrice(base, bo).value);
      }
    }
  });
});

describe("intents", () => {
  const intentOf = (t: string, history: ChatRequestMessage[] = []) => detectIntent([...history, { role: "user", text: t }]).intent;
  it("classifies the four suggestion prompts", () => {
    expect(intentOf("Koliko stane skuta?")).toBe("price_lookup");
    expect(intentOf("Kaj je najbolj znižano?")).toBe("discounts");
    expect(intentOf("Večerja za dva do 10 €")).toBe("meal");
    expect(intentOf("Predlagaj hiter zajtrk")).toBe("breakfast");
  });
  it("classifies follow-ups and commands", () => {
    expect(intentOf("kaj pa cenejša možnost?", skutaContext)).toBe("cheaper");
    expect(intentOf("kaj je ceneje", skutaContext)).toBe("cheaper");
    expect(intentOf("dodaj to", skutaContext)).toBe("save");
    expect(intentOf("shrani", skutaContext)).toBe("save");
    expect(intentOf("odstrani to", skutaContext)).toBe("remove");
    expect(intentOf("kje je v letaku?", skutaContext)).toBe("where_in_leaflet");
    expect(intentOf("na kateri strani je skuta")).toBe("where_in_leaflet");
    expect(intentOf("Živjo")).toBe("greeting");
    expect(intentOf("Kakšno bo vreme jutri?")).toBe("out_of_scope");
    expect(intentOf("napiši mi kodo v pythonu")).toBe("out_of_scope");
    expect(intentOf("S-BUDGET izdelki")).toBe("line");
    expect(intentOf("priporoči mi kaj")).toBe("recommend");
  });
  it("parses servings and budget", () => {
    expect(parseServings(fold("Večerja za dva do 10 €"))).toBe(2);
    expect(parseServings(fold("kosilo za 2 osebi"))).toBe(2);
    expect(parseServings(fold("za 4 osebe"))).toBe(4);
    expect(parseBudgetCents(fold("do 10 €"))).toBe(1000);
    expect(parseBudgetCents(fold("pod 10 evrov"))).toBe(1000);
    expect(parseBudgetCents(fold("do 7,50 eur"))).toBe(750);
  });
  it("uses context from the most recent message that carried product ids", () => {
    expect(detectIntent([...skutaContext, { role: "user", text: "dodaj to" }]).contextProductIds).toEqual([SKUTA]);
  });
});

describe("deterministic responder — product lookups", () => {
  it.each(["Koliko stane skuta?", "koliko stane skuto", "skute", "sbudget skuta", "skta"])("%s → skuta offer with 3,38 €", (q) => {
    const r = buildDeterministicReply(req(q));
    expect(productOfferIds(r)).toContain(SKUTA_OFFER);
    expect(r.text).toContain("3,38 €");
    expect(r.contextProductIds).toContain(SKUTA);
    expect(r.actions).toEqual([]);
  });

  it("exact skuta sentence uses data-rendered price and pack", () => {
    const r = buildDeterministicReply(req("Koliko stane skuta?"));
    if (r.kind !== "ambiguous") {
      expect(r.text).toBe("V demo katalogu je S-BUDGET lahka skuta, 1 kg, po 3,38 €.");
      expect(r.blocks[0]).toEqual({ type: "products", offerIds: [SKUTA_OFFER], layout: "card" });
    }
  });

  it("where_in_leaflet follow-up resolves skuta context to PDF page 5 with open_leaflet", () => {
    const r = buildDeterministicReply(req("kje je v letaku?", { history: skutaContext }));
    expect(r.intent).toBe("where_in_leaflet");
    expect(r.text).toContain("PDF-strani 5");
    expect(r.actions).toEqual([{ type: "open_leaflet", productId: SKUTA }]);
    expect(productOfferIds(r)).toEqual([SKUTA_OFFER]);
    expect(r.allowModel).toBe(false);
  });

  it("'kaj pa cenejša možnost?' uses the skuta context", () => {
    const r = buildDeterministicReply(req("kaj pa cenejša možnost?", { history: skutaContext }));
    expect(r.intent).toBe("cheaper");
    expect(r.text).toMatch(/skuta/i);
    expect(r.actions).toEqual([]);
    const base = comparablePrice(getProduct(SKUTA)!, getPrimaryOffer(SKUTA)!).value;
    for (const oid of productOfferIds(r).filter((o) => o !== SKUTA_OFFER)) {
      const o = getOffer(oid)!;
      expect(comparablePrice(getProduct(o.productId)!, o).value).toBeLessThan(base);
    }
  });

  it("unknown product → honest text, no invented product", () => {
    const r = buildDeterministicReply(req("Koliko stane kaviar?"));
    expect(r.intent).toBe("unknown_product");
    expect(r.text).toContain("Tega izdelka v preverjenem delu demo kataloga ne najdem.");
    expect(r.text).not.toMatch(/kaviar/i);
    for (const oid of productOfferIds(r)) expect(getOffer(oid)).toBeDefined();
    expect(r.actions).toEqual([]);
    expect(r.allowModel).toBe(false);
  });

  it("out-of-scope steers back to shopping without products", () => {
    const r = buildDeterministicReply(req("Kdo bo zmagal na volitvah?"));
    expect(r.intent).toBe("out_of_scope");
    expect(r.text).toMatch(/nakup|kuhanj/);
    expect(productOfferIds(r)).toEqual([]);
    expect(r.blocks.some((b) => b.type === "choices")).toBe(true);
  });

  it("ambiguous queries ask with choices instead of guessing", () => {
    // Find a query that matches several products in the current data (robust to dataset growth).
    const candidates = ["salama", "meso", "sir", "piščanec", "mleko", "sadje"];
    const ambiguous = candidates.map((q) => buildDeterministicReply(req(q))).filter((r) => r.kind === "ambiguous");
    for (const r of ambiguous) {
      const choices = r.blocks.find((b) => b.type === "choices");
      expect(choices && choices.type === "choices" && choices.options.length).toBeGreaterThanOrEqual(2);
      expect(r.actions).toEqual([]);
      expect(productOfferIds(r).length).toBeLessThanOrEqual(4);
    }
  });

  it("shows at most 4 products in any reply", () => {
    for (const q of ["S-BUDGET izdelki", "Kaj je najbolj znižano?", "priporoči mi kaj", "kaj je najcenejše", "meso"]) {
      expect(productOfferIds(buildDeterministicReply(req(q))).length).toBeLessThanOrEqual(4);
    }
  });
});

describe("deterministic responder — save/remove", () => {
  it("'dodaj to' with one context product → save action, text does not claim saving", () => {
    const r = buildDeterministicReply(req("dodaj to", { history: skutaContext }));
    expect(r.actions).toEqual([{ type: "save", productId: SKUTA }]);
    expect(r.text).not.toMatch(/shranil|dodal|dodan|shranjen/i);
    expect(r.allowModel).toBe(false);
  });

  it("'dodaj skuto' (explicit) → save action for skuta", () => {
    const r = buildDeterministicReply(req("dodaj skuto"));
    if (r.kind === "ambiguous") expect(r.actions).toEqual([]);
    else expect(r.actions).toEqual([{ type: "save", productId: SKUTA }]);
  });

  it("'dodaj to' with several context products → choices, no action", () => {
    const history: ChatRequestMessage[] = [{ role: "assistant", text: "…", contextProductIds: [SKUTA, "sb-salama-400g"] }];
    const r = buildDeterministicReply(req("dodaj to", { history }));
    expect(r.actions).toEqual([]);
    const choices = r.blocks.find((b) => b.type === "choices");
    expect(choices).toBeDefined();
    expect(r.text).not.toMatch(/shranil|dodal/i);
  });

  it("'dodaj to' without context → asks which product, no action", () => {
    const r = buildDeterministicReply(req("dodaj to"));
    expect(r.actions).toEqual([]);
  });

  it("'dodaj kaviar' with skuta context does not save skuta", () => {
    const r = buildDeterministicReply(req("dodaj kaviar", { history: skutaContext }));
    expect(r.actions).toEqual([]);
  });

  it("'odstrani to' → remove action for the context product", () => {
    const r = buildDeterministicReply(req("odstrani to", { history: skutaContext, saved: [SKUTA] }));
    expect(r.actions).toEqual([{ type: "remove", productId: SKUTA }]);
  });

  it("read-only questions never produce save/remove actions", () => {
    const readOnly = ["Koliko stane skuta?", "Kaj je najbolj znižano?", "Večerja za dva do 10 €", "Predlagaj hiter zajtrk", "S-BUDGET izdelki", "priporoči mi kaj", "kaj pa cenejša možnost?", "kje je v letaku?", "živjo", "Koliko stane kaviar?"];
    for (const q of readOnly) {
      const r = buildDeterministicReply(req(q, { history: skutaContext }));
      expect(r.actions.filter((a) => a.type === "save" || a.type === "remove")).toEqual([]);
    }
  });
});

describe("discounts", () => {
  it("ranks only verified printed percentages, sorted desc, without S-BUDGET skuta", () => {
    const ranked = rankDiscounts({ limit: 50 });
    for (const r of ranked) {
      expect(isPercentDiscount(r.offer)).toBe(true);
      expect(r.offer.discountPercent).not.toBeNull();
      expect(r.offer.conditions.couponRequired).toBe(false);
      expect(r.offer.verification.status).toBe("verified");
    }
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].offer.discountPercent!).toBeGreaterThanOrEqual(ranked[i].offer.discountPercent!);
    expect(ranked.map((r) => r.offer.id)).not.toContain(SKUTA_OFFER);
    expect(ranked.length).toBe(offers.filter(isPercentDiscount).length);
  });

  it("answer is scoped to the demo catalog's verified selection and shows at most 4", () => {
    const r = buildDeterministicReply(req("Kaj je najbolj znižano?"));
    expect(r.text).toContain("V preverjenem izboru demo kataloga");
    expect(r.text).not.toMatch(/trenutno v trgovini|danes/i);
    const ids = productOfferIds(r);
    expect(ids.length).toBeLessThanOrEqual(4);
    expect(ids).not.toContain(SKUTA_OFFER);
    const top = rankDiscounts({ limit: 4 });
    expect(ids).toEqual(top.map((t) => t.offer.id));
    for (const t of top) expect(r.text).toContain(`${t.offer.discountPercent} %`);
  });

  it("with spPlus 'no' card-only discounts mention the card and the regular price instead of hiding them", () => {
    const top = rankDiscounts({ limit: 4 });
    const card = top.find((t) => t.offer.conditions.spPlusRequired);
    if (!card) return;
    const r = buildDeterministicReply(req("Kaj je najbolj znižano?", { spPlus: "no" }));
    expect(r.text).toContain("SPAR plus");
    if (card.offer.regularPriceCents != null) expect(r.text).toContain(formatPrice(card.offer.regularPriceCents));
  });
});

describe("meals", () => {
  const synthetic: Recipe = {
    id: "test-synthetic",
    title: "Testni obrok",
    kind: "dinner",
    servings: 2,
    budgetCents: 1000,
    ingredients: [
      { offerId: "offer-sb-zrezki-500g-4026", requiredQuantity: "500 g", packsNeeded: 1, conversionNote: "1 pakiranje" },
      { offerId: "offer-sb-pommes-1kg-4026", requiredQuantity: "600 g", packsNeeded: 1, conversionNote: "1 kg zadošča" },
      { offerId: SKUTA_OFFER, requiredQuantity: "1,2 kg", packsNeeded: 2, conversionNote: "dve celi pakiranji" },
    ],
    pantryAssumptions: ["olje in sol imaš doma"],
    steps: ["Skuhaj."],
    minutes: 20,
  };

  it("computes whole-pack totals from data", () => {
    const t = recipeTotals(synthetic)!;
    const expected = getOffer("offer-sb-zrezki-500g-4026")!.priceCents + getOffer("offer-sb-pommes-1kg-4026")!.priceCents + 2 * getOffer(SKUTA_OFFER)!.priceCents;
    expect(t.withCard).toBe(expected);
    expect(t.withCard).toBe(409 + 159 + 676);
    expect(t.needsCard).toBe(false);
    expect(t.withoutCard).toBe(expected);
  });

  it("within budget only when the applicable total is <= budget; otherwise honest closest", () => {
    const ok = evaluateRecipe(synthetic, { kind: "dinner", servings: 2, budgetCents: 1300, spPlus: "unset" });
    expect(ok.fitsBudget).toBe(true);
    const tight = suggestMeal({ kind: "dinner", servings: 2, budgetCents: 500, spPlus: "unset" }, [synthetic]);
    expect(tight.withinBudget).toBe(false);
    const text = render(mealTemplate(tight, { kind: "dinner", servings: 2, budgetCents: 500, spPlus: "unset" }), {
      spPlus: "unset",
      budgetCents: 500,
      recipeLookup: (id) => (id === synthetic.id ? synthetic : undefined),
    });
    expect(text).toContain(formatPrice(recipeTotals(synthetic)!.withCard));
    expect(text).toContain("ne pride v okvir 5,00 €");
    expect(text).toContain("Predpostavka: olje in sol imaš doma");
  });

  it("'Večerja za dva do 10 €' → verified recipe within budget with visible assumptions (if data has one)", () => {
    const r = buildDeterministicReply(req("Večerja za dva do 10 €"));
    const recipeBlock = r.blocks.find((b) => b.type === "recipe");
    if (!recipes.some((x) => x.kind !== "breakfast")) {
      expect(r.text).toMatch(/nimam preverjenega recepta/);
      return;
    }
    expect(recipeBlock).toBeDefined();
    const recipe = recipes.find((x) => recipeBlock?.type === "recipe" && x.id === recipeBlock.recipeId)!;
    const totals = recipeTotals(recipe)!;
    expect(r.text).toContain(formatPrice(totals.withCard));
    if (totals.withCard <= 1000) {
      expect(r.text).toContain("v okviru 10,00 €");
      if (totals.needsCard) expect(r.text).toContain("SPAR plus");
    } else {
      expect(r.text).not.toContain("v okviru 10,00 €");
    }
    if (recipe.pantryAssumptions.length) expect(r.text).toContain("Predpostavka:");
  });

  it("spPlus 'no' uses the price without card (or says it is unknown)", () => {
    const r = buildDeterministicReply(req("Večerja za dva do 10 €", { spPlus: "no" }));
    const rb = r.blocks.find((b) => b.type === "recipe");
    if (!rb || rb.type !== "recipe") return;
    const recipe = recipes.find((x) => x.id === rb.recipeId)!;
    const t = recipeTotals(recipe)!;
    if (t.withoutCard == null) expect(r.text).toMatch(/ni navedena/);
    else {
      expect(r.text).toContain(formatPrice(t.withoutCard));
      if (t.withoutCard > 1000) expect(r.text).not.toContain("To je v okviru");
    }
  });

  it("'Predlagaj hiter zajtrk' → breakfast recipe or verified breakfast products", () => {
    const r = buildDeterministicReply(req("Predlagaj hiter zajtrk"));
    expect(r.intent).toBe("breakfast");
    const rb = r.blocks.find((b) => b.type === "recipe");
    if (rb && rb.type === "recipe") expect(recipes.find((x) => x.id === rb.recipeId)?.kind).toBe("breakfast");
    else for (const oid of productOfferIds(r)) expect(getProduct(getOffer(oid)!.productId)!.categories).toContain("zajtrk");
  });
});

describe("placeholders", () => {
  it("resolves from data and rejects ids outside the allowed sets", () => {
    expect(render(`{{name:${SKUTA}}} {{pack:${SKUTA}}} {{price:${SKUTA_OFFER}}} stran {{page:${SKUTA}}}`, { spPlus: "unset" })).toBe("S-BUDGET lahka skuta 1 kg 3,38 € stran 5");
    expect(resolvePlaceholders(`{{price:${SKUTA_OFFER}}}`, { spPlus: "unset", allowedOfferIds: new Set() }).ok).toBe(false);
    expect(resolvePlaceholders("{{price:offer-ne-obstaja}}", { spPlus: "unset" }).ok).toBe(false);
    expect(resolvePlaceholders(`{{discount:${SKUTA_OFFER}}}`, { spPlus: "unset" }).ok).toBe(false); // no printed discount
  });
});
