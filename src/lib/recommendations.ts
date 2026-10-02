/**
 * Explainable, rule-based recommendations for Moj katalog (and the chat API).
 * Pure, deterministic and isomorphic: depends only on the static catalog data and its
 * arguments; never reads or mutates the client store.
 *
 * Internal weights (NOT product-quality scores):
 *   same chosen line/brand as a saved product   +3
 *   checked recipe pairing with a saved product +2
 *   related (or same) category                  +2
 *   same leaflet theme / same leaflet page      +1
 * Each signal kind counts once per candidate. Saved products and excludeIds are skipped,
 * zero-score items are dropped, at most two results share a primary category (filled
 * otherwise), ties break by editorialRank then id, max 6 by default.
 */
import { getPlacementsForProduct, getPrimaryOffer, getProduct, productForOffer, products, recipeLines, recipes } from "./catalog";
import type { Product, Recipe } from "./types";

export type SignalKind = "line" | "brand" | "recipe" | "category" | "theme" | "page";

export type Signal = {
  kind: SignalKind;
  weight: number;
  /** The saved product that triggered this signal. */
  viaProductId: string;
  /** Line/brand name, category slug, recipe id, theme or PDF page number (as string). */
  detail: string;
};

export type Recommendation = {
  productId: string;
  offerId: string;
  /** Internal ranking weight; never show as a rating. */
  score: number;
  signals: Signal[];
  /** Short Slovenian visible reason derived from the strongest real signal. */
  reason: string;
  /** True for non-personalised editorial picks (nothing saved / filler). */
  editorial: boolean;
};

export const RECOMMENDATION_WEIGHTS = { line: 3, brand: 3, recipe: 2, category: 2, theme: 1, page: 1 } as const;
export const DEFAULT_RECOMMENDATION_LIMIT = 6;
export const MAX_PER_PRIMARY_CATEGORY = 2;
export const EDITORIAL_REASON = "Iz izbora demo kataloga";

/** Symmetric groups of related category slugs. A category is always related to itself. */
const RELATED_GROUPS: string[][] = [
  ["mlecni-izdelki", "zajtrk", "pekovsko", "kruh", "sir", "jogurti", "namazi", "zita", "kava", "caj"],
  ["meso", "mesni-izdelki", "vecerja", "kosilo", "prilogi", "zelenjava", "zamrznjeno", "ribe", "testenine", "omake"],
  ["mesni-izdelki", "zajtrk", "malica", "sir", "kruh", "pekovsko"],
  ["sadje", "zelenjava", "zajtrk"],
  ["sladko", "sladkarije", "prigrizki", "grickalke", "pijace"],
  ["pijace", "sokovi", "voda", "kava", "caj"],
  ["cistila", "gospodinjstvo", "higiena", "nega"],
];

const RELATED = new Map<string, Set<string>>();
for (const group of RELATED_GROUPS) {
  for (const a of group) {
    const set = RELATED.get(a) ?? new Set<string>([a]);
    for (const b of group) set.add(b);
    RELATED.set(a, set);
  }
}

export function areCategoriesRelated(a: string, b: string): boolean {
  return a === b || (RELATED.get(a)?.has(b) ?? false);
}

const CATEGORY_LABELS: Record<string, string> = {
  "mlecni-izdelki": "mlečni izdelki",
  "mesni-izdelki": "mesni izdelki",
  meso: "meso",
  zajtrk: "zajtrk",
  vecerja: "večerja",
  kosilo: "kosilo",
  malica: "malica",
  prilogi: "priloge",
  priloge: "priloge",
  zamrznjeno: "zamrznjeno",
  zelenjava: "zelenjava",
  sadje: "sadje",
  pekovsko: "pekovsko pecivo",
  kruh: "kruh",
  sir: "sir",
  jogurti: "jogurti",
  ribe: "ribe",
  testenine: "testenine",
  omake: "omake",
  pijace: "pijače",
  sokovi: "sokovi",
  voda: "voda",
  kava: "kava",
  caj: "čaj",
  sladko: "sladko",
  sladkarije: "sladkarije",
  prigrizki: "prigrizki",
  grickalke: "grickalke",
  namazi: "namazi",
  zita: "žita",
  cistila: "čistila",
  gospodinjstvo: "gospodinjstvo",
  higiena: "higiena",
  nega: "nega",
};

/** Human Slovenian label for a category slug (fallback: slug with spaces). */
export function categoryLabel(slug: string): string {
  return CATEGORY_LABELS[slug] ?? slug.replace(/-/g, " ");
}

