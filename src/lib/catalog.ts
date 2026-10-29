/**
 * Single source of truth accessors for the catalog data:
 *  - src/data/catalog.json: the six current catalogs (Home order), their verified products, offers, placement boxes
 *    and recipes (V3.1 indexing, scripts/catalog/v3);
 *  - src/data/historical.json: the earlier SPAR 41/26 / INTERSPAR 14/26 data, ONLY so saved products and old chats
 *    still resolve. Historical records are never listed, searched or recommended, and are never current.
 * Whether an offer is current is decided by its own dates (src/lib/promoCalendar.ts), never here.
 * Isomorphic: safe in server routes, client components and tests.
 */
import raw from "@/data/catalog.json";
import historicalRaw from "@/data/historical.json";
import type { Catalog, CatalogData, CatalogPage, HistoricalData, LeafletCategory, Offer, Placement, Product, Recipe, Retailer, ViewerCatalog } from "./types";

export const data = raw as unknown as CatalogData;
export const historical = historicalRaw as unknown as HistoricalData;
/** The six current catalogs, Home order (SPAR 44/26 first). */
export const catalogs: Catalog[] = data.catalogs;
/** The first Home catalog (SPAR 44/26). Pages/placements default to it when no catalog id is given. */
export const primaryCatalog: Catalog = catalogs[0];
/** Alias of `primaryCatalog`, kept for single-catalog call sites ({{issue}} etc.). */
export const catalog = primaryCatalog;
/** Earlier catalogs (historical.json), reachable from saved products and the leaflet switcher only. */
export const historicalCatalogs: Catalog[] = historical.catalogs;

const catalogById = new Map<string, Catalog>([...catalogs, ...historicalCatalogs].map((c) => [c.id, c]));

const productById = new Map<string, Product>([...data.products, ...historical.products].map((p) => [p.id, p]));
const historicalProductIds = new Set(historical.products.map((p) => p.id));
const offerById = new Map<string, Offer>([...data.offers, ...historical.offers].map((o) => [o.id, o]));
const offersByProduct = new Map<string, Offer[]>();
for (const o of [...data.offers, ...historical.offers]) {
  const list = offersByProduct.get(o.productId) ?? [];
  list.push(o);
  offersByProduct.set(o.productId, list);
}
const allPlacements = [...data.placements, ...historical.placements];
const placementsByOffer = new Map<string, Placement[]>();
for (const pl of allPlacements) {
  const list = placementsByOffer.get(pl.offerId) ?? [];
  list.push(pl);
  placementsByOffer.set(pl.offerId, list);
}
const pageKey = (catalogId: string, pdfPageIndex: number) => `${catalogId}#${pdfPageIndex}`;
const pageByKey = new Map<string, CatalogPage>(
  [...catalogs, ...historicalCatalogs].flatMap((c) => c.pages.map((p) => [pageKey(c.id, p.pdfPageIndex), p] as const)),
);

/** Products of the six current catalogs (current AND expired offers), editorial order (Home order, page, position). */
export const products: Product[] = [...data.products].sort((a, b) => a.editorialRank - b.editorialRank || a.id.localeCompare(b.id));
export const offers: Offer[] = data.offers;
export const placements: Placement[] = data.placements;
export const recipes: Recipe[] = data.recipes;
/** Every product id a saved item may legitimately reference (current dataset + historical). */
export const knownProductIds: ReadonlySet<string> = new Set(productById.keys());

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
export function getPage(pdfPageIndex: number, catalogId: string = primaryCatalog.id): CatalogPage | undefined {
  return pageByKey.get(pageKey(catalogId, pdfPageIndex));
}
export function getPlacementsOnPage(pdfPageIndex: number, catalogId: string = primaryCatalog.id): Placement[] {
  return allPlacements.filter((p) => p.catalogId === catalogId && p.pdfPageIndex === pdfPageIndex);
}
/** True for products of the earlier (historical) catalogs: shown only as saved items, never as current offers. */
export function isHistoricalProduct(productId: string): boolean {
  return historicalProductIds.has(productId);
}
/** Current-dataset products with the same identity (same product and pack in another catalog), editorial order. */
export function productsWithIdentity(identityKey: string): Product[] {
  return products.filter((p) => p.identityKey === identityKey);
}

