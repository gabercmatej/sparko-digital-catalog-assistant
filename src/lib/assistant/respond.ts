/**
 * Deterministic responder: concise, friendly Slovenian (tikanje). All numbers come from data via
 * placeholders resolved in ./placeholders. Works without any language model and is the fallback.
 * Never claims that something was saved — the client appends the real store result.
 */
import { getPlacementsForProduct, getPrimaryOffer, getProduct, getRecipe, products as allProducts } from "@/lib/catalog";
import { getRecommendations } from "@/lib/recommendations";
import { findStoreSection, storeLocationText } from "@/lib/demo/storeMap";
import { NEAREST_STORE_TEXT } from "@/lib/demo/stores";
import type { ChatAction, ChatRequest, MessageBlock, Offer, Product } from "@/lib/types";
import { discountTemplate, rankDiscounts } from "./discounts";
import { COMMAND_STOP, detectIntent, type DetectedIntent, type Intent } from "./intents";
import { breakfastProducts, mealTemplate, recipeProductIds, suggestMeal, type MealRequest } from "./meals";
import { displayName, render, type PlaceholderContext } from "./placeholders";
import { ASK_PRODUCT_TEXT, ASK_STORE_PRODUCT_TEXT, STARTER_PROMPTS } from "./starters";
import { cheaperAlternatives, comparablePrice, productsInLine, queryContentTokens, searchProducts, type SearchHit } from "./search";

export const MAX_PRODUCTS_SHOWN = 4;

export type ReplyKind = Intent | "ambiguous" | "ask_product" | "price_check";

export type DeterministicReply = {
  intent: Intent;
  /** Finer classification, e.g. "ambiguous" when we ask a clarifying question. */
  kind: ReplyKind;
  /** Text with placeholders (shared with the language model). */
  template: string;
  /** Resolved text. */
  text: string;
  blocks: MessageBlock[];
  contextProductIds: string[];
  actions: ChatAction[];
  /** Products the model may choose among (blocks are always built from these). */
  candidateProductIds: string[];
  candidateRecipeIds: string[];
  /** False for commands, clarifying questions and unknown products: answered without the model. */
  allowModel: boolean;
  placeholderCtx: PlaceholderContext;
};

export type RecommendFn = (savedProductIds: string[], opts: { limit?: number; excludeIds?: string[] }) => { productId: string; reason: string }[];

export type ResponderDeps = { recommend?: RecommendFn };

export const SUGGESTION_CHOICES: { label: string; message: string }[] = STARTER_PROMPTS;

type Draft = Omit<DeterministicReply, "text" | "intent" | "placeholderCtx" | "kind"> & { kind?: ReplyKind };

// ------------------------------------------------------------------ helpers

function cardSuffix(o: Offer): string {
  if (o.conditions.spPlusRequired) return " s kartico SPAR plus";
  if (o.conditions.couponRequired) return " s kuponom";
  return "";
}

function listLine(p: Product, o: Offer): string {
  const disc = o.discountPercent != null ? ` ({{discount:${o.id}}} ceneje)` : "";
  return `• {{name:${p.id}}}, {{pack:${p.id}}}: {{price:${o.id}}}${cardSuffix(o)}${disc}`;
}

function shortLabel(p: Product): string {
  return `${displayName(p)}, ${p.packSize}`;
}

function productsBlock(offerIds: string[], layout: "card" | "list", reasons?: Record<string, string>): MessageBlock {
  return { type: "products", offerIds: offerIds.slice(0, MAX_PRODUCTS_SHOWN), layout, ...(reasons && Object.keys(reasons).length ? { reasons } : {}) };
}

function hitsOf(ids: string[]): SearchHit[] {
  return ids
    .map((id): SearchHit | null => {
      const product = getProduct(id);
      const offer = product && getPrimaryOffer(id);
      return product && offer ? { product, offer, score: 0, matched: [] } : null;
    })
    .filter((x): x is SearchHit => !!x);
}