/** Meal-type categories read better as "Tudi za zajtrk" than "Sorodno: zajtrk". */
const MEAL_PHRASE: Record<string, string> = {
  zajtrk: "Tudi za zajtrk",
  vecerja: "Tudi za večerjo",
  kosilo: "Tudi za kosilo",
  malica: "Tudi za malico",
};

// ---------------------------------------------------------------- static indexes

/** Checked recipes only: every ingredient offer exists and is priced per pack. */
const checkedRecipes: { recipe: Recipe; productIds: Set<string> }[] = recipes
  .filter((r) => recipeLines(r) !== null)
  .map((r) => ({
    recipe: r,
    productIds: new Set(r.ingredients.map((i) => productForOffer(i.offerId)?.id).filter((id): id is string => !!id)),
  }));

function pagesOf(productId: string): Set<number> {
  return new Set(getPlacementsForProduct(productId).map((p) => p.pdfPageNumber));
}

function compareEditorial(a: Product, b: Product): number {
  return a.editorialRank - b.editorialRank || a.id.localeCompare(b.id);
}

// ---------------------------------------------------------------- signals

function collectSignals(candidate: Product, saved: Product[]): Signal[] {
  const out: Signal[] = [];
  const add = (s: Signal) => {
    // One signal per kind (line and brand share the +3 slot).
    const slot = (k: SignalKind) => (k === "brand" ? "line" : k === "page" ? "theme" : k);
    if (!out.some((o) => slot(o.kind) === slot(s.kind))) out.push(s);
  };

  // +3 same line, else same brand
  for (const s of saved) {
    if (candidate.line && s.line === candidate.line) {
      add({ kind: "line", weight: RECOMMENDATION_WEIGHTS.line, viaProductId: s.id, detail: candidate.line });
      break;
    }
  }
  for (const s of saved) {
    if (candidate.brand && s.brand === candidate.brand) {
      add({ kind: "brand", weight: RECOMMENDATION_WEIGHTS.brand, viaProductId: s.id, detail: candidate.brand });
      break;
    }
  }

  // +2 checked recipe pairing
  outer: for (const { recipe, productIds } of checkedRecipes) {
    if (!productIds.has(candidate.id)) continue;
    for (const s of saved) {
      if (productIds.has(s.id)) {
        add({ kind: "recipe", weight: RECOMMENDATION_WEIGHTS.recipe, viaProductId: s.id, detail: recipe.id });
        break outer;
      }
    }
  }

  // +2 related category: prefer an exact shared category, then a related one; candidate's own order first.
  let catSignal: Signal | null = null;
  for (const c of candidate.categories) {
    const s = saved.find((sp) => sp.categories.includes(c));
    if (s) {
      catSignal = { kind: "category", weight: RECOMMENDATION_WEIGHTS.category, viaProductId: s.id, detail: c };
      break;
    }
  }
  if (!catSignal) {
    for (const c of candidate.categories) {
      const s = saved.find((sp) => sp.categories.some((sc) => areCategoriesRelated(sc, c)));
      if (s) {
        catSignal = { kind: "category", weight: RECOMMENDATION_WEIGHTS.category, viaProductId: s.id, detail: c };
        break;
      }
    }
  }
  if (catSignal) add(catSignal);

  // +1 same leaflet page (more concrete), else same leaflet theme
  const candPages = pagesOf(candidate.id);
  let pageSignal: Signal | null = null;
  for (const s of saved) {
    for (const pg of pagesOf(s.id)) {
      if (candPages.has(pg)) {
        pageSignal = { kind: "page", weight: RECOMMENDATION_WEIGHTS.page, viaProductId: s.id, detail: String(pg) };
        break;
      }
    }
    if (pageSignal) break;
  }
  if (pageSignal) add(pageSignal);
  else if (candidate.theme) {
    const s = saved.find((sp) => sp.theme === candidate.theme);
    if (s) add({ kind: "theme", weight: RECOMMENDATION_WEIGHTS.theme, viaProductId: s.id, detail: candidate.theme });
  }

  return out;
}

const REASON_PRIORITY: SignalKind[] = ["line", "brand", "recipe", "category", "page", "theme"];

function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLocaleLowerCase("sl") + s.slice(1) : s;
}

