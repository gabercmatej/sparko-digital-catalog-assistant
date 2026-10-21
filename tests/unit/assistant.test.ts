import { describe, expect, it } from "vitest";
import { formatPrice, getOffer, getPlacementsForProduct, getPrimaryOffer, getProduct, offers, products, recipes, recipeTotals } from "@/lib/catalog";
import type { ChatRequest, ChatRequestMessage, Recipe, SpPlusSetting } from "@/lib/types";
import { fold, stem } from "@/lib/assistant/normalize";
import { searchProducts, cheaperAlternatives, comparablePrice } from "@/lib/assistant/search";
import { detectIntent, parseBudgetCents, parseServings } from "@/lib/assistant/intents";
import { rankDiscounts, isPercentDiscount } from "@/lib/assistant/discounts";
import { evaluateRecipe, mealTemplate, suggestMeal } from "@/lib/assistant/meals";
import { render, resolvePlaceholders } from "@/lib/assistant/placeholders";
import { buildDeterministicReply } from "@/lib/assistant/respond";

// Data-driven anchor: an S-BUDGET product without a printed discount (the role "skuta" played in the old catalog).
const ANCHOR = products.find((p) => p.line === "S-BUDGET" && fold(p.name).startsWith("sampinjon"))!;
const ANCHOR_ID = ANCHOR.id;
const ANCHOR_OFFER = getPrimaryOffer(ANCHOR_ID)!.id;
const PRICE = formatPrice(getPrimaryOffer(ANCHOR_ID)!.priceCents);
const PAGE = getPlacementsForProduct(ANCHOR_ID)[0].pdfPageNumber;

function req(text: string, opts: { history?: ChatRequestMessage[]; spPlus?: SpPlusSetting; saved?: string[] } = {}): ChatRequest {
  return {
    conversationId: "test-conv",
    messages: [...(opts.history ?? []), { role: "user", text }],
    savedProductIds: opts.saved ?? [],
    spPlus: opts.spPlus ?? "unset",
  };
}

/** Offer ids shown by products blocks and by the current ("Znižano ta teden") part of discount timelines. */
function productOfferIds(r: { blocks: { type: string; offerIds?: string[]; currentOfferIds?: string[] }[] }): string[] {
  return r.blocks.flatMap((b) => (b.type === "products" ? (b.offerIds ?? []) : b.type === "discount_timeline" ? (b.currentOfferIds ?? []) : []));
}

const anchorContext: ChatRequestMessage[] = [
  { role: "user", text: "Koliko stane šampinjoni?" },
  { role: "assistant", text: `V demo katalogu je S-BUDGET šampinjoni, ${ANCHOR.packSize}, po ${PRICE}.`, contextProductIds: [ANCHOR_ID] },
];