/** Single product price sentence, honest about card conditions. */
function priceTemplate(p: Product, o: Offer, spPlus: ChatRequest["spPlus"]): string {
  let t = `V demo katalogu je {{name:${p.id}}}, {{pack:${p.id}}}, po {{price:${o.id}}}${cardSuffix(o)}`;
  if (o.discountPercent != null) t += ` ({{discount:${o.id}}} ceneje)`;
  t += ".";
  if (o.conditions.spPlusRequired && spPlus === "no") {
    t += o.regularPriceCents != null ? ` Brez kartice je redna cena {{regularPrice:${o.id}}}.` : " Cena brez kartice v katalogu ni navedena.";
  }
  return t;
}

/** Strong hits: within 85 % of the top score. */
function strongHits(hits: SearchHit[]): SearchHit[] {
  if (!hits.length) return [];
  const top = hits[0].score;
  return hits.filter((h) => h.score >= top * 0.85);
}

function ambiguousDraft(hits: SearchHit[], question: string, makeMessage: (p: Product) => string, withPriceLines = true): Draft {
  const shown = hits.slice(0, MAX_PRODUCTS_SHOWN);
  const lines = withPriceLines ? `\n${shown.map((h) => listLine(h.product, h.offer)).join("\n")}` : "";
  return {
    kind: "ambiguous",
    template: withPriceLines ? `Našel sem več izdelkov:${lines}\n${question}` : question,
    blocks: [
      productsBlock(
        shown.map((h) => h.offer.id),
        "list",
      ),
      { type: "choices", prompt: question, options: shown.map((h) => ({ label: shortLabel(h.product), message: makeMessage(h.product) })) },
    ],
    contextProductIds: shown.map((h) => h.product.id),
    actions: [],
    candidateProductIds: shown.map((h) => h.product.id),
    candidateRecipeIds: [],
    allowModel: false,
  };
}

/** Resolve the target product(s) of a command: explicit mention first, then recent context. */
function resolveTargets(d: DetectedIntent, preferIds?: string[], strict = false): { explicit: boolean; hits: SearchHit[]; unknownMention: boolean } {
  const content = queryContentTokens(d.text, COMMAND_STOP);
  if (content.length) {
    const hits = searchProducts(d.text, { extraStop: COMMAND_STOP, filters: d.filters.line ? { line: d.filters.line } : {} });
    if (hits.length) return { explicit: true, hits: strongHits(hits), unknownMention: false };
    // Words like "to"/"ta" are stopwords; anything left that matched nothing is an unknown mention.
    // For mutations (save/remove) never fall back to context when the user named something we cannot find.
    if (strict || !d.contextProductIds.length) return { explicit: true, hits: [], unknownMention: true };
  }
  let ids = d.contextProductIds;
  if (preferIds && ids.length > 1) {
    const pref = ids.filter((id) => preferIds.includes(id));
    if (pref.length) ids = pref;
  }
  if (!ids.length && preferIds && preferIds.length) ids = preferIds;
  return { explicit: false, hits: hitsOf(ids), unknownMention: false };
}

function unknownDraft(d: DetectedIntent, verb?: "save" | "remove"): Draft {
  const weak = searchProducts(d.text, { minScore: 0.6, limit: 3 });
  const blocks: MessageBlock[] = [];
  let template =
    "Tega izdelka v preverjenem delu demo kataloga ne najdem" +
    (verb === "save" ? ", zato ga ne morem dodati v Moj katalog." : verb === "remove" ? ", zato ga ne morem odstraniti." : ".");
  if (weak.length) {
    template += " Morda te zanima kaj od tega:";
    template += `\n${weak.map((h) => listLine(h.product, h.offer)).join("\n")}`;
    blocks.push(productsBlock(weak.map((h) => h.offer.id), "list"));
  } else {
    template += " Lahko ti poiščem drug izdelek, pokažem popuste ali predlagam obrok.";
    blocks.push({ type: "choices", options: [{ label: "Pokaži izdelke S-BUDGET", message: "Pokaži S-BUDGET izdelke" }, SUGGESTION_CHOICES[1]] });
  }
  return {
    kind: "unknown_product",
    template,
    blocks,
    contextProductIds: weak.map((h) => h.product.id),
    actions: [],
    candidateProductIds: weak.map((h) => h.product.id),
    candidateRecipeIds: [],
    allowModel: false,
  };
}

