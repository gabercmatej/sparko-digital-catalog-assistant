/**
 * Placeholder templates. Every number shown in assistant prose (prices, discounts, dates, pages,
 * totals, budgets, servings) is written as a placeholder and resolved here from verified data.
 * The deterministic responder and the language model use the same placeholder language, so
 * digits in final text can only come from the catalog or from server-parsed request values.
 *
 *   {{name:<productId>}}       S-BUDGET Svinjske kocke
 *   {{pack:<productId>}}       1 kg
 *   {{price:<offerId>}}        3,38 € (+ " za kg" for per-unit prices)
 *   {{regularPrice:<offerId>}} 4,49 €
 *   {{discount:<offerId>}}     25 %
 *   {{condition:<offerId>}}    s kartico SPAR plus · redna cena 4,49 €
 *   {{validity:<offerId>}}     Velja 1. 10. 2026–7. 10. 2026 (po katalogu)
 *   {{page:<productId>}}       5   (1-based PDF page of the first placement)
 *   {{recipeServings:<recipeId>}} / {{pantry:<recipeId>}} (pantry assumptions)
 *   {{recipeTitle:<recipeId>}} / {{recipeTotal:<recipeId>}} / {{recipeTotalCard:<recipeId>}}
 *   {{note:<offerId>}}  printed extra condition · {{issue}}  primary catalog issue label (41/26)
 *   {{catalogs}}               SPAR 41/26 in INTERSPAR 14/26 (every catalog, from data)
 *   {{currentPeriod:<offerId>}} 7. 10. – 13. 10. 2026 (validity of the offer's catalog)
 *   {{futurePrice:<promoId>}}  2,99 € (upcoming demo promo) · {{futureFrom:<promoId>}}  14. 10.
 *   {{futurePeriod}}           14. 10. – 20. 10. 2026 (the upcoming period)
 *   {{budget}} / {{servings}}
 */
import {
  catalog,
  catalogs,
  conditionText,
  formatPeriod,
  formatPrice,
  formatShortDate,
  getCatalog,
  getOffer,
  getPlacementsForProduct,
  getProduct,
  getRecipe,
  PRICE_UNIT_LABEL,
  RETAILER_LABEL,
  recipeTotals,
  validityText,
} from "@/lib/catalog";
import { getFuturePromo, upcomingPeriod } from "@/lib/futurePromos";
import type { Offer, Product, Recipe, SpPlusSetting } from "@/lib/types";

export type PlaceholderContext = {
  spPlus: SpPlusSetting;
  budgetCents?: number | null;
  servings?: number | null;
  /** When set, ids outside these sets make resolution fail (used for model output). */
  allowedProductIds?: Set<string>;
  allowedOfferIds?: Set<string>;
  allowedPromoIds?: Set<string>;
  allowedRecipeIds?: Set<string>;
  /** Optional lookup override for tests with synthetic recipes. */
  recipeLookup?: (id: string) => Recipe | undefined;
};

export const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z]+)(?::([a-z0-9-]+))?\s*\}\}/g;

function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

/** "S-BUDGET Svinjske kocke" — brand prefix only when the name doesn't already contain it. */
export function displayName(p: Product): string {
  if (p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase())) return `${p.brand} ${lowerFirst(p.name)}`;
  return p.name;
}

/** "SPAR 41/26 in INTERSPAR 14/26": every catalog of the demo, derived from data. */
export function catalogsLabel(): string {
  return catalogs.map((c) => `${RETAILER_LABEL[c.retailer]} ${c.issueLabel}`).join(" in ");
}

export function priceLabel(o: Offer): string {
  const unit = PRICE_UNIT_LABEL[o.priceUnit];
  return `${formatPrice(o.priceCents)}${unit ? " " + unit : ""}`;
}

/** Total for a recipe respecting the SPAR plus setting; null when the needed price is unknown. */
export function effectiveRecipeTotal(recipe: Recipe, spPlus: SpPlusSetting): number | null {
  const t = recipeTotals(recipe);
  if (!t) return null;
  return spPlus === "no" ? t.withoutCard : t.withCard;
}

export type ResolveResult = { ok: true; text: string } | { ok: false; error: string };

