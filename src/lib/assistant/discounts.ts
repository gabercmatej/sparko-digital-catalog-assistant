/**
 * "Kaj je najbolj znižano?" — ranks offers with a verified, printed percentage discount within the
 * demo catalog's verified selection. Coupon offers and multi-buy ("2+1") deals are not mixed into the
 * percentage ranking. Products without a printed percentage (e.g. S-BUDGET everyday prices) are not
 * "discounted". Never claims anything about the current store or today's date.
 */
import { getProduct, offers as allOffers } from "@/lib/catalog";
import { isOfferCurrent } from "@/lib/promoCalendar";
import type { Offer, Product, SpPlusSetting } from "@/lib/types";

export type RankedDiscount = { offer: Offer; product: Product };

const MULTIBUY_RE = /\d\s*\+\s*\d|\bgratis\b|\bvsak (drugi|tretji)\b|\bob nakupu \d+ kos/i;

export function isPercentDiscount(o: Offer): boolean {
  return (
    o.discountPercent != null &&
    o.discountPercent > 0 &&
    o.verification.status === "verified" &&
    o.priceKind !== "coupon_price" &&
    !o.conditions.couponRequired &&
    !(o.conditions.note && MULTIBUY_RE.test(o.conditions.note))
  );
}

/** Ranks CURRENT discounts only: offers whose validity contains the reference date (see promoCalendar); never upcoming promos. */
export function rankDiscounts(opts: { limit?: number; offers?: readonly Offer[]; now?: Date } = {}): RankedDiscount[] {
  const list = opts.offers ?? allOffers;
  return list
    .filter((o) => isPercentDiscount(o) && isOfferCurrent(o, opts.now))
    .map((offer) => ({ offer, product: getProduct(offer.productId) }))
    .filter((x): x is RankedDiscount => !!x.product)
    .sort(
      (a, b) =>
        (b.offer.discountPercent ?? 0) - (a.offer.discountPercent ?? 0) ||
        a.product.editorialRank - b.product.editorialRank ||
        a.offer.id.localeCompare(b.offer.id),
    )
    .slice(0, opts.limit ?? 4);
}

/**
 * Template (placeholders) for the discount answer. The products themselves are shown in the
 * discount_timeline block (verified price, regular price, SPAR plus label), so the prose is a short
 * intro naming the single biggest discount instead of repeating every row.
 */
export function discountTemplate(ranked: RankedDiscount[], spPlus: SpPlusSetting): string {
  if (!ranked.length) {
    return `Med preverjenimi izdelki iz kataloga ({{catalogs}}) ni izdelkov z natisnjenim odstotkom popusta. Lahko ti pokažem izdelke S-BUDGET z nizkimi rednimi cenami.`;
  }
  const top = ranked[0];
  let text = `Med preverjenimi izdelki v aktualnem katalogu ({{catalogs}}) je ta teden najbolj znižan izdelek {{name:${top.product.id}}} ({{discount:${top.offer.id}}} ceneje). Spodaj so najbolj znižani izdelki`;
  text += ".";
  const card = ranked.filter((r) => r.offer.conditions.spPlusRequired);
  if (card.length && spPlus === "no") {
    const lines = card.map(({ offer, product }) =>
      offer.regularPriceCents != null ? `• {{name:${product.id}}}: brez kartice redna cena {{regularPrice:${offer.id}}}` : `• {{name:${product.id}}}: cena brez kartice ni navedena`,
    );
    text += `\nCene, označene s kartico, veljajo le s kartico SPAR plus:\n${lines.join("\n")}`;
  } else if (card.length && spPlus === "unset") {
    text += "\nNekatere cene veljajo s kartico SPAR plus.";
  }
  return text;
}

