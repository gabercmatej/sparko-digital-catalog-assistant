/**
 * Single source of truth accessors for the verified demo catalog.
 * Isomorphic: safe in server routes, client components and tests.
 */
import raw from "@/data/catalog.json";
import type { CatalogData, CatalogPage, Offer, Placement, Product, Recipe } from "./types";

export const data = raw as unknown as CatalogData;
export const catalog = data.catalog;

const productById = new Map<string, Product>(data.products.map((p) => [p.id, p]));
const offerById = new Map<string, Offer>(data.offers.map((o) => [o.id, o]));
const offersByProduct = new Map<string, Offer[]>();
for (const o of data.offers) {
  const list = offersByProduct.get(o.productId) ?? [];
  list.push(o);
  offersByProduct.set(o.productId, list);
}
const placementsByOffer = new Map<string, Placement[]>();
for (const pl of data.placements) {
  const list = placementsByOffer.get(pl.offerId) ?? [];
  list.push(pl);
  placementsByOffer.set(pl.offerId, list);
}
const pageByIndex = new Map<number, CatalogPage>(data.catalog.pages.map((p) => [p.pdfPageIndex, p]));

/** Products sorted by editorial rank (carousel order). */
export const products: Product[] = [...data.products].sort((a, b) => a.editorialRank - b.editorialRank || a.id.localeCompare(b.id));
export const offers: Offer[] = data.offers;
export const placements: Placement[] = data.placements;
export const recipes: Recipe[] = data.recipes;

export function getProduct(id: string): Product | undefined {
  return productById.get(id);
}
export function getOffer(id: string): Offer | undefined {
  return offerById.get(id);
}
/** Primary (first listed) offer for a product in this catalog. */
export function getPrimaryOffer(productId: string): Offer | undefined {
  return offersByProduct.get(productId)?.[0];
}
export function getOffersForProduct(productId: string): Offer[] {
  return offersByProduct.get(productId) ?? [];
}
export function getPlacements(offerId: string): Placement[] {
  return placementsByOffer.get(offerId) ?? [];
}
export function getPlacementsForProduct(productId: string): Placement[] {
  return getOffersForProduct(productId).flatMap((o) => getPlacements(o.id));
}
export function getPage(pdfPageIndex: number): CatalogPage | undefined {
  return pageByIndex.get(pdfPageIndex);
}
export function getPlacementsOnPage(pdfPageIndex: number): Placement[] {
  return data.placements.filter((p) => p.pdfPageIndex === pdfPageIndex);
}
export function getRecipe(id: string): Recipe | undefined {
  return data.recipes.find((r) => r.id === id);
}
export function productForOffer(offerId: string): Product | undefined {
  const o = getOffer(offerId);
  return o ? getProduct(o.productId) : undefined;
}

// ---------------------------------------------------------------- formatting

/** 338 -> "3,38 €" */
export function formatPrice(cents: number): string {
  const euros = Math.floor(cents / 100);
  const rest = String(cents % 100).padStart(2, "0");
  return `${euros},${rest} €`;
}
/** 338 -> { euros: "3", cents: "38" } for catalog-style price blocks. */
export function splitPrice(cents: number): { euros: string; cents: string } {
  return { euros: String(Math.floor(cents / 100)), cents: String(cents % 100).padStart(2, "0") };
}
/** "2026-10-06" -> "6. 10. 2026" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}. ${m}. ${y}`;
}

export const PRICE_UNIT_LABEL: Record<Offer["priceUnit"], string> = {
  pack: "",
  kg: "za kg",
  "100g": "za 100 g",
  kos: "za kos",
};

/** Human condition line, e.g. "s SPAR plus kartico · redna cena 1,99 €" or null. */
export function conditionText(o: Offer): string | null {
  const parts: string[] = [];
  if (o.conditions.spPlusRequired) parts.push("s kartico SPAR plus");
  if (o.conditions.couponRequired) parts.push("s kuponom");
  if (o.conditions.note) parts.push(o.conditions.note);
  if (o.discountPercent != null) parts.push(`${o.discountPercent} % ceneje`);
  if (o.regularPriceCents != null) parts.push(`redna cena ${formatPrice(o.regularPriceCents)}`);
  return parts.length ? parts.join(" · ") : null;
}

