/**
 * Structured + fuzzy keyword retrieval over the verified demo catalog (no vector DB).
 * Scoring per query token: exact stem (alias/name) > token prefix > small edit distance (typos).
 * Whole alias phrases found in the query get a strong bonus.
 */
import { getPrimaryOffer, products as allProducts } from "@/lib/catalog";
import type { Offer, Product, SpPlusSetting } from "@/lib/types";
import { containsPhrase, contentTokens, editDistance, fold, stem } from "./normalize";

export type SearchFilters = {
  /** Folded line/brand key, e.g. "sbudget". */
  line?: string;
  category?: string;
  maxPriceCents?: number;
  /** "with" = only card prices, "without" = exclude offers that require SPAR plus / coupon. */
  card?: "with" | "without";
};

export type SearchHit = { product: Product; offer: Offer; score: number; matched: string[] };

type Field = { stems: string[]; weight: number };
type Indexed = { product: Product; offer: Offer; phrases: string[]; fields: Field[]; lineKey: string | null; brandKey: string | null };

/** Words that only describe a filter, never a product. */
export const FILTER_WORDS = new Set([
  "sbudget",
  "kartico",
  "kartica",
  "kartice",
  "spar",
  "plus",
  "brez",
  "pod",
  "manj",
  "kot",
  "najvec",
  "max",
  "eur",
  "evrov",
  "evra",
  "evre",
  "cenejsa",
  "cenejse",
  "cenejso",
  "cenejsi",
  "ceneje",
  "najcenejsa",
  "najcenejse",
  "najcenejsi",
  "najcenejso",
  "poceni",
  "bolj",
  "moznost",
  "moznosti",
]);

const indexCache = new WeakMap<readonly Product[], Indexed[]>();

function splitStems(text: string | null | undefined): string[] {
  if (!text) return [];
  return contentTokens(text).filter((t) => !/^\d/.test(t)).map(stem);
}

function buildIndex(list: readonly Product[]): Indexed[] {
  const cached = indexCache.get(list);
  if (cached) return cached;
  const out: Indexed[] = [];
  for (const p of list) {
    const offer = getPrimaryOffer(p.id);
    if (!offer) continue;
    const aliasFolded = p.aliases.map(fold).filter(Boolean);
    const phrases = Array.from(new Set([fold(p.name), ...aliasFolded].filter((x) => x.length >= 3)));
    out.push({
      product: p,
      offer,
      phrases,
      lineKey: p.line ? fold(p.line).replace(/\s+/g, "") : null,
      brandKey: p.brand ? fold(p.brand).replace(/\s+/g, "") : null,
      fields: [
        { stems: [...splitStems(p.name), ...aliasFolded.flatMap((a) => splitStems(a))], weight: 3 },
        { stems: [...splitStems(p.brand), ...splitStems(p.line)], weight: 1.5 },
        { stems: splitStems(p.descriptor), weight: 1 },
        { stems: p.categories.flatMap((c) => c.split("-")).map(stem), weight: 1 },
      ],
    });
  }
  indexCache.set(list, out);
  return out;
}

function tokenScore(q: string, field: Field): number {
  let best = 0;
  for (const s of field.stems) {
    if (!s) continue;
    if (s === q) return field.weight;
    // Prefix: the user typed the start of a word ("jog" → jogurt), or the query carries a short leftover
    // inflection (≤ 2 chars) beyond the indexed stem. "kaviar" must NOT match the stem "kav" (kava).
    if (q.length >= 3 && s.length >= 3 && (s.startsWith(q) || (q.startsWith(s) && q.length - s.length <= 2))) {
      best = Math.max(best, field.weight * 0.7);
      continue;
    }
    const maxDist = q.length >= 7 ? 2 : q.length >= 3 ? 1 : 0;
    if (maxDist && editDistance(q, s, maxDist) <= maxDist) best = Math.max(best, field.weight * 0.45);
  }
  return best;
}

