/** Data-driven helpers for e2e specs: everything is derived from src/data/catalog.json so the specs survive data swaps. */
import { readFileSync } from "node:fs";

type Img = { src: string; width: number; height: number };
export type CatalogRec = { id: string; title: string; retailer: "spar" | "interspar" | "spar-online" | "despar"; pageCount: number; pages: { pdfPageIndex: number; image: Img }[] };
type Placement = { id: string; offerId: string; pdfPageIndex: number; pdfPageNumber: number; catalogId: string; bbox: { x: number; y: number; width: number; height: number } };

const data = JSON.parse(readFileSync("src/data/catalog.json", "utf8")) as {
  catalogs: CatalogRec[];
  products: { id: string; name: string; packSize: string }[];
  offers: { id: string; productId: string; catalogId: string; priceCents: number; regularPriceCents: number | null }[];
  placements: Placement[];
};

export const catalogs = data.catalogs;
export const primary = catalogs[0];
export const secondary = catalogs[1];
const RETAILER_LABELS = { spar: "SPAR", interspar: "INTERSPAR", "spar-online": "SPAR Online", despar: "DESPAR" } as const;
export const retailerLabel = (c: CatalogRec) => RETAILER_LABELS[c.retailer];

/** First offer of the product (the primary offer the app uses). */
export const offerOf = (productId: string) => data.offers.find((o) => o.productId === productId)!.id;
export const productName = (productId: string) => data.products.find((p) => p.id === productId)!.name;
export const catalogOfProduct = (productId: string) => data.offers.find((o) => o.productId === productId)!.catalogId;
export const pageImage = (c: CatalogRec, pageIndex: number) => c.pages.find((p) => p.pdfPageIndex === pageIndex)!.image;
export const pageNum = (n: number, c: CatalogRec) => new RegExp(`^${n} / ${c.pageCount}`);

/** pdfPageIndex -> unique product ids with a placement on that page of the catalog (document order). */
export function productsByPage(catalogId: string): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const pl of data.placements.filter((p) => p.catalogId === catalogId)) {
    const pid = data.offers.find((o) => o.id === pl.offerId)!.productId;
    const list = map.get(pl.pdfPageIndex) ?? [];
    if (!list.includes(pid)) list.push(pid);
    map.set(pl.pdfPageIndex, list);
  }
  return map;
}
/** Sorted page indexes that have at least one product. */
export const pagesWithProducts = (catalogId: string) => [...productsByPage(catalogId).keys()].sort((a, b) => a - b);

/** The page of a catalog with the most products (earliest on ties). */
export function busiestPage(c: CatalogRec): { index: number; ids: string[] } {
  let best = { index: -1, ids: [] as string[] };
  for (const idx of pagesWithProducts(c.id)) {
    const ids = productsByPage(c.id).get(idx)!;
    if (ids.length > best.ids.length) best = { index: idx, ids };
  }
  return best;
}
export const placementsOnPage = (c: CatalogRec, index: number) => data.placements.filter((p) => p.catalogId === c.id && p.pdfPageIndex === index);

export const packOf = (productId: string) => data.products.find((p) => p.id === productId)!.packSize;
/** "7,19 €" */
export const priceOf = (productId: string) => {
  const c = data.offers.find((o) => o.productId === productId)!.priceCents;
  return `${Math.floor(c / 100)},${String(c % 100).padStart(2, "0")} €`;
};
/** PDF page number (1-based) of the product's primary placement. */
export const pdfPageNumberOf = (productId: string) => {
  const offer = offerOf(productId);
  return data.placements.find((p) => p.offerId === offer)!.pdfPageNumber;
};
export const escapeRe = (s: string) => s.split("").map((ch) => (".*+?^${}()|[]\\".includes(ch) ? "\\" + ch : ch)).join("");
