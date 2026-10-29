/**
 * DEMO MOCK - simulated "Naslednji teden" forecast. NOT verified data and NOT from any catalog.
 *
 * Every product with a verified primary offer is simulated to be promoted next week, so the assistant
 * can answer "Kdaj bo X znižan?" for any product. The layer is deliberately separate from the verified
 * catalog and invents nothing numeric:
 *  - a product with a structured promo in src/data/future-promos.json shows that promo's price/percent;
 *  - every other product shows NO future price and NO percent - only the period and its (verified) current price.
 * Replace this module (same exports) with a real feed to go live.
 */
import { activeProducts } from "./activeCatalog";
import { getPrimaryOffer } from "./catalog";
import { futurePromosForProduct } from "./futurePromos";
import { isPromoUpcoming, upcomingWindow } from "./promoCalendar";
import type { FuturePromo } from "./types";

/** Discreet label printed on every simulated future offer. */
export const DEMO_FORECAST_LABEL = "Demo napoved";

export type ForecastEntry = {
  productId: string;
  /** The verified current offer (the only source of any price shown for this product). */
  currentOfferId: string;
  /** The simulated promotion period. */
  period: { from: string; to: string };
  /** Structured demo promo (with price/percent) when one exists, else null: then NO future price is shown. */
  promo: FuturePromo | null;
};

/** Forecast of one product, or undefined when it has no verified primary offer. */
export function forecastFor(productId: string, now: Date = new Date()): ForecastEntry | undefined {
  const offer = getPrimaryOffer(productId);
  if (!offer || offer.verification.status !== "verified") return undefined;
  const promo = futurePromosForProduct(productId).find((p) => isPromoUpcoming(p, now)) ?? null;
  return { productId, currentOfferId: offer.id, period: promo ? { from: promo.validFrom, to: promo.validTo } : upcomingWindow(), promo };
}

/** Forecast of every verified product (editorial order). */
export function allForecasts(now: Date = new Date()): ForecastEntry[] {
  return activeProducts(now).map((p) => forecastFor(p.id, now)).filter((x): x is ForecastEntry => !!x);
}
