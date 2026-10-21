/**
 * Totals for Moj katalog. Pure, integer cents, deterministic.
 *
 * Rules:
 *  - one saved product = one package, priced from its primary offer;
 *  - offers that are not current (promoCalendar) are excluded from both sums; future promos never count;
 *  - per-kg / per-100g offers cannot be priced as a package: excluded from the total, counted in excludedPerKg;
 *  - SPAR plus prices are used as the current price (same as the cards) and counted in spPlusCount;
 *  - savings = max(0, regular - price) only for a verified numeric regular price; otherwise 0 and "unknown".
 */
import { getPrimaryOffer } from "./catalog";
import { isOfferCurrent } from "./promoCalendar";

export type CollectionTotals = {
  /** Sum of package prices (cents) of priced items. */
  totalCents: number;
  /** Sum of savings (cents) over items with a verified regular price. */
  savingsCents: number;
  /** Distinct saved product ids given. */
  itemCount: number;
  /** Items included in totalCents. */
  pricedCount: number;
  /** Current per-kg / per-100g items left out of the total. */
  excludedPerKg: number;
  /** Priced items with a verified regular price. */
  savingsKnownCount: number;
  /** Priced items without a verified regular price (contribute 0 savings). */
  savingsUnknownCount: number;
  /** Priced items whose price requires the SPAR plus card. */
  spPlusCount: number;
};

export function collectionTotals(productIds: string[], now: Date = new Date()): CollectionTotals {
  const ids = [...new Set(productIds)];
  const t: CollectionTotals = { totalCents: 0, savingsCents: 0, itemCount: ids.length, pricedCount: 0, excludedPerKg: 0, savingsKnownCount: 0, savingsUnknownCount: 0, spPlusCount: 0 };
  for (const id of ids) {
    const o = getPrimaryOffer(id);
    if (!o || !isOfferCurrent(o, now)) continue;
    if (o.priceUnit === "kg" || o.priceUnit === "100g") {
      t.excludedPerKg++;
      continue;
    }
    t.totalCents += o.priceCents;
    t.pricedCount++;
    if (o.conditions.spPlusRequired || o.priceKind === "loyalty_price") t.spPlusCount++;
    if (typeof o.regularPriceCents === "number" && Number.isFinite(o.regularPriceCents)) {
      t.savingsKnownCount++;
      t.savingsCents += Math.max(0, o.regularPriceCents - o.priceCents);
    } else t.savingsUnknownCount++;
  }
  return t;
}