function listDraft(intro: string, hits: SearchHit[], opts: { reasons?: Record<string, string>; allowModel?: boolean } = {}): Draft {
  const shown = hits.slice(0, MAX_PRODUCTS_SHOWN);
  return {
    template: `${intro}\n${shown.map((h) => listLine(h.product, h.offer)).join("\n")}`,
    blocks: [productsBlock(shown.map((h) => h.offer.id), "list", opts.reasons)],
    contextProductIds: shown.map((h) => h.product.id),
    actions: [],
    candidateProductIds: shown.map((h) => h.product.id),
    candidateRecipeIds: [],
    allowModel: opts.allowModel ?? true,
  };
}

function singleDraft(h: SearchHit, spPlus: ChatRequest["spPlus"]): Draft {
  return {
    template: priceTemplate(h.product, h.offer, spPlus),
    blocks: [productsBlock([h.offer.id], "card")],
    contextProductIds: [h.product.id],
    actions: [],
    candidateProductIds: [h.product.id],
    candidateRecipeIds: [],
    allowModel: true,
  };
}

// ------------------------------------------------------------------ intent handlers

function handleLookup(d: DetectedIntent, req: ChatRequest): Draft {
  const content = queryContentTokens(d.text);
  const hits = searchProducts(d.text, { filters: d.filters });
  if (!hits.length) {
    if (!content.length && (d.filters.line || d.filters.maxPriceCents != null)) {
      const listed = d.filters.line
        ? productsInLine(d.filters.line, d.filters)
        : allProducts
            .map((p) => ({ product: p, offer: getPrimaryOffer(p.id) }))
            .filter((x): x is { product: Product; offer: Offer } => !!x.offer && x.offer.priceCents <= (d.filters.maxPriceCents ?? Infinity))
            .map((x) => ({ ...x, score: 0, matched: [] }));
      if (listed.length) return listDraft("V preverjenem izboru demo kataloga sem našel:", listed);
    }
    if (!content.length) {
      // "Koliko stane izdelek?" – ask back; the next short reply is resolved as a price lookup (see detectIntent).
      return {
        template: ASK_PRODUCT_TEXT,
        blocks: [],
        contextProductIds: [],
        actions: [],
        candidateProductIds: [],
        candidateRecipeIds: [],
        allowModel: false,
        kind: "ask_product",
      };
    }
    return unknownDraft(d);
  }
  const strong = strongHits(hits);
  if (strong.length >= 2) {
    return ambiguousDraft(strong, "Katerega imaš v mislih?", (p) => `Koliko stane ${displayName(p)}, ${p.packSize}?`);
  }
  const single = singleDraft(strong[0], req.spPlus);
  const claimed = claimedPriceCents(d);
  if (claimed == null) return single;
  // The user asserted a price ("Skuta je 1,99 €, kajne?"): answer with the verified price, never with agreement by the model.
  const agrees = claimed === strong[0].offer.priceCents;
  return { ...single, template: `${agrees ? "Da." : "Ne."} ${single.template}`, allowModel: false, kind: "price_check" };
}

/** A price the user asserted ("Skuta je 1,99 €"); ignored when it is a filter ("do 5 €"). */
function claimedPriceCents(d: DetectedIntent): number | null {
  if (d.filters.maxPriceCents != null) return null;
  const m = d.folded.match(/\b(\d{1,3},\d{1,2})\b|\b(\d{1,3})\s*eur\b/);
  return m ? Math.round(parseFloat((m[1] ?? m[2]).replace(",", ".")) * 100) : null;
}