/** Folded line keys present in a query, e.g. "sbudget". */
export function detectLine(query: string, list: readonly Product[] = allProducts): string | undefined {
  const f = fold(query);
  const keys = new Set(buildIndex(list).flatMap((i) => [i.lineKey, i.brandKey]).filter((k): k is string => !!k));
  for (const k of keys) if (containsPhrase(f, k)) return k;
  return undefined;
}

export function detectFilters(query: string, list: readonly Product[] = allProducts): SearchFilters {
  const f = fold(query);
  const filters: SearchFilters = {};
  const line = detectLine(query, list);
  if (line) filters.line = line;
  const m = f.match(/\b(?:do|pod|manj kot|najvec|max)\s+(\d+(?:,\d{1,2})?)\s*(?:eur|evr\w*)?\b/);
  if (m && /\b(?:eur|evr)/.test(f)) filters.maxPriceCents = Math.round(parseFloat(m[1].replace(",", ".")) * 100);
  if (/\bbrez (?:spar )?(?:plus )?kartic/.test(f)) filters.card = "without";
  else if (/\bs (?:spar )?(?:plus )?kartic/.test(f)) filters.card = "with";
  return filters;
}

export function passesFilters(product: Product, offer: Offer, filters: SearchFilters): boolean {
  if (filters.line) {
    const l = product.line ? fold(product.line).replace(/\s+/g, "") : null;
    const b = product.brand ? fold(product.brand).replace(/\s+/g, "") : null;
    if (l !== filters.line && b !== filters.line) return false;
  }
  if (filters.category && !product.categories.includes(filters.category)) return false;
  if (filters.maxPriceCents != null && offer.priceCents > filters.maxPriceCents) return false;
  const conditional = offer.conditions.spPlusRequired || offer.conditions.couponRequired;
  if (filters.card === "without" && conditional) return false;
  if (filters.card === "with" && !offer.conditions.spPlusRequired) return false;
  return true;
}

export const MIN_SCORE = 1.3;

/**
 * Ranked candidates for a free-text query. `extraStop` removes intent verbs ("dodaj", "kje").
 * Returns hits with score >= minScore (default MIN_SCORE), best first, deterministic tie-break.
 */
export function searchProducts(
  query: string,
  opts: { filters?: SearchFilters; extraStop?: Set<string>; minScore?: number; limit?: number; list?: readonly Product[] } = {},
): SearchHit[] {
  const list = opts.list ?? allProducts;
  const filters = opts.filters ?? {};
  const f = fold(query);
  const qTokens = contentTokens(query, opts.extraStop)
    .filter((t) => !FILTER_WORDS.has(t) && !/^\d/.test(t))
    .map(stem);
  const hits: SearchHit[] = [];
  for (const item of buildIndex(list)) {
    if (!passesFilters(item.product, item.offer, filters)) continue;
    let score = 0;
    const matched: string[] = [];
    for (const ph of item.phrases) {
      if (ph.includes(" ") && containsPhrase(f, ph)) {
        score += 2.5;
        matched.push(ph);
      }
    }
    for (const q of qTokens) {
      let best = 0;
      for (const field of item.fields) best = Math.max(best, tokenScore(q, field));
      if (best > 0) matched.push(q);
      score += best;
    }
    // Penalize query tokens that matched nothing (keeps "skuta kaviar" from looking like a strong skuta match is fine; mild).
    if (score > 0) hits.push({ product: item.product, offer: item.offer, score: Math.round(score * 100) / 100, matched });
  }
  const min = opts.minScore ?? MIN_SCORE;
  return hits
    .filter((h) => h.score >= min)
    .sort((a, b) => b.score - a.score || a.product.editorialRank - b.product.editorialRank || a.product.id.localeCompare(b.product.id))
    .slice(0, opts.limit ?? 8);
}