export function resolvePlaceholders(template: string, ctx: PlaceholderContext): ResolveResult {
  let error: string | null = null;
  const fail = (e: string) => {
    error ??= e;
    return "";
  };
  const text = template.replace(PLACEHOLDER_RE, (_m, kindRaw: string, id: string | undefined) => {
    const kind = kindRaw;
    const productOk = (pid: string) => !ctx.allowedProductIds || ctx.allowedProductIds.has(pid);
    const offerOk = (oid: string) => !ctx.allowedOfferIds || ctx.allowedOfferIds.has(oid);
    const promoOk = (fid: string) => !ctx.allowedPromoIds || ctx.allowedPromoIds.has(fid);
    const recipeOk = (rid: string) => !ctx.allowedRecipeIds || ctx.allowedRecipeIds.has(rid);
    switch (kind) {
      case "name":
      case "pack":
      case "page": {
        const p = id ? getProduct(id) : undefined;
        if (!p || !productOk(p.id)) return fail(`unknown product ${id}`);
        if (kind === "name") return displayName(p);
        if (kind === "pack") return p.packSize;
        const pl = getPlacementsForProduct(p.id)[0];
        return pl ? String(pl.pdfPageNumber) : fail("no placement");
      }
      case "price":
      case "regularPrice":
      case "discount":
      case "condition":
      case "validity": {
        const o = id ? getOffer(id) : undefined;
        if (!o || !offerOk(o.id)) return fail(`unknown offer ${id}`);
        if (kind === "price") return priceLabel(o);
        if (kind === "regularPrice") return o.regularPriceCents != null ? formatPrice(o.regularPriceCents) : fail("no regular price");
        if (kind === "discount") return o.discountPercent != null ? `${o.discountPercent} %` : fail("no discount");
        if (kind === "condition") return conditionText(o) ?? "brez posebnih pogojev";
        return validityText(o);
      }
      case "recipeTitle":
      case "recipeServings":
      case "pantry":
      case "recipeTotal":
      case "recipeTotalCard": {
        const r = id ? (ctx.recipeLookup ?? getRecipe)(id) : undefined;
        if (!r || !recipeOk(r.id)) return fail(`unknown recipe ${id}`);
        if (kind === "recipeTitle") return r.title;
        if (kind === "recipeServings") return String(r.servings);
        if (kind === "pantry") return r.pantryAssumptions.length ? r.pantryAssumptions.join(", ").replace(/[{}]/g, "") : fail("no pantry");
        const t = recipeTotals(r);
        if (!t) return fail("recipe total unknown");
        const v = kind === "recipeTotalCard" ? t.withCard : effectiveRecipeTotal(r, ctx.spPlus);
        return v != null ? formatPrice(v) : fail("recipe total unknown");
      }
      case "futurePrice":
      case "futureFrom": {
        const fp = id ? getFuturePromo(id) : undefined;
        if (!fp || !promoOk(fp.id)) return fail(`unknown promo ${id}`);
        return kind === "futurePrice" ? formatPrice(fp.priceCents) : formatShortDate(fp.validFrom);
      }
      case "futurePeriod":
        // Model output: only when the draft itself concerns upcoming promos (allow-list given, but empty = none).
        if (ctx.allowedPromoIds && ctx.allowedPromoIds.size === 0) return fail("no upcoming promos allowed");
        return formatPeriod(upcomingPeriod.from, upcomingPeriod.to);
      case "currentPeriod": {
        const o = id ? getOffer(id) : undefined;
        const c = o && getCatalog(o.catalogId);
        if (!o || !c || !offerOk(o.id)) return fail(`unknown offer ${id}`);
        return formatPeriod(c.validFrom, c.validTo);
      }
      case "issue":
        return catalog.issueLabel;
      case "catalogs":
        return catalogsLabel();
      case "note": {
        const o = id ? getOffer(id) : undefined;
        if (!o || !offerOk(o.id) || !o.conditions.note) return fail("no note");
        return o.conditions.note.replace(/[{}]/g, "").slice(0, 80);
      }
      case "budget":
        return ctx.budgetCents != null ? formatPrice(ctx.budgetCents) : fail("no budget");
      case "servings":
        return ctx.servings != null ? String(ctx.servings) : fail("no servings");
      default:
        return fail(`unknown placeholder ${kind}`);
    }
  });
  if (error) return { ok: false, error };
  if (/\{\{|\}\}/.test(text)) return { ok: false, error: "malformed placeholder" };
  return { ok: true, text };
}

/** Resolve a template the server itself wrote; throws on a programming error. */
export function render(template: string, ctx: PlaceholderContext): string {
  const r = resolvePlaceholders(template, ctx);
  if (!r.ok) throw new Error(`template error: ${r.error}`);
  return r.text;
}

/** Remove placeholders (used to inspect the free prose a model wrote). */
export function stripPlaceholders(s: string): string {
  return s.replace(PLACEHOLDER_RE, " ");
}
