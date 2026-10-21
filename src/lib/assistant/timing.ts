/**
 * "Kdaj je … znižano?" / "Kaj bo znižano naslednji teden?" — pure helpers that combine the verified
 * current discounts ("Znižano ta teden") with the upcoming demo promos ("Znižano naslednji teden").
 * The current price always comes from the product's verified offer; the future price from the
 * mock promo (src/data/future-promos.json). Nothing here invents a date or a price.
 */
import { getPrimaryOffer } from "@/lib/catalog";
import { forecastFor } from "@/lib/demoForecast";
import { futurePromos, upcomingItem, type UpcomingItem } from "@/lib/futurePromos";
import { isPromoUpcoming } from "@/lib/promoCalendar";
import type { Product } from "@/lib/types";
import { rankDiscounts, type RankedDiscount } from "./discounts";

/** Upper bound for promo rows in one answer. */
export const MAX_UPCOMING = 10;

/** Words of a timing question that do not name a product ("Kdaj bo skuta znižana naslednji teden?"). */
export const TIMING_STOP = new Set(
  (
    "bodo bomo bila bil bilo " +
    "znizan znizana znizano znizani znizane znizanega znizanih znizanje znizanja znizanju znizanj " +
    "akcija akcije akciji akcijo akcij akcijah popust popusta popusti popusto " +
    "naslednji naslednja naslednje naslednjem naslednjo naslednjega " +
    "prihodnji prihodnja prihodnje prihodnjem prihodnjo prihodnjega " +
    "teden tedna tednu tedne tednih tedni ceneje cenejsi cenejsa cenejse " +
    "najbolj kmalu pocakati pocakam pocaka splaca splacal zdaj"
  ).split(" "),
);

/** Current verified percentage discounts of the given products (primary offers), best first. */
export function currentDiscountsOf(productIds: readonly string[]): RankedDiscount[] {
  const offers = productIds.map((id) => getPrimaryOffer(id)).filter((o): o is NonNullable<typeof o> => !!o);
  return rankDiscounts({ offers, limit: offers.length });
}

/** Upcoming promos (optionally only of the given products): discount desc, then editorial rank. */
export function rankUpcoming(opts: { productIds?: readonly string[]; limit?: number; now?: Date } = {}): UpcomingItem[] {
  const only = opts.productIds ? new Set(opts.productIds) : null;
  return futurePromos
    .filter((p) => isPromoUpcoming(p, opts.now) && (!only || only.has(p.productId)))
    .map((p) => upcomingItem(p.id))
    .filter((x): x is UpcomingItem => !!x)
    .sort(
      (a, b) =>
        (b.promo.discountPercent ?? 0) - (a.promo.discountPercent ?? 0) ||
        a.product.editorialRank - b.product.editorialRank ||
        a.promo.id.localeCompare(b.promo.id),
    )
    .slice(0, opts.limit ?? MAX_UPCOMING);
}

function safe(s: string): string {
  return s.replace(/[{}]/g, "");
}

/** Genitive of brands (safe subset); other brands use the "Izdelki znamke X" fallback. */
const BRAND_GENITIVE: Record<string, string> = {
  "Perutnina Ptuj": "Perutnine Ptuj",
  "Pomurske mlekarne": "Pomurskih mlekarn",
  "Ljubljanske mlekarne": "Ljubljanskih mlekarn",
  "Mlekarna Planika": "Mlekarne Planika",
  Podravka: "Podravke",
};

/** Subject of the demo-forecast sentence: one product by name, a shared brand, or a generic phrase. */
function forecastSubject(products: Product[]): { text: string; singular: boolean } {
  if (products.length === 1) return { text: `»{{name:${products[0].id}}}«`, singular: true };
  const brands = new Set(products.map((p) => p.brand));
  const [brand] = [...brands];
  if (brands.size === 1 && brand) {
    const gen = BRAND_GENITIVE[brand];
    return { text: gen ? `Izdelki ${safe(gen)}` : `Izdelki znamke ${safe(brand)}`, singular: false };
  }
  return { text: "Izdelki, ki te zanimajo,", singular: false };
}

/**
 * Template for a product-scoped timing answer based on the DEMO forecast (every verified product is simulated
 * to be promoted next week). Prices and percentages appear only in the blocks, from verified/structured data.
 */
export function forecastTemplate(products: Product[], upcoming: UpcomingItem[] = []): string {
  const { text, singular } = forecastSubject(products);
  return singular
    ? `${text} bo v naši demo napovedi v akciji naslednji teden.${upcoming.length === 1 ? ` Akcija velja od {{futureFrom:${upcoming[0].promo.id}}}.` : ""}`
    : `${text} bodo v naši demo napovedi znižani naslednji teden. Poglej, kateri izdelki so vključeni.`;
}

/** Products (verified) that have a demo forecast but no structured promo, i.e. a period-only forecast row. */
export function forecastOnlyIds(productIds: readonly string[], now?: Date): string[] {
  return productIds.filter((id) => {
    const f = forecastFor(id, now);
    return !!f && !f.promo;
  });
}

/** Template (placeholders) for the general "Kaj bo znižano naslednji teden?" question (structured demo promos only). */
export function generalTimingTemplate(upcoming: UpcomingItem[]): string {
  return upcoming.length
    ? "Naslednji teden ({{futurePeriod}}) so napovedane akcije za spodnje izdelke. Ob njih vidiš tudi trenutno ceno."
    : "Za naslednji teden v demo podatkih nimam napovedanih akcij.";
}