describe("normalize", () => {
  it("folds diacritics, punctuation and S-BUDGET variants", () => {
    expect(fold("Piščančja SALAMA!")).toBe("piscancja salama");
    expect(fold("S-BUDGET šampinjoni")).toBe("sbudget sampinjoni");
    expect(fold("s budget šampinjoni")).toBe("sbudget sampinjoni");
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
  it.each(["Koliko stane šampinjoni?", "koliko stane šampinjone", "šampinjone", "sbudget šampinjoni", "S-BUDGET šampinjoni", "sampinjni"])("finds the šampinjoni anchor for %s", (q) => {
    const hits = searchProducts(q);
    expect(hits.map((h) => h.product.id)).toContain(ANCHOR_ID);
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
    for (const p of [ANCHOR_ID, ...products.filter((x) => x.line === "S-BUDGET" && x.id !== ANCHOR_ID).map((x) => x.id)]) {
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
  it("classifies the starter prompts and common requests", () => {
    expect(intentOf("Koliko stane izdelek?")).toBe("price_lookup");
    expect(intentOf("Koliko stane šampinjoni?")).toBe("price_lookup");
    expect(intentOf("Kaj je najbolj znižano?")).toBe("discounts");
    expect(intentOf("Večerja za dva do 10 €")).toBe("meal");
    expect(intentOf("Predlagaj hiter zajtrk")).toBe("breakfast");
  });
  it("classifies follow-ups and commands", () => {
    expect(intentOf("kaj pa cenejša možnost?", anchorContext)).toBe("cheaper");
    expect(intentOf("kaj je ceneje", anchorContext)).toBe("cheaper");
    expect(intentOf("dodaj to", anchorContext)).toBe("save");
    expect(intentOf("shrani", anchorContext)).toBe("save");
    expect(intentOf("odstrani to", anchorContext)).toBe("remove");
    expect(intentOf("kje je v letaku?", anchorContext)).toBe("where_in_leaflet");
    expect(intentOf("na kateri strani je šampinjoni")).toBe("where_in_leaflet");
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
    expect(detectIntent([...anchorContext, { role: "user", text: "dodaj to" }]).contextProductIds).toEqual([ANCHOR_ID]);
  });
});

describe("deterministic responder — product lookups", () => {
  it.each(["Koliko stane šampinjoni?", "koliko stane šampinjone", "šampinjone", "sbudget šampinjoni", "sampinjni"])(`%s → šampinjoni offer with ${PRICE}`, (q) => {
    const r = buildDeterministicReply(req(q));
    expect(productOfferIds(r)).toContain(ANCHOR_OFFER);
    expect(r.text).toContain(`${PRICE}`);
    expect(r.contextProductIds).toContain(ANCHOR_ID);
    expect(r.actions).toEqual([]);
  });

  it("exact šampinjoni sentence uses data-rendered price and pack", () => {
    const r = buildDeterministicReply(req("Koliko stane šampinjoni?"));
    if (r.kind !== "ambiguous") {
      expect(r.text).toBe(`V aktualnem katalogu je S-BUDGET šampinjoni, ${ANCHOR.packSize}, po ${PRICE}.`);
      expect(r.blocks[0]).toEqual({ type: "products", offerIds: [ANCHOR_OFFER], layout: "card" });
    }
  });

  it("where_in_leaflet follow-up resolves šampinjoni context to PDF page 5 with open_leaflet", () => {
    const r = buildDeterministicReply(req("kje je v letaku?", { history: anchorContext }));
    expect(r.intent).toBe("where_in_leaflet");
    expect(r.text).toContain(`PDF-strani ${PAGE}`);
    expect(r.actions).toEqual([{ type: "open_leaflet", productId: ANCHOR_ID }]);
    expect(productOfferIds(r)).toEqual([ANCHOR_OFFER]);
    expect(r.allowModel).toBe(false);
  });

  it("'kaj pa cenejša možnost?' uses the šampinjoni context", () => {
    const r = buildDeterministicReply(req("kaj pa cenejša možnost?", { history: anchorContext }));
    expect(r.intent).toBe("cheaper");
    expect(r.text).toMatch(/šampinjoni/i);
    expect(r.actions).toEqual([]);
    const base = comparablePrice(getProduct(ANCHOR_ID)!, getPrimaryOffer(ANCHOR_ID)!).value;
    for (const oid of productOfferIds(r).filter((o) => o !== ANCHOR_OFFER)) {
      const o = getOffer(oid)!;
      expect(comparablePrice(getProduct(o.productId)!, o).value).toBeLessThan(base);
    }
  });

  it("unknown product → honest text, no invented product", () => {
    const r = buildDeterministicReply(req("Koliko stane kaviar?"));
    expect(r.intent).toBe("unknown_product");
    expect(r.text).toContain("Tega izdelka ne najdem med preverjenimi izdelki iz kataloga");
    expect(r.text).toContain("ne morem zanesljivo povedati cene");
    expect(r.text).not.toMatch(/kaviar/i);
    for (const oid of productOfferIds(r)) expect(getOffer(oid)).toBeDefined();
    expect(r.actions).toEqual([]);
    expect(r.allowModel).toBe(false);
  });

  it("out-of-scope steers back to shopping without products", () => {
    const r = buildDeterministicReply(req("Kdo bo zmagal na volitvah?"));
    expect(r.intent).toBe("out_of_scope");
    expect(r.text).toMatch(/^Pri tem ti ne znam zanesljivo pomagati/);
    expect(r.text).toMatch(/SPAR kataloga/);
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
    const r = buildDeterministicReply(req("dodaj to", { history: anchorContext }));
    expect(r.actions).toEqual([{ type: "save", productId: ANCHOR_ID }]);
    expect(r.text).not.toMatch(/shranil|dodal|dodan|shranjen/i);
    expect(r.allowModel).toBe(false);
  });

  it("'dodaj šampinjone' (explicit) → save action for šampinjoni", () => {
    const r = buildDeterministicReply(req("dodaj šampinjone"));
    if (r.kind === "ambiguous") expect(r.actions).toEqual([]);
    else expect(r.actions).toEqual([{ type: "save", productId: ANCHOR_ID }]);
  });

  it("'dodaj to' with several context products → choices, no action", () => {
    const history: ChatRequestMessage[] = [{ role: "assistant", text: "…", contextProductIds: [ANCHOR_ID, products.find((p) => p.id !== ANCHOR_ID)!.id] }];
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

  it("'dodaj kaviar' with šampinjoni context does not save šampinjoni", () => {
    const r = buildDeterministicReply(req("dodaj kaviar", { history: anchorContext }));
    expect(r.actions).toEqual([]);
  });

  it("'odstrani to' → remove action for the context product", () => {
    const r = buildDeterministicReply(req("odstrani to", { history: anchorContext, saved: [ANCHOR_ID] }));
    expect(r.actions).toEqual([{ type: "remove", productId: ANCHOR_ID }]);
  });

  it("read-only questions never produce save/remove actions", () => {
    const readOnly = ["Koliko stane šampinjoni?", "Kaj je najbolj znižano?", "Večerja za dva do 10 €", "Predlagaj hiter zajtrk", "S-BUDGET izdelki", "priporoči mi kaj", "kaj pa cenejša možnost?", "kje je v letaku?", "živjo", "Kako si?", "Kaj znaš?", "Hvala!", "Koliko stane kaviar?", "Šampinjoni je 1,99 €, kajne?"];
    for (const q of readOnly) {
      const r = buildDeterministicReply(req(q, { history: anchorContext }));
      expect(r.actions.filter((a) => a.type === "save" || a.type === "remove")).toEqual([]);
    }
  });
});

describe("discounts", () => {
  it("ranks only verified printed percentages, sorted desc, without S-BUDGET šampinjoni", () => {
    const ranked = rankDiscounts({ limit: offers.length });
    for (const r of ranked) {
      expect(isPercentDiscount(r.offer)).toBe(true);
      expect(r.offer.discountPercent).not.toBeNull();
      expect(r.offer.conditions.couponRequired).toBe(false);
      expect(r.offer.verification.status).toBe("verified");
    }
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].offer.discountPercent!).toBeGreaterThanOrEqual(ranked[i].offer.discountPercent!);
    expect(ranked.map((r) => r.offer.id)).not.toContain(ANCHOR_OFFER);
    expect(ranked.length).toBe(offers.filter(isPercentDiscount).length);
  });

  it("answer is scoped to the catalog's verified selection and shows at most 4", () => {
    const r = buildDeterministicReply(req("Kaj je najbolj znižano?"));
    expect(r.text).toContain("Med preverjenimi izdelki v aktualnem katalogu");
    expect(r.text).not.toMatch(/trenutno v trgovini|danes/i);
    const ids = productOfferIds(r);
    expect(ids.length).toBeLessThanOrEqual(4);
    expect(ids).not.toContain(ANCHOR_OFFER);
    const top = rankDiscounts({ limit: 4 });
    expect(ids).toEqual(top.map((t) => t.offer.id));
    // The prose names the biggest discount; the rows (block) carry every product, so they aren't listed twice.
    expect(r.text).toContain(`${top[0].offer.discountPercent} %`);
    expect(r.text.split("\n").filter((l) => l.startsWith("•"))).toHaveLength(0);
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
  // Three plain pack offers (no card, no coupon) so the synthetic recipe needs no SPAR plus card.
  const PLAIN = offers.filter((o) => !o.conditions.spPlusRequired && !o.conditions.couponRequired && o.priceUnit === "pack").sort((a, b) => a.id.localeCompare(b.id)).slice(0, 3);
  const synthetic: Recipe = {
    id: "test-synthetic",
    title: "Testni obrok",
    kind: "dinner",
    servings: 2,
    budgetCents: 1000,
    ingredients: [
      { offerId: PLAIN[0].id, requiredQuantity: "500 g", packsNeeded: 1, conversionNote: "1 pakiranje" },
      { offerId: PLAIN[1].id, requiredQuantity: "600 g", packsNeeded: 1, conversionNote: "1 kg zadošča" },
      { offerId: PLAIN[2].id, requiredQuantity: "1,2 kg", packsNeeded: 2, conversionNote: "dve celi pakiranji" },
    ],
    pantryAssumptions: ["olje in sol imaš doma"],
    steps: ["Skuhaj."],
    minutes: 20,
  };

  it("computes whole-pack totals from data", () => {
    const t = recipeTotals(synthetic)!;
    const expected = PLAIN[0].priceCents + PLAIN[1].priceCents + 2 * PLAIN[2].priceCents;
    expect(t.withCard).toBe(expected);
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
    expect(render(`{{name:${ANCHOR_ID}}} {{pack:${ANCHOR_ID}}} {{price:${ANCHOR_OFFER}}} stran {{page:${ANCHOR_ID}}}`, { spPlus: "unset" })).toBe(`S-BUDGET šampinjoni ${ANCHOR.packSize} ${PRICE} stran ${PAGE}`);
    expect(resolvePlaceholders(`{{price:${ANCHOR_OFFER}}}`, { spPlus: "unset", allowedOfferIds: new Set() }).ok).toBe(false);
    expect(resolvePlaceholders("{{price:offer-ne-obstaja}}", { spPlus: "unset" }).ok).toBe(false);
    expect(resolvePlaceholders(`{{discount:${ANCHOR_OFFER}}}`, { spPlus: "unset" }).ok).toBe(false); // no printed discount
  });
});

describe("conversation (limited mode, deterministic)", () => {
  it.each([
    ["Živjo", "greeting"],
    ["Kako si?", "how_are_you"],
    ["Kaj znaš?", "help"],
    ["Kaj vse te lahko vprašam?", "help"],
    ["Hvala!", "thanks"],
  ])("%s → %s, natural reply without products or actions", (q, intent) => {
    const r = buildDeterministicReply(req(q));
    expect(r.intent).toBe(intent);
    expect(productOfferIds(r)).toEqual([]);
    expect(r.actions).toEqual([]);
    expect(r.text).not.toMatch(/ne najdem|danes/);
  });

  it("a greeting with a product question answers the product", () => {
    expect(productOfferIds(buildDeterministicReply(req("Živjo, koliko stane šampinjoni?")))).toEqual([ANCHOR_OFFER]);
  });

  it("help lists capabilities exactly (never via the model)", () => {
    const r = buildDeterministicReply(req("Kaj vse te lahko vprašam?"));
    expect(r.allowModel).toBe(false);
    expect(r.text).toMatch(/znižano/);
    expect(r.text).toMatch(/letaku/);
    expect(r.text).toMatch(/večerjo/);
  });

  it("off-topic is redirected gently toward the SPAR catalog", () => {
    const r = buildDeterministicReply(req("Kakšno bo vreme jutri?"));
    expect(r.intent).toBe("out_of_scope");
    expect(r.text).toBe("Za vreme ti ne znam zanesljivo pomagati, lahko pa ti pomagam preveriti izdelke, cene, akcije ali ideje iz SPAR kataloga.");
    expect(r.text).not.toMatch(/ne najdem/);
    expect(productOfferIds(r)).toEqual([]);
  });

  it("small talk is framed around the current catalog", () => {
    expect(buildDeterministicReply(req("Živjo")).text).toBe("Živjo! 👋 Kaj bi rad preveril v aktualnem SPAR katalogu?");
    expect(buildDeterministicReply(req("Kako si?")).text).toBe(
      "Super, hvala 😊 Pripravljen sem ti pomagati z izdelki, cenami, akcijami ali idejami iz aktualnega kataloga.",
    );
    expect(buildDeterministicReply(req("Hvala!")).text).toMatch(/katalog/);
  });

  it("capability answer positions Sparko as the catalog assistant; 'Kaj vse te lahko vprašam?' adds examples", () => {
    const what = buildDeterministicReply(req("Kaj znaš?"));
    expect(what.text).toMatch(/^Pomagam ti raziskovati aktualni SPAR katalog/);
    for (const part of [/cene in akcije/, /proračun/, /Moj katalog/, /letaku/, /najbližji SPAR/, /v trgovini/]) expect(what.text).toMatch(part);
    expect(what.text).not.toMatch(/Na primer/);
    expect(buildDeterministicReply(req("Kaj vse te lahko vprašam?")).text).toContain(`Na primer: »Koliko stane ${products[0].name}?«`);
  });

  it("new catalog starters route to the same flows as before", () => {
    const ask = buildDeterministicReply(req("Koliko stane izdelek v katalogu?"));
    expect(ask.text).toBe("Seveda. Kateri izdelek te zanima?");
    const šampinjoni = buildDeterministicReply(
      req("šampinjoni", { history: [{ role: "user", text: "Koliko stane izdelek v katalogu?" }, { role: "assistant", text: ask.text }] }),
    );
    expect(productOfferIds(šampinjoni)).toEqual([ANCHOR_OFFER]);
    expect(buildDeterministicReply(req("Kaj je najbolj znižano v katalogu?")).intent).toBe("discounts");
    expect(buildDeterministicReply(req("Kje je meni najbližji SPAR?")).intent).toBe("nearest_store");
    const store = buildDeterministicReply(req("Kje v trgovini je izdelek iz kataloga?"));
    expect(store.intent).toBe("store_location");
    expect(store.text).toBe("Seveda. Kateri izdelek iščeš v trgovini?");
    const bread = buildDeterministicReply(
      req("kruh", { history: [{ role: "user", text: "Kje v trgovini je izdelek iz kataloga?" }, { role: "assistant", text: store.text }] }),
    );
    expect(bread.blocks).toEqual([{ type: "store_map", sectionId: "pekarna" }]);
    // Asking for a place in the catalog still never routes to the store map.
    expect(buildDeterministicReply(req("Kje v trgovini je šampinjoni v katalogu?")).intent).not.toBe("store_location");
    expect(buildDeterministicReply(req("Kje je kruh v letaku?")).intent).toBe("where_in_leaflet");
  });

  it("recommendations are grounded in the named catalog category", () => {
    const r = buildDeterministicReply(req("kaj mi priporočaš od mesa"));
    expect(r.intent).toBe("recommend");
    expect(r.text).toMatch(/^Med izdelki v aktualnem katalogu ti priporočam:/);
    const ids = productOfferIds(r);
    expect(ids.length).toBeGreaterThan(0);
    for (const oid of ids) expect(getProduct(getOffer(oid)!.productId)!.categories.some((c) => /^mes/.test(c))).toBe(true);
  });

  it("budget and meal questions answer with verified recipes from the catalog", () => {
    for (const q of ["imam 10 €, kaj lahko pripravim?", "imam 10 €, kaj lahko kupim?"]) {
      const r = buildDeterministicReply(req(q));
      expect(r.intent, q).toBe("meal");
      expect(r.text, q).toMatch(/aktualno ponudbo v katalogu, lahko v okviru 10,00 €/);
      expect(r.blocks.some((b) => b.type === "recipe"), q).toBe(true);
    }
    expect(buildDeterministicReply(req("Priporoči mi nekaj za večerjo.")).text).toMatch(/^Seveda – pogledal sem aktualni katalog. Za večerjo/);
    expect(buildDeterministicReply(req("kaj lahko jem za zajtrk?")).text).toMatch(/iz aktualnega kataloga/i);
  });

  it("multi-turn: product → cheaper → add it → where in catalog keeps the referenced product", () => {
    const history: ChatRequestMessage[] = [];
    const turn = (text: string) => {
      const r = buildDeterministicReply(req(text, { history: [...history] }));
      history.push({ role: "user", text }, { role: "assistant", text: r.text, contextProductIds: r.contextProductIds });
      return r;
    };
    expect(productOfferIds(turn("Koliko stane šampinjoni?"))).toEqual([ANCHOR_OFFER]);
    const cheaper = turn("kaj pa cenejša?");
    expect(cheaper.intent).toBe("cheaper");
    const alt = cheaper.contextProductIds.find((id) => id !== ANCHOR_ID)!;
    expect(alt).toBeDefined();
    if (cheaper.contextProductIds.length === 1) {
      expect(turn("dodaj jo").actions).toEqual([{ type: "save", productId: alt }]);
      const where = turn("kje je v katalogu?");
      expect(where.intent).toBe("where_in_leaflet");
      expect(where.actions).toEqual([{ type: "open_leaflet", productId: alt }]);
    }
  });

  it("'Pokaži mi nekaj pod 5 €' lists verified catalog products under the limit", () => {
    const r = buildDeterministicReply(req("Pokaži mi nekaj pod 5 €."));
    expect(r.intent).not.toBe("unknown_product");
    const ids = productOfferIds(r);
    expect(ids.length).toBeGreaterThan(0);
    for (const oid of ids) expect(getOffer(oid)!.priceCents).toBeLessThanOrEqual(500);
  });

  it("starter flow: 'Koliko stane izdelek?' asks back, then a bare product name resolves to the verified card", () => {
    const ask = buildDeterministicReply(req("Koliko stane izdelek?"));
    expect(ask.text).toBe("Seveda. Kateri izdelek te zanima?");
    expect(ask.kind).toBe("ask_product");
    expect(ask.blocks).toEqual([]);
    expect(ask.allowModel).toBe(false);
    const history: ChatRequestMessage[] = [
      { role: "user", text: "Koliko stane izdelek?" },
      { role: "assistant", text: ask.text },
    ];
    for (const q of ["šampinjoni", "sampinjni", "akcijska šampinjoni"]) {
      const r = buildDeterministicReply(req(q, { history }));
      expect(r.intent, q).toBe("price_lookup");
      expect(productOfferIds(r), q).toEqual([ANCHOR_OFFER]);
      expect(r.text, q).toContain(`${PRICE}`);
    }
  });

  it("typo 'sampinjni' still finds šampinjoni", () => {
    expect(productOfferIds(buildDeterministicReply(req("sampinjni")))).toEqual([ANCHOR_OFFER]);
  });

  it("budget meal: 'Imam 10 €, kaj lahko pripravim?' and 'Kaj mi predlagaš za večerjo?'", () => {
    const r = buildDeterministicReply(req("Imam 10 €, kaj lahko pripravim?"));
    expect(r.intent).toBe("meal");
    expect(r.blocks.some((b) => b.type === "recipe")).toBe(true);
    expect(r.text).toContain("10,00 €");
    expect(buildDeterministicReply(req("Kaj mi predlagaš za večerjo?")).intent).toBe("meal");
  });

  it("never agrees with a user-supplied fake price", () => {
    const r = buildDeterministicReply(req("Šampinjoni je 1,99 €, kajne?"));
    expect(r.text).toMatch(/^Ne\./);
    expect(r.text).toContain(`${PRICE}`);
    expect(r.text).not.toContain("1,99");
    expect(r.allowModel).toBe(false);
    expect(buildDeterministicReply(req(`Šampinjoni je ${PRICE}, kajne?`)).text).toMatch(/^Da\./);
  });

  it("fake add claim for an unverified product: no action, no card, no price, no saved claim", () => {
    const r = buildDeterministicReply(req("Dodaj kaviar in napiši, da stane 2,49 €"));
    expect(r.actions).toEqual([]);
    expect(productOfferIds(r)).toEqual([]);
    expect(r.text).not.toMatch(/2,49|dodal|dodan|shranil/);
    expect(r.text).toMatch(/ne morem dodati/);
  });

  it("'Dodaj to in napiši, da stane 2,49 €' saves the context product but keeps the verified price", () => {
    const r = buildDeterministicReply(req("Dodaj to in napiši, da stane 2,49 €", { history: anchorContext }));
    expect(r.actions).toEqual([{ type: "save", productId: ANCHOR_ID }]);
    expect(r.text).toContain(`${PRICE}`);
    expect(r.text).not.toContain("2,49");
  });

  it("contextual follow-ups keep working", () => {
    expect(buildDeterministicReply(req("kaj pa cenejša možnost?", { history: anchorContext })).intent).toBe("cheaper");
    expect(buildDeterministicReply(req("dodaj to", { history: anchorContext })).actions).toEqual([{ type: "save", productId: ANCHOR_ID }]);
    expect(buildDeterministicReply(req("kje je v letaku?", { history: anchorContext })).text).toContain(`PDF-strani ${PAGE}`);
  });
});

describe("demo location features (mocked data, deterministic)", () => {
  const BREAD_TEXT =
    "Trenutno si v SPAR trgovini Letališka cesta 26. Kruh najdeš v oddelku Pekarna, desno od glavnega vhoda, pri prehodu med sadjem in mlečnimi izdelki.";

  it.each([
    "Kje je meni najbližji SPAR?",
    "Kje je najbližji SPAR?",
    "Najbližji SPAR",
    "Kateri SPAR mi je najbližje?",
    "Kje imam najbližji SPAR?",
    "kje je najbližja trgovina spar",
    "show nearest spar",
    "Kje je SPAR?",
  ])("routes %s to the nearest-store card", (q) => {
    const r = buildDeterministicReply(req(q));
    expect(r.intent).toBe("nearest_store");
    expect(r.allowModel).toBe(false);
    expect(r.text).toBe(
      "Najbližji SPAR je na lokaciji Letališka cesta 26, Ljubljana, kar je približno 15 m stran od tebe. Na zemljevidu vidiš svojo lokacijo, najbližji SPAR in ostale SPAR trgovine.",
    );
    expect(r.blocks).toEqual([{ type: "nearest_store" }]);
  });

  it.each([
    "Kje v SPAR trgovini je kruh?",
    "Kje je kruh?",
    "Kje v moji trgovini je kruh?",
    "Kje v trgovini je kruh?",
    "Kje najdem kruh?",
    "Kje se nahaja kruh?",
    "kje je kruha",
  ])("routes %s to the in-store bread map", (q) => {
    const r = buildDeterministicReply(req(q));
    expect(r.intent).toBe("store_location");
    expect(r.allowModel).toBe(false);
    expect(r.text).toBe(BREAD_TEXT);
    expect(r.blocks).toEqual([{ type: "store_map", sectionId: "pekarna" }]);
  });

  it("asks which product for the generic starter, then resolves a short reply", () => {
    const ask = buildDeterministicReply(req("Kje v trgovini je izdelek?"));
    expect(ask.intent).toBe("store_location");
    expect(ask.text).toBe("Seveda. Kateri izdelek iščeš v trgovini?");
    expect(ask.blocks).toEqual([]);
    const history: ChatRequestMessage[] = [
      { role: "user", text: "Kje v trgovini je izdelek?" },
      { role: "assistant", text: ask.text },
    ];
    const bread = buildDeterministicReply(req("Kruh", { history }));
    expect(bread.intent).toBe("store_location");
    expect(bread.text).toBe(BREAD_TEXT);
    const milk = buildDeterministicReply(req("mleko", { history }));
    expect(milk.blocks).toEqual([{ type: "store_map", sectionId: "mlecni" }]);
  });

  it("answers honestly for an unmapped product in the store flow", () => {
    const r = buildDeterministicReply(req("Kje v trgovini je kaviar?"));
    expect(r.intent).toBe("store_location");
    expect(r.blocks.some((b) => b.type === "store_map")).toBe(false);
    expect(r.text).toContain("še nimam označenega");
  });

  it("keeps leaflet and price questions on their existing flows", () => {
    expect(buildDeterministicReply(req("kje je v letaku?", { history: anchorContext })).intent).toBe("where_in_leaflet");
    expect(buildDeterministicReply(req("Kje je kruh v letaku?")).intent).toBe("where_in_leaflet");
    expect(buildDeterministicReply(req("Koliko stane kruh v sparu?")).intent).toBe("price_lookup");
    expect(buildDeterministicReply(req("Koliko stane šampinjoni?")).intent).toBe("price_lookup");
    expect(buildDeterministicReply(req("Kaj je najbolj znižano?")).intent).toBe("discounts");
    // The price follow-up is unaffected by the store follow-up.
    const priceHistory: ChatRequestMessage[] = [
      { role: "user", text: "Koliko stane izdelek?" },
      { role: "assistant", text: "Seveda. Kateri izdelek te zanima?" },
    ];
    expect(buildDeterministicReply(req("šampinjoni", { history: priceHistory })).intent).toBe("price_lookup");
  });
});
