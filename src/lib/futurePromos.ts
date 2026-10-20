/**
 * Upcoming promotions ("Znižano naslednji teden"). DEMO MOCK: src/data/future-promos.json is
 * deterministic demo data until a real future-promo feed exists; swap the JSON (same shape) to go live.
 * The CURRENT price of a product always comes from its verified catalog offer, never from here.
 */
import raw from "@/data/future-promos.json";
import { getPrimaryOffer, getProduct } from "./catalog";
import type { FuturePromo, FuturePromoData, Offer, Product } from "./types";

export const futurePromoData = raw as unknown as FuturePromoData;
/** Only promos whose product and current offer exist (defensive against stale mock rows). */
export const futurePromos: FuturePromo[] = futurePromoData.promos.filter((p) => !!getProduct(p.productId) && !!getPrimaryOffer(p.productId));
/** The upcoming demo period, e.g. { from: "2026-10-14", to: "2026-10-20" }. */
export const upcomingPeriod = futurePromoData.period;

const byId = new Map(futurePromos.map((p) => [p.id, p]));

export function getFuturePromo(id: string): FuturePromo | undefined {
  return byId.get(id);
}
export function futurePromosForProduct(productId: string): FuturePromo[] {
  return futurePromos.filter((p) => p.productId === productId);
}

export type UpcomingItem = { promo: FuturePromo; product: Product; currentOffer: Offer };

/** Promo + its product + the product's verified current offer (for the red "now" price). */
export function upcomingItem(promoId: string): UpcomingItem | undefined {
  const promo = getFuturePromo(promoId);
  const product = promo && getProduct(promo.productId);
  const currentOffer = promo && getPrimaryOffer(promo.productId);
  return promo && product && currentOffer ? { promo, product, currentOffer } : undefined;
}
