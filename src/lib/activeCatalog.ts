/**
 * The shopping view of the catalog data: products whose offer is valid on the reference date (promoCalendar),
 * one card per article. Every list the user browses (Home carousel, search, recommendations, meals, budget, the
 * assistant's candidates) starts here, so an expired offer is never presented as a current price. Expired offers
 * stay reachable by id (saved items, old chats, "Poglej v katalogu") and are labelled as expired there.
 */
import { getOffer, getPrimaryOffer, getProduct, products, recipes } from "./catalog";
import { isOfferCurrent, referenceDate } from "./promoCalendar";
import type { Product, Recipe } from "./types";

const cache = new Map<string, readonly Product[]>();

/**
 * Products with a current offer, editorial order. When the same article (identityKey) is current in two catalogs
 * (e.g. SPAR 44/26 and MEGA SPAR), one card is kept: the cheaper offer, else the earlier in Home order. Offers with a
 * store restriction (DESPAR Koper, SPAR Online) only win when no unrestricted twin exists.
 */
export function activeProducts(now: Date = new Date()): readonly Product[] {
  const ref = referenceDate(now);
  const hit = cache.get(ref);
  if (hit) return hit;
  const best = new Map<string, Product>();
  for (const p of products) {
    const o = getPrimaryOffer(p.id);
    if (!o || !isOfferCurrent(o, now)) continue;
    const prev = best.get(p.identityKey);
    if (!prev) {
      best.set(p.identityKey, p);
      continue;
    }
    const po = getPrimaryOffer(prev.id)!;
    const rank = (x: typeof o) => (x.availability?.restricted ? 1 : 0);
    if (rank(o) < rank(po) || (rank(o) === rank(po) && o.priceCents < po.priceCents)) best.set(p.identityKey, p);
  }
  const list = products.filter((p) => best.get(p.identityKey) === p);
  cache.set(ref, list);
  return list;
}

/** True when the product's offer is valid on the reference date. */
export function isProductActive(productId: string, now: Date = new Date()): boolean {
  const o = getPrimaryOffer(productId);
  return !!o && isOfferCurrent(o, now);
}

/** Active products of one catalog (editorial order), without cross-catalog deduplication. */
export function activeProductsInCatalog(catalogId: string, now: Date = new Date()): Product[] {
  return products.filter((p) => {
    const o = getPrimaryOffer(p.id);
    return !!o && o.catalogId === catalogId && isOfferCurrent(o, now);
  });
}

/**
 * For a saved item whose offer is no longer current: the current offer of the SAME article (same identityKey), or
 * undefined. Never maps by a similar name.
 */
export function currentEquivalent(productId: string, now: Date = new Date()): Product | undefined {
  const p = getProduct(productId);
  if (!p) return undefined;
  return activeProducts(now).find((x) => x.id !== p.id && x.identityKey === p.identityKey);
}

/** Recipes whose every ingredient offer is current (a recipe is only suggested when it can be shopped now). */
export function activeRecipes(now: Date = new Date()): Recipe[] {
  return recipes.filter((r) => r.ingredients.every((i) => {
    const o = getOffer(i.offerId);
    return !!o && isOfferCurrent(o, now);
  }));
}
