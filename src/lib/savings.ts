/**
 * Totals for Moj katalog. Pure, integer cents, deterministic.
 *
 * Rules:
 *  - one saved product = one purchasable unit at exactly the price shown on its card (offer.priceCents):
 *    a package for pack / kos, 1 kg at the €/kg price, 100 g at the shown price. Weights are never inferred;
 *  - offers that are not current (promoCalendar: expired, historical or not yet valid) are excluded from both sums;
 *    the saved items stay in the list and `excludedCount()` tells how many were left out;
 *  - SPAR plus prices are the shown card price, so they are used as is;
 *  - savings = max(0, regular - price) only for a verified numeric regular price, otherwise 0 (never invented).
 */
import { getPrimaryOffer } from "./catalog";
import { isOfferCurrent } from "./promoCalendar";

export type CollectionTotals = {
  /** Sum of the shown prices (cents) of all saved products with a current offer. */
  totalCents: number;
  /** Sum of savings (cents), always >= 0. */
  savingsCents: number;
  /** Distinct saved product ids given. */
  itemCount: number;
  /** Items included in totalCents. */
  pricedCount: number;
};

export function collectionTotals(productIds: string[], now: Date = new Date()): CollectionTotals {
  const ids = [...new Set(productIds)];
  const t: CollectionTotals = { totalCents: 0, savingsCents: 0, itemCount: ids.length, pricedCount: 0 };
  for (const id of ids) {
    const o = getPrimaryOffer(id);
    if (!o || !isOfferCurrent(o, now)) continue;
    t.totalCents += o.priceCents;
    t.pricedCount++;
    if (typeof o.regularPriceCents === "number" && Number.isFinite(o.regularPriceCents)) {
      t.savingsCents += Math.max(0, o.regularPriceCents - o.priceCents);
    }
  }
  return t;
}

/** Number of distinct saved products that are NOT counted in the totals (offer expired, historical or not yet valid). */
export function excludedCount(productIds: string[], now: Date = new Date()): number {
  let n = 0;
  for (const id of new Set(productIds)) {
    const o = getPrimaryOffer(id);
    if (!o || !isOfferCurrent(o, now)) n++;
  }
  return n;
}