function handleLine(d: DetectedIntent, req: ChatRequest): Draft {
  const content = queryContentTokens(d.text).filter((t) => !/^(izdelk|linij|znamk)/.test(t));
  if (content.length) {
    const hits = searchProducts(d.text, { filters: d.filters });
    if (hits.length) return handleLookup(d, req);
  }
  const line = d.filters.line!;
  const listed = productsInLine(line, d.filters);
  if (!listed.length) return unknownDraft(d);
  const label = listed[0].product.line ?? listed[0].product.brand ?? "";
  return listDraft(`Izdelki ${label} v preverjenem izboru demo kataloga:`, listed);
}

function handleCheaper(d: DetectedIntent, req: ChatRequest): Draft {
  const t = resolveTargets(d);
  if (t.unknownMention) return unknownDraft(d);
  if (!t.hits.length) {
    // "Kaj je najcenejše?" without context: lowest pack prices in the verified selection.
    const cheapest = allProducts
      .map((p) => ({ product: p, offer: getPrimaryOffer(p.id) }))
      .filter((x): x is { product: Product; offer: Offer } => !!x.offer && x.offer.priceUnit === "pack")
      .sort((a, b) => a.offer.priceCents - b.offer.priceCents || a.product.editorialRank - b.product.editorialRank)
      .map((x) => ({ ...x, score: 0, matched: [] }));
    return listDraft("Najnižje cene pakiranj v preverjenem izboru demo kataloga:", cheapest);
  }
  if (t.hits.length > 1) {
    return ambiguousDraft(t.hits, "Za kateri izdelek iščeš cenejšo možnost?", (p) => `Kaj je ceneje kot ${displayName(p)}?`);
  }
  const base = t.hits[0];
  const alts = cheaperAlternatives(base.product.id, { spPlus: req.spPlus });
  if (!alts.length) {
    return {
      template: `Za {{name:${base.product.id}}} ({{price:${base.offer.id}}}) v preverjenem izboru demo kataloga nimam cenejše primerljive možnosti.`,
      blocks: [productsBlock([base.offer.id], "card")],
      contextProductIds: [base.product.id],
      actions: [],
      candidateProductIds: [base.product.id],
      candidateRecipeIds: [],
      allowModel: true,
    };
  }
  const basis = comparablePrice(base.product, base.offer);
  const note = basis.basis === "unit" ? ` (primerjava po ceni na ${basis.unit === "kos" ? "kos" : basis.unit})` : "";
  return listDraft(`Cenejše primerljive možnosti od {{name:${base.product.id}}} ({{price:${base.offer.id}}})${note}:`, alts);
}

function handleSave(d: DetectedIntent): Draft {
  const t = resolveTargets(d, undefined, true);
  if (t.unknownMention) return unknownDraft(d, "save");
  if (!t.hits.length) {
    return {
      template: "Kateri izdelek želiš dodati v Moj katalog? Napiši njegovo ime.",
      blocks: [],
      contextProductIds: [],
      actions: [],
      candidateProductIds: [],
      candidateRecipeIds: [],
      allowModel: false,
      kind: "ambiguous",
    };
  }
  if (t.hits.length > 1) {
    return ambiguousDraft(t.hits, "Kateri izdelek naj dodam v Moj katalog?", (p) => `Dodaj ${displayName(p)}, ${p.packSize}`, false);
  }
  const h = t.hits[0];
  const claimed = claimedPriceCents(d);
  const priceNote = claimed != null && claimed !== h.offer.priceCents ? ` Cene ne morem spremeniti: v demo katalogu stane {{price:${h.offer.id}}}.` : "";
  return {
    template: `{{name:${h.product.id}}}, {{pack:${h.product.id}}}.${priceNote}`,
    blocks: [productsBlock([h.offer.id], "card")],
    contextProductIds: [h.product.id],
    actions: [{ type: "save", productId: h.product.id }],
    candidateProductIds: [h.product.id],
    candidateRecipeIds: [],
    allowModel: false,
  };
}