// ---------------------------------------------------------------- catalogs & retailers

export function getCatalog(id: string): Catalog | undefined {
  return catalogById.get(id);
}
/** Catalog of the product's primary offer. */
export function catalogForProduct(productId: string): Catalog | undefined {
  const o = getPrimaryOffer(productId);
  return o ? getCatalog(o.catalogId) : undefined;
}
/** SPAR / INTERSPAR / SPAR Online / DESPAR source of a product (from its primary offer's catalog). */
export function retailerOf(productId: string): Retailer | undefined {
  return catalogForProduct(productId)?.retailer;
}
export const RETAILER_LABEL: Record<Retailer, string> = { spar: "SPAR", interspar: "INTERSPAR", "spar-online": "SPAR Online", despar: "DESPAR" };
/** Products of one catalog, editorial order. */
export function productsInCatalog(catalogId: string): Product[] {
  return products.filter((p) => getPrimaryOffer(p.id)?.catalogId === catalogId);
}
/** Products flagged "Novo v katalogu" (printed badge or explicit demo pick), editorial order. */
export function newProducts(): Product[] {
  return products.filter((p) => p.isNew);
}
/** Products whose categories include `slug`, editorial order. */
export function productsInCategory(slug: string): Product[] {
  return products.filter((p) => p.categories.includes(slug));
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
/** 338 -> "3,38 €" for price badges: one run of text, the € the same size and baseline as the digits. */
export function badgePrice(cents: number): string {
  return formatPrice(cents).replace(" ", " ");
}
/** 338 -> { euros: "3", cents: "38" } for catalog-style price blocks. */
export function splitPrice(cents: number): { euros: string; cents: string } {
  return { euros: String(Math.floor(cents / 100)), cents: String(cents % 100).padStart(2, "0") };
}
/** "2026-10-06" -> "6. 10. 2026" (non-breaking spaces, so a date never wraps mid-way). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}. ${m}. ${y}`;
}
/** "2026-10-14" -> "14. 10." */
export function formatShortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}. ${m}.`;
}
/** ("2026-10-07", "2026-10-13") -> "7. 10. – 13. 10. 2026" (year once when both dates share it). */
export function formatPeriod(from: string, to: string): string {
  return from.slice(0, 4) === to.slice(0, 4) ? `${formatShortDate(from)} – ${formatDate(to)}` : `${formatDate(from)} – ${formatDate(to)}`;
}

export const PRICE_UNIT_LABEL: Record<Offer["priceUnit"], string> = {
  pack: "",
  kg: "za kg",
  "100g": "za 100 g",
  kos: "za kos",
};

/** Pack sizes that already say what the price unit says ("1 kg" priced per kg). */
const UNIT_PACK: Partial<Record<Offer["priceUnit"], string>> = { kg: "1 kg", "100g": "100 g", kos: "1 kos" };

/**
 * The price-unit label to show beside a pack size: "za kg" for a 750 g loaf priced per kg, but "" for "1 kg" priced
 * per kg, so a card never reads "1 kg · za kg". The price itself (and every €/kg calculation) is unchanged.
 */
export function unitLabel(packSize: string, priceUnit: Offer["priceUnit"]): string {
  const same = UNIT_PACK[priceUnit];
  if (same && packSize.replace(/\s+/g, " ").trim().toLowerCase() === same) return "";
  return PRICE_UNIT_LABEL[priceUnit];
}

/** Human condition line, e.g. "s SPAR plus kartico · redna cena 1,99 €" or null. */
export function conditionText(o: Offer): string | null {
  const parts: string[] = [];
  if (o.conditions.spPlusRequired) parts.push("s kartico SPAR plus");
  if (o.conditions.couponRequired) parts.push("s kuponom");
  // The data note often restates the SPAR plus condition ("Velja s SPAR plus kartico; natisnjeno tudi »PC 9,59«"): say it once.
  const note = (o.conditions.spPlusRequired ? o.conditions.note?.replace(/^Velja s SPAR plus kartico;?\s*/i, "") : o.conditions.note)?.trim();
  if (note) parts.push(note.charAt(0).toUpperCase() + note.slice(1));
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

export const DEMO_LABEL = `Demo katalog · ${formatDate(primaryCatalog.publishedDate)}`;

/** Printed store / channel restriction of an offer ("Samo v trgovini DESPAR Koper."), or null. */
export function availabilityText(o: Offer): string | null {
  return o.availability?.restricted ? o.availability.note : null;
}

// ---------------------------------------------------------------- viewer leaflets (Home carousel + /letak)

const toViewer = (c: Catalog, isHistorical: boolean): ViewerCatalog => ({
  id: c.id,
  category: c.retailer,
  title: c.title,
  issueLabel: c.issueLabel,
  validFrom: c.validFrom,
  validTo: c.validTo,
  validityNote: c.validityNote,
  pageRules: c.pageRules,
  availability: c.availability,
  pdfUrl: c.pdfUrl,
  pageCount: c.pageCount,
  cover: c.cover,
  pages: c.pages,
  interactive: allPlacements.some((p) => p.catalogId === c.id),
  homeOrder: isHistorical ? null : c.homeOrder,
  historical: isHistorical,
});

/** The six current catalogs as Home cards, Home order. */
export const homeLeaflets: ViewerCatalog[] = catalogs.map((c) => toViewer(c, false)).sort((a, b) => (a.homeOrder ?? 0) - (b.homeOrder ?? 0));
/** Every leaflet the viewer can open: the six current ones, then the historical ones (saved products, old chats). */
export const viewerCatalogs: ViewerCatalog[] = [...homeLeaflets, ...historicalCatalogs.map((c) => toViewer(c, true))];
/** What /letak opens without a `katalog` parameter: the first Home leaflet. */
export const defaultLeaflet: ViewerCatalog = viewerCatalogs[0];

const viewerById = new Map<string, ViewerCatalog>(viewerCatalogs.map((c) => [c.id, c]));
const viewerPageByKey = pageByKey;

export function getViewerCatalog(id: string): ViewerCatalog | undefined {
  return viewerById.get(id);
}
/** A page of any viewer leaflet (browse-only or interactive). */
export function getViewerPage(pdfPageIndex: number, catalogId: string): CatalogPage | undefined {
  return viewerPageByKey.get(pageKey(catalogId, pdfPageIndex));
}

export const CATEGORY_LABEL: Record<LeafletCategory, string> = {
  spar: "SPAR",
  interspar: "INTERSPAR",
  "spar-online": "SPAR Online",
  despar: "DESPAR",
};
/** The title without the store name the badge beside it already shows: "SPAR katalog 44/26" -> "katalog 44/26". */
export function leafletShortTitle(c: Pick<ViewerCatalog, "title">): string {
  const short = c.title.replace(/^(SPAR Online|INTERSPAR|DESPAR|SPAR)\s+/, "");
  return short.charAt(0).toUpperCase() + short.slice(1);
}

// ---------------------------------------------------------------- links

/** The leaflet of one catalog: /letak?katalog=<id> (the default Home leaflet needs no parameter). */
export function catalogHref(catalogId: string): string {
  return catalogId === defaultLeaflet.id ? "/letak" : `/letak?katalog=${encodeURIComponent(catalogId)}`;
}
/** Deep link to the interactive leaflet at the product's first placement, in the product's own catalog. */
export function leafletHref(productId: string): string {
  const pl = getPlacementsForProduct(productId)[0];
  if (!pl) return "/letak";
  const kat = pl.catalogId === defaultLeaflet.id ? "" : `katalog=${encodeURIComponent(pl.catalogId)}&`;
  return `/letak?${kat}stran=${pl.pdfPageNumber}&izdelek=${encodeURIComponent(productId)}`;
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