/** Number of content tokens left in the query after stop/filter words (used to tell "unknown product" from chit-chat). */
export function queryContentTokens(query: string, extraStop?: Set<string>): string[] {
  return contentTokens(query, extraStop).filter((t) => !FILTER_WORDS.has(t) && !/^\d/.test(t));
}

/** Products of a line, by editorial rank. */
export function productsInLine(lineKey: string, filters: SearchFilters = {}, list: readonly Product[] = allProducts): SearchHit[] {
  return buildIndex(list)
    .filter((i) => passesFilters(i.product, i.offer, { ...filters, line: lineKey }))
    .map((i) => ({ product: i.product, offer: i.offer, score: 0, matched: [] }));
}

/** Price comparable across pack sizes: cents per kg / l / piece when known, else pack price. */
export function comparablePrice(product: Product, offer: Offer, cents: number = offer.priceCents): { value: number; basis: "unit" | "pack"; unit: string } {
  if (offer.priceUnit === "kg") return { value: cents, basis: "unit", unit: "kg" };
  if (offer.priceUnit === "100g") return { value: cents * 10, basis: "unit", unit: "kg" };
  const q = product.quantity;
  if (offer.priceUnit === "pack" && q) {
    if (q.unit === "g") return { value: (cents * 1000) / q.amount, basis: "unit", unit: "kg" };
    if (q.unit === "kg") return { value: cents / q.amount, basis: "unit", unit: "kg" };
    if (q.unit === "ml") return { value: (cents * 1000) / q.amount, basis: "unit", unit: "l" };
    if (q.unit === "l") return { value: cents / q.amount, basis: "unit", unit: "l" };
    if (q.unit === "kos") return { value: cents / q.amount, basis: "unit", unit: "kos" };
  }
  return { value: cents, basis: "pack", unit: "pack" };
}

/**
 * Cheaper comparable alternatives for a product: shares the primary category
 * and has a lower comparable price on the same basis/unit.
 */
export function cheaperAlternatives(productId: string, opts: { limit?: number; list?: readonly Product[]; filters?: SearchFilters; spPlus?: SpPlusSetting } = {}): SearchHit[] {
  const index = buildIndex(opts.list ?? allProducts);
  const base = index.find((i) => i.product.id === productId);
  if (!base) return [];
  const bpCents = priceForUser(base.offer, opts.spPlus);
  if (bpCents == null) return [];
  const bp = comparablePrice(base.product, base.offer, bpCents);
  const primary = base.product.categories[0];
  const out: { hit: SearchHit; rank: number; price: number }[] = [];
  for (const i of index) {
    if (i.product.id === productId) continue;
    if (opts.filters && !passesFilters(i.product, i.offer, opts.filters)) continue;
    // Only the same primary category is "comparable" (secondary tags like "zajtrk" are too broad).
    const samePrimary = i.product.categories[0] === primary;
    if (!samePrimary) continue;
    const cents = priceForUser(i.offer, opts.spPlus);
    if (cents == null) continue;
    const cp = comparablePrice(i.product, i.offer, cents);
    if (cp.basis !== bp.basis || cp.unit !== bp.unit) continue;
    if (cp.value >= bp.value) continue;
    out.push({ hit: { product: i.product, offer: i.offer, score: samePrimary ? 2 : 1, matched: [] }, rank: samePrimary ? 0 : 1, price: cp.value });
  }
  return out
    .sort((a, b) => a.rank - b.rank || a.price - b.price || a.hit.product.editorialRank - b.hit.product.editorialRank)
    .slice(0, opts.limit ?? 3)
    .map((x) => x.hit);
}

/** Price that applies to the user: without a SPAR plus card, card-only offers fall back to the verified regular price (or unknown). */
export function priceForUser(offer: Offer, spPlus?: SpPlusSetting): number | null {
  const conditional = offer.conditions.spPlusRequired || offer.conditions.couponRequired;
  if (spPlus === "no" && conditional) return offer.regularPriceCents;
  return offer.priceCents;
}