function handleRemove(d: DetectedIntent, req: ChatRequest): Draft {
  const t = resolveTargets(d, req.savedProductIds.filter((id) => !!getProduct(id)), true);
  if (t.unknownMention) return unknownDraft(d, "remove");
  if (!t.hits.length) {
    return {
      template: "Kateri izdelek želiš odstraniti iz Mojega kataloga?",
      blocks: [],
      contextProductIds: [],
      actions: [],
      candidateProductIds: [],
      candidateRecipeIds: [],
      allowModel: false,
      kind: "ambiguous",
    };
  }
  if (t.hits.length > 1) {
    return ambiguousDraft(t.hits, "Kateri izdelek naj odstranim iz Mojega kataloga?", (p) => `Odstrani ${displayName(p)}, ${p.packSize}`, false);
  }
  const h = t.hits[0];
  return {
    template: `{{name:${h.product.id}}}, {{pack:${h.product.id}}}.`,
    blocks: [productsBlock([h.offer.id], "card")],
    contextProductIds: [h.product.id],
    actions: [{ type: "remove", productId: h.product.id }],
    candidateProductIds: [h.product.id],
    candidateRecipeIds: [],
    allowModel: false,
  };
}

function handleWhere(d: DetectedIntent): Draft {
  const t = resolveTargets(d);
  if (t.unknownMention) return unknownDraft(d);
  if (!t.hits.length) {
    return {
      template: "Kateri izdelek naj poiščem v letaku? Napiši njegovo ime.",
      blocks: [],
      contextProductIds: [],
      actions: [],
      candidateProductIds: [],
      candidateRecipeIds: [],
      allowModel: false,
      kind: "ambiguous",
    };
  }
  if (t.hits.length > 1) {
    return ambiguousDraft(t.hits, "Kateri izdelek naj poiščem v letaku?", (p) => `Kje je ${displayName(p)}, ${p.packSize} v letaku?`, false);
  }
  const h = t.hits[0];
  const pl = getPlacementsForProduct(h.product.id)[0];
  if (!pl) {
    return {
      template: `Za {{name:${h.product.id}}} v letaku nimam označenega mesta.`,
      blocks: [productsBlock([h.offer.id], "card")],
      contextProductIds: [h.product.id],
      actions: [],
      candidateProductIds: [h.product.id],
      candidateRecipeIds: [],
      allowModel: false,
    };
  }
  return {
    template: `{{name:${h.product.id}}} je v letaku na PDF-strani {{page:${h.product.id}}}.`,
    blocks: [productsBlock([h.offer.id], "card")],
    contextProductIds: [h.product.id],
    actions: [{ type: "open_leaflet", productId: h.product.id }],
    candidateProductIds: [h.product.id],
    candidateRecipeIds: [],
    allowModel: false,
  };
}

function handleDiscounts(req: ChatRequest): Draft {
  const ranked = rankDiscounts({ limit: MAX_PRODUCTS_SHOWN });
  return {
    template: discountTemplate(ranked, req.spPlus),
    blocks: ranked.length
      ? [productsBlock(ranked.map((r) => r.offer.id), "list")]
      : [{ type: "choices", options: [{ label: "Pokaži izdelke S-BUDGET", message: "Pokaži S-BUDGET izdelke" }] }],
    contextProductIds: ranked.map((r) => r.product.id),
    actions: [],
    candidateProductIds: ranked.map((r) => r.product.id),
    candidateRecipeIds: [],
    allowModel: true,
  };
}

function handleMeal(mealReq: MealRequest): Draft {
  const s = suggestMeal(mealReq);
  const template = mealTemplate(s, mealReq);
  if (s.choice) {
    const ids = recipeProductIds(s.choice.recipe);
    return {
      template,
      blocks: [{ type: "recipe", recipeId: s.choice.recipe.id }],
      contextProductIds: ids,
      actions: [],
      candidateProductIds: ids,
      candidateRecipeIds: [s.choice.recipe.id],
      allowModel: true,
    };
  }
  if (mealReq.kind === "breakfast") {
    const prods = breakfastProducts(MAX_PRODUCTS_SHOWN);
    if (prods.length) {
      return listDraft("Za hiter zajtrk ti iz demo kataloga predlagam:", hitsOf(prods.map((p) => p.id)));
    }
  }
  return {
    template,
    blocks: [{ type: "choices", options: [SUGGESTION_CHOICES[0], SUGGESTION_CHOICES[1]] }],
    contextProductIds: [],
    actions: [],
    candidateProductIds: [],
    candidateRecipeIds: [],
    allowModel: false,
  };
}

