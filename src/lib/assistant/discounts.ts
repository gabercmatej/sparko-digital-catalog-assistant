/**
 * "Kaj je najbolj znižano?" — ranks offers with a verified, printed percentage discount within the
 * demo catalog's verified selection. Coupon offers and multi-buy ("2+1") deals are not mixed into the
 * percentage ranking. Products without a printed percentage (e.g. S-BUDGET everyday prices) are not
 * "discounted". Never claims anything about the current store or today's date.
 */
import { getProduct, offers as allOffers, validityText } from "@/lib/catalog";
import type { Offer, Product, SpPlusSetting } from "@/lib/types";

export type RankedDiscount = { offer: Offer; product: Product };

const MULTIBUY_RE = /\d\s*\+\s*\d|\bgratis\b|\bvsak (drugi|tretji)\b/i;

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

export function rankDiscounts(opts: { limit?: number; offers?: readonly Offer[] } = {}): RankedDiscount[] {
  const list = opts.offers ?? allOffers;
  return list
    .filter(isPercentDiscount)
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

/** Template (placeholders) for the discount answer. */
export function discountTemplate(ranked: RankedDiscount[], spPlus: SpPlusSetting): string {
  if (!ranked.length) {
    return `V preverjenem izboru demo kataloga {{issue}} ni izdelkov z natisnjenim odstotkom popusta. Lahko ti pokažem izdelke S-BUDGET z nizkimi rednimi cenami.`;
  }
  const sameValidity = new Set(ranked.map((r) => validityText(r.offer))).size === 1;
  const lines = ranked.map(({ offer, product }) => {
    const card = offer.conditions.spPlusRequired;
    let line = `• {{name:${product.id}}}, {{pack:${product.id}}}: {{price:${offer.id}}} ({{discount:${offer.id}}} ceneje${card ? ", s kartico SPAR plus" : ""})`;
    if (card && spPlus === "no") {
      line += offer.regularPriceCents != null ? `; brez kartice redna cena {{regularPrice:${offer.id}}}` : "; cena brez kartice ni navedena";
    } else if (offer.regularPriceCents != null) {
      line += `; redna cena {{regularPrice:${offer.id}}}`;
    }
    line += sameValidity ? "." : `. {{validity:${offer.id}}}.`;
    return line;
  });
  const anyCard = ranked.some((r) => r.offer.conditions.spPlusRequired);
  let outro = "";
  if (anyCard && spPlus === "no") outro = "\nCene, označene s kartico, veljajo le s kartico SPAR plus.";
  else if (anyCard && spPlus === "unset") outro = "\nNekatere cene veljajo s kartico SPAR plus.";
  const validity = sameValidity ? `\n{{validity:${ranked[0].offer.id}}}.` : "";
  return `V preverjenem izboru demo kataloga {{issue}} so najbolj znižani:\n${lines.join("\n")}${validity}${outro}`;
}