/** Visible Slovenian text for a single signal. */
export function signalReason(signal: Signal): string {
  switch (signal.kind) {
    case "line":
      return `Tudi iz linije ${signal.detail}`;
    case "brand":
      return `Tudi znamke ${signal.detail}`;
    case "recipe": {
      const r = recipes.find((x) => x.id === signal.detail);
      if (r) return `Za recept: ${lowerFirst(r.title)}`;
      const via = getProduct(signal.viaProductId);
      return via ? `Gre skupaj z izdelkom ${via.name.toLocaleLowerCase("sl")}` : "Za preverjen recept";
    }
    case "category":
      return MEAL_PHRASE[signal.detail] ?? `Sorodno: ${categoryLabel(signal.detail)}`;
    case "page":
      return "Z iste strani letaka";
    case "theme":
      return `Iz istega sklopa letaka: ${signal.detail}`;
  }
}

/** Visible reasons for all signals, strongest first. */
export function explainSignals(signals: Signal[]): string[] {
  return [...signals].sort((a, b) => REASON_PRIORITY.indexOf(a.kind) - REASON_PRIORITY.indexOf(b.kind)).map(signalReason);
}

// ---------------------------------------------------------------- ranking

type Scored = { product: Product; offerId: string; score: number; signals: Signal[] };

/** Keep at most `maxPer` items per primary category; fill remaining slots in order if short. */
function diversify<T extends { product: Product }>(items: T[], limit: number, maxPer = MAX_PER_PRIMARY_CATEGORY): T[] {
  const picked: T[] = [];
  const overflow: T[] = [];
  const perCat = new Map<string, number>();
  for (const it of items) {
    if (picked.length >= limit) break;
    const cat = it.product.categories[0] ?? "";
    const n = perCat.get(cat) ?? 0;
    if (n < maxPer) {
      picked.push(it);
      perCat.set(cat, n + 1);
    } else overflow.push(it);
  }
  for (const it of overflow) {
    if (picked.length >= limit) break;
    picked.push(it);
  }
  return picked;
}

export type RecommendationOptions = {
  /** Max results (default 6). */
  limit?: number;
  /** Additional product IDs never to recommend. */
  excludeIds?: string[];
  /** When personalised results are fewer than `limit`, top up with editorial picks (flagged editorial:true). */
  fillEditorial?: boolean;
};

/** Editorial picks (lowest editorialRank, diversified). Never personalised. */
export function getEditorialPicks(opts: { limit?: number; excludeIds?: string[] } = {}): Recommendation[] {
  const limit = Math.max(0, opts.limit ?? DEFAULT_RECOMMENDATION_LIMIT);
  const exclude = new Set(opts.excludeIds ?? []);
  const pool = [...products]
    .sort(compareEditorial)
    .filter((p) => !exclude.has(p.id))
    .map((product) => ({ product, offerId: getPrimaryOffer(product.id)?.id }))
    .filter((x): x is { product: Product; offerId: string } => !!x.offerId);
  return diversify(pool, limit).map(({ product, offerId }) => ({
    productId: product.id,
    offerId,
    score: 0,
    signals: [],
    reason: EDITORIAL_REASON,
    editorial: true,
  }));
}

export function getRecommendations(savedProductIds: string[], opts: RecommendationOptions = {}): Recommendation[] {
  const limit = Math.max(0, opts.limit ?? DEFAULT_RECOMMENDATION_LIMIT);
  const savedIds = new Set(savedProductIds);
  const exclude = new Set([...savedProductIds, ...(opts.excludeIds ?? [])]);
  // Sorted editorially so results do not depend on the order of savedProductIds.
  const saved = [...savedIds].map((id) => getProduct(id)).filter((p): p is Product => !!p).sort(compareEditorial);

  if (saved.length === 0) return getEditorialPicks({ limit, excludeIds: [...exclude] });

  const scored: Scored[] = [];
  for (const product of products) {
    if (exclude.has(product.id)) continue;
    const offer = getPrimaryOffer(product.id);
    if (!offer) continue;
    const signals = collectSignals(product, saved);
    const score = signals.reduce((s, x) => s + x.weight, 0);
    if (score <= 0) continue;
    scored.push({ product, offerId: offer.id, score, signals });
  }
  scored.sort((a, b) => b.score - a.score || compareEditorial(a.product, b.product));

  const result: Recommendation[] = diversify(scored, limit).map(({ product, offerId, score, signals }) => ({
    productId: product.id,
    offerId,
    score,
    signals: [...signals].sort((a, b) => REASON_PRIORITY.indexOf(a.kind) - REASON_PRIORITY.indexOf(b.kind)),
    reason: explainSignals(signals)[0],
    editorial: false,
  }));

  if (opts.fillEditorial && result.length < limit) {
    const taken = new Set([...exclude, ...result.map((r) => r.productId)]);
    result.push(...getEditorialPicks({ limit: limit - result.length, excludeIds: [...taken] }));
  }
  return result;
}