const defaultRecommend: RecommendFn = (saved, opts) => getRecommendations(saved, { ...opts, fillEditorial: true });

function handleRecommend(req: ChatRequest, deps: ResponderDeps): Draft {
  const saved = req.savedProductIds.filter((id) => !!getProduct(id));
  let recs: { productId: string; reason: string }[] = [];
  try {
    recs = (deps.recommend ?? defaultRecommend)(saved, { limit: MAX_PRODUCTS_SHOWN });
  } catch {
    recs = [];
  }
  if (!recs.length) {
    // Local fallback: editorial order, not yet saved.
    recs = allProducts.filter((p) => !saved.includes(p.id)).slice(0, MAX_PRODUCTS_SHOWN).map((p) => ({ productId: p.id, reason: "Iz izbora demo kataloga" }));
  }
  const hits = hitsOf(recs.map((r) => r.productId).filter((id) => !saved.includes(id)));
  if (!hits.length) {
    return {
      template: "V demo katalogu trenutno nimam drugih izdelkov, ki jih še ni v tvojem Mojem katalogu.",
      blocks: [],
      contextProductIds: [],
      actions: [],
      candidateProductIds: [],
      candidateRecipeIds: [],
      allowModel: false,
    };
  }
  const reasons: Record<string, string> = {};
  for (const r of recs) {
    const o = getPrimaryOffer(r.productId);
    if (o && r.reason) reasons[o.id] = r.reason;
  }
  const intro = saved.length ? "Glede na tvoj Moj katalog predlagam:" : "Predlagam ti:";
  return listDraft(intro, hits, { reasons });
}

// ------------------------------------------------------------------ store location (mocked demo data)

/** Words of an in-store question that do not name a product ("Kje v SPAR trgovini je …?"). */
const STORE_QUERY_STOP = new Set(
  (
    "kje kam najdem najdes najti nahaja nahajajo stoji stojijo lezi spar sparu interspar trgovina trgovini trgovine market marketu prodajalni " +
    "moji moja tej nasi najblizji oddelek oddelku katerem polica polici policah vrsta vrsti prehodu delu iscem isces"
  ).split(" "),
);

function noModelDraft(template: string, blocks: MessageBlock[], kind?: ReplyKind): Draft {
  return { template, blocks, contextProductIds: [], actions: [], candidateProductIds: [], candidateRecipeIds: [], allowModel: false, ...(kind ? { kind } : {}) };
}

function handleNearestStore(): Draft {
  return noModelDraft(NEAREST_STORE_TEXT, [{ type: "nearest_store" }]);
}

function handleStoreLocation(d: DetectedIntent): Draft {
  const found = findStoreSection(d.text);
  if (found) return noModelDraft(storeLocationText(found.productLabel, found.section), [{ type: "store_map", sectionId: found.section.id }]);
  // "Kje v trgovini je izdelek?" – ask back; the next short reply is resolved as a store location (see detectIntent).
  if (!queryContentTokens(d.text, STORE_QUERY_STOP).length) return noModelDraft(ASK_STORE_PRODUCT_TEXT, [], "ask_product");
  return noModelDraft("Tega izdelka na zemljevidu trgovine še nimam označenega. Poskusi z drugim izdelkom, na primer s kruhom, mlekom ali sadjem.", [
    {
      type: "choices",
      options: [
        { label: "Kje je kruh?", message: "Kje v trgovini je kruh?" },
        { label: "Kje je mleko?", message: "Kje v trgovini je mleko?" },
        { label: "Kje je sadje?", message: "Kje v trgovini je sadje?" },
      ],
    },
  ]);
}

function simpleDraft(template: string, choices = SUGGESTION_CHOICES, allowModel = true): Draft {
  return {
    template,
    blocks: choices.length ? [{ type: "choices", options: choices }] : [],
    contextProductIds: [],
    actions: [],
    candidateProductIds: [],
    candidateRecipeIds: [],
    allowModel,
  };
}