/** Plain validity statement that never claims the offer is current in a real store. */
export function validityText(o: Offer): string {
  const { status, from, to } = o.validity;
  if (status !== "unknown" && from && to) return `Velja ${formatDate(from)}–${formatDate(to)} (po katalogu)`;
  if (status !== "unknown" && to) return `Velja do ${formatDate(to)} (po katalogu)`;
  if (status !== "unknown" && from) return `Velja od ${formatDate(from)} (po katalogu)`;
  return "Veljavnost v katalogu ni navedena; preveri v letaku";
}

export function pageCaption(productId: string): string | null {
  const pl = getPlacementsForProduct(productId)[0];
  if (!pl) return null;
  return `Cena iz demo kataloga · PDF-stran ${pl.pdfPageNumber}`;
}

export const DEMO_LABEL = "Demo katalog · 30. 9. 2026";

// ---------------------------------------------------------------- links

/** Deep link to the interactive leaflet at the product's first placement. */
export function leafletHref(productId: string): string {
  const pl = getPlacementsForProduct(productId)[0];
  return pl ? `/letak?stran=${pl.pdfPageNumber}&izdelek=${encodeURIComponent(productId)}` : "/letak";
}
export function collectionHref(productId?: string): string {
  return productId ? `/moj-katalog#izdelek-${productId}` : "/moj-katalog";
}

// ---------------------------------------------------------------- recipes

export type RecipeLine = { offer: Offer; product: Product; packs: number; lineCents: number; requiredQuantity: string; conversionNote: string };

/** Whole-pack cost lines; returns null if any ingredient offer is missing or not priced per pack. */
export function recipeLines(recipe: Recipe): RecipeLine[] | null {
  const lines: RecipeLine[] = [];
  for (const ing of recipe.ingredients) {
    const offer = getOffer(ing.offerId);
    const product = offer && getProduct(offer.productId);
    if (!offer || !product || offer.priceUnit !== "pack") return null;
    lines.push({
      offer,
      product,
      packs: ing.packsNeeded,
      lineCents: offer.priceCents * ing.packsNeeded,
      requiredQuantity: ing.requiredQuantity,
      conversionNote: ing.conversionNote,
    });
  }
  return lines;
}
export function recipeTotalCents(recipe: Recipe): number | null {
  const lines = recipeLines(recipe);
  return lines ? lines.reduce((s, l) => s + l.lineCents, 0) : null;
}

/**
 * Totals for whole packs. `withCard` uses catalog prices (incl. SPAR plus prices);
 * `withoutCard` substitutes the verified regular price for card-only offers, or is null
 * when a needed regular price is unknown (never guessed). `needsCard` tells whether any line
 * depends on SPAR plus / coupon.
 */
export function recipeTotals(recipe: Recipe): { withCard: number; withoutCard: number | null; needsCard: boolean } | null {
  const lines = recipeLines(recipe);
  if (!lines) return null;
  let withCard = 0;
  let withoutCard: number | null = 0;
  let needsCard = false;
  for (const l of lines) {
    withCard += l.lineCents;
    const conditional = l.offer.conditions.spPlusRequired || l.offer.conditions.couponRequired;
    if (conditional) {
      needsCard = true;
      withoutCard = withoutCard == null || l.offer.regularPriceCents == null ? null : withoutCard + l.offer.regularPriceCents * l.packs;
    } else if (withoutCard != null) {
      withoutCard += l.lineCents;
    }
  }
  return { withCard, withoutCard, needsCard };
}
