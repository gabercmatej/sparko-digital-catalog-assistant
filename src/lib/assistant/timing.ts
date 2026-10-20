/**
 * "Kdaj je … znižano?" / "Kaj bo znižano naslednji teden?" — pure helpers that combine the verified
 * current discounts ("Znižano ta teden") with the upcoming demo promos ("Znižano naslednji teden").
 * The current price always comes from the product's verified offer; the future price from the
 * mock promo (src/data/future-promos.json). Nothing here invents a date or a price.
 */
import { getPrimaryOffer } from "@/lib/catalog";
import { futurePromos, upcomingItem, type UpcomingItem } from "@/lib/futurePromos";
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
    "teden tedna tednu tedne tednih tedni ceneje cenejsi cenejsa cenejse"
  ).split(" "),
);

/** Current verified percentage discounts of the given products (primary offers), best first. */
export function currentDiscountsOf(productIds: readonly string[]): RankedDiscount[] {
  const offers = productIds.map((id) => getPrimaryOffer(id)).filter((o): o is NonNullable<typeof o> => !!o);
  return rankDiscounts({ offers, limit: offers.length });
}

/** Upcoming promos (optionally only of the given products): discount desc, then editorial rank. */
export function rankUpcoming(opts: { productIds?: readonly string[]; limit?: number } = {}): UpcomingItem[] {
  const only = opts.productIds ? new Set(opts.productIds) : null;
  return futurePromos
    .filter((p) => !only || only.has(p.productId))
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

/** Accusative object phrase for the intro: a single product by name, a shared brand, or a generic phrase. */
export function timingSubject(products: Product[]): string {
  if (products.length === 1) return `»{{name:${products[0].id}}}«`;
  const brands = new Set(products.map((p) => p.brand));
  const [brand] = [...brands];
  if (brands.size === 1 && brand) return `izdelke znamke ${safe(brand)}`;
  return "te izdelke";
}

/** Earliest upcoming start date, as the promo id whose `{{futureFrom}}` to print. */
function earliestPromoId(upcoming: UpcomingItem[]): string {
  return [...upcoming].sort((a, b) => a.promo.validFrom.localeCompare(b.promo.validFrom) || a.promo.id.localeCompare(b.promo.id))[0].promo.id;
}

/**
 * Template (placeholders) for a timing answer. `subject` is null for the general
 * "Kaj bo znižano naslednji teden?" question.
 */
export function timingTemplate(opts: { subject: string | null; current: RankedDiscount[]; upcoming: UpcomingItem[] }): string {
  const { subject, current, upcoming } = opts;
  if (subject == null) {
    return upcoming.length
      ? "Naslednji teden ({{futurePeriod}}) so napovedane akcije za spodnje izdelke. Ob njih vidiš tudi trenutno ceno."
      : "Za naslednji teden v demo podatkih nimam napovedanih akcij.";
  }
  if (current.length && upcoming.length) {
    return `Za ${subject} sem našel akcije ta teden in naslednji teden (od {{futureFrom:${earliestPromoId(upcoming)}}}). Spodaj so izdelki in datumi akcij.`;
  }
  if (current.length) return `Za ${subject} sem našel akcijo samo ta teden; za naslednji teden v demo podatkih ni napovedane akcije.`;
  if (upcoming.length) {
    return `Za ${subject} ta teden ni znižanja (napovedana akcija velja od {{futureFrom:${earliestPromoId(upcoming)}}}). Spodaj sta trenutna in napovedana cena.`;
  }
  return `Za ${subject} ta teden ni znižanja in za naslednji teden ni napovedane akcije.`;
}