// ------------------------------------------------------------------ entry point

export function buildDeterministicReply(req: ChatRequest, deps: ResponderDeps = {}): DeterministicReply {
  const d = detectIntent(req.messages);
  let intent: Intent = d.intent;
  let draft: Draft;
  const ctx: PlaceholderContext = { spPlus: req.spPlus, budgetCents: null, servings: null };
  switch (d.intent) {
    // Small talk: no numbers, no products, no dates – a live model may rephrase these within the guardrails.
    case "greeting":
      draft = simpleDraft("Živjo! Sem Sparko. Pomagam ti najti izdelke in cene iz kataloga SPAR ter predlagam ideje za obroke. Kaj te zanima?");
      break;
    case "how_are_you":
      draft = simpleDraft("Hvala, dobro! Pripravljen sem na nakupovanje. Ti poiščem ceno kakšnega izdelka ali predlagam večerjo?");
      break;
    case "thanks":
      draft = simpleDraft(/hvala/.test(d.folded) ? "Ni za kaj! Če potrebuješ še kaj, kar vprašaj." : "Super. Če te zanima še kaj, kar vprašaj.", []);
      break;
    case "help":
      // Kept exact (no model) so the capability list is always accurate.
      draft = simpleDraft(
        "Lahko me vprašaš:\n• koliko stane izdelek, npr. skuta ali jajca,\n• kaj je najbolj znižano,\n• kje je izdelek v letaku,\n• kje je najbližji SPAR in kje v trgovini najdeš izdelek,\n• kaj skuhati za večerjo ali kaj pripraviti z določenim zneskom.\nIzdelek lahko tudi dodaš v Moj katalog. Cene so iz kataloga SPAR.",
        SUGGESTION_CHOICES,
        false,
      );
      break;
    case "out_of_scope":
      draft = simpleDraft("Pri tem ti žal ne znam pomagati – sem Sparko, pomočnik za nakupe in kuhanje. Lahko ti poiščem ceno izdelka, pokažem popuste ali predlagam obrok.");
      break;
    case "save":
      draft = handleSave(d);
      break;
    case "remove":
      draft = handleRemove(d, req);
      break;
    case "where_in_leaflet":
      draft = handleWhere(d);
      break;
    case "nearest_store":
      draft = handleNearestStore();
      break;
    case "store_location":
      draft = handleStoreLocation(d);
      break;
    case "cheaper":
      draft = handleCheaper(d, req);
      break;
    case "discounts":
      draft = handleDiscounts(req);
      break;
    case "breakfast":
    case "meal": {
      const meal = d.meal ?? { kind: "any" as const, servings: null, budgetCents: null };
      const mealReq: MealRequest =
        d.intent === "breakfast"
          ? { kind: "breakfast", servings: null, budgetCents: null, spPlus: req.spPlus }
          : { kind: meal.kind, servings: meal.servings, budgetCents: meal.budgetCents, spPlus: req.spPlus };
      ctx.budgetCents = mealReq.budgetCents;
      ctx.servings = mealReq.servings;
      draft = handleMeal(mealReq);
      break;
    }
    case "recommend":
      draft = handleRecommend(req, deps);
      break;
    case "line":
      draft = handleLine(d, req);
      break;
    case "price_lookup":
    default:
      draft = handleLookup(d, req);
      break;
  }
  if (draft.kind === "unknown_product") intent = "unknown_product";
  for (const rid of draft.candidateRecipeIds) if (!getRecipe(rid)) throw new Error("unknown recipe");
  const text = render(draft.template, ctx);
  return {
    intent,
    kind: draft.kind ?? intent,
    template: draft.template,
    text,
    blocks: draft.blocks,
    contextProductIds: draft.contextProductIds,
    actions: draft.actions,
    candidateProductIds: draft.candidateProductIds,
    candidateRecipeIds: draft.candidateRecipeIds,
    allowModel: draft.allowModel,
    placeholderCtx: ctx,
  };
}
