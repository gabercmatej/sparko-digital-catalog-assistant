/**
 * Rule-based, descriptive Sparko assessments. No stars, no numeric quality scores.
 * - "Izrazit popust": verified printed discount >= 20 %.
 * - "Dobra izbira zate": shares the line/brand or primary category with something the user saved.
 * - "V tvojem proračunu": only when a whole-pack calculation supports it (passed in by caller).
 */
import { getPrimaryOffer, getProduct } from "./catalog";
import type { Offer, Product } from "./types";

export type Assessment = { kind: "discount" | "good_match" | "budget"; label: string; reason: string };

export const STRONG_DISCOUNT_PERCENT = 20;

export function assessOffer(
  product: Product,
  offer: Offer,
  ctx: { savedProductIds?: string[]; budgetReason?: string | null } = {},
): Assessment[] {
  const out: Assessment[] = [];
  if (offer.discountPercent != null && offer.discountPercent >= STRONG_DISCOUNT_PERCENT && offer.verification.status === "verified") {
    const cond = offer.conditions.spPlusRequired ? " s kartico SPAR plus" : offer.conditions.couponRequired ? " s kuponom" : "";
    out.push({ kind: "discount", label: "Izrazit popust", reason: `V letaku je navedeno ${offer.discountPercent} % ceneje${cond}.` });
  }
  // "Dobra izbira zate" is a suggestion; it makes no sense for an item the user already chose.
  const alreadyChosen = (ctx.savedProductIds ?? []).includes(product.id);
  const saved = (alreadyChosen ? [] : (ctx.savedProductIds ?? [])).map((id) => getProduct(id)).filter((p): p is Product => !!p);
  if (saved.length) {
    const sameLine = product.line ? saved.find((s) => s.line === product.line) : undefined;
    const sameCat = saved.find((s) => s.categories[0] === product.categories[0]);
    if (sameLine) out.push({ kind: "good_match", label: "Dobra izbira zate", reason: `Tudi iz linije ${product.line}, ki si jo izbral.` });
    else if (sameCat) out.push({ kind: "good_match", label: "Dobra izbira zate", reason: `Podobno kot ${sameCat.name.toLowerCase()} v tvojem katalogu.` });
  }
  if (ctx.budgetReason) out.push({ kind: "budget", label: "V tvojem proračunu", reason: ctx.budgetReason });
  return out.slice(0, 2);
}

export function assessProduct(productId: string, ctx: { savedProductIds?: string[] } = {}): Assessment[] {
  const p = getProduct(productId);
  const o = getPrimaryOffer(productId);
  return p && o ? assessOffer(p, o, ctx) : [];
}
