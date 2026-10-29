/**
 * Human status of offers and catalogs relative to the reference date (promoCalendar): current / expired /
 * upcoming, and the compact validity line of a Home catalog card ("21. 10. – 27. 10. 2026" + "Del ponudbe do 3. 11.").
 * Pure and client-safe.
 */
import { formatDate, formatPeriod, formatShortDate, getCatalog, isHistoricalProduct, getPrimaryOffer } from "./catalog";
import { offerWindow, referenceDate } from "./promoCalendar";
import type { Catalog, Offer, ViewerCatalog } from "./types";

export type OfferState = "current" | "expired" | "upcoming";

export function offerState(o: Offer, now: Date = new Date()): OfferState {
  const w = offerWindow(o);
  const ref = referenceDate(now);
  if (!w) return "expired";
  if (ref < w.from) return "upcoming";
  if (ref > w.to) return "expired";
  return "current";
}

export function productOfferState(productId: string, now: Date = new Date()): OfferState | null {
  const o = getPrimaryOffer(productId);
  return o ? offerState(o, now) : null;
}

/** Short status line for a product card / saved row, or null for a current offer. */
export function offerStatusText(o: Offer, now: Date = new Date()): string | null {
  const st = offerState(o, now);
  const w = offerWindow(o);
  if (st === "current" || !w) return null;
  if (st === "upcoming") return `Velja od ${formatDate(w.from)}`;
  const cat = getCatalog(o.catalogId);
  const historical = isHistoricalProduct(o.productId);
  return `${historical ? "Pretekla ponudba" : "Ponudba je potekla"} ${formatDate(w.to)}${cat ? ` (${cat.title})` : ""}`;
}

/** Validity of a catalog as shown on its Home card and in the leaflet switcher. */
export type CatalogValidity = {
  /** General printed period, e.g. "21. 10. – 27. 10. 2026". */
  period: string;
  /** Compact second line: the part still valid ("Del ponudbe do 3. 11.") or a restriction, else null. */
  extra: string | null;
  /** current: general period runs; partial: general period over, some pages still valid; expired; upcoming. */
  state: "current" | "partial" | "expired" | "upcoming";
};

export function catalogValidity(c: Pick<Catalog | ViewerCatalog, "validFrom" | "validTo" | "pageRules"> & { historical?: boolean }, now: Date = new Date()): CatalogValidity {
  const ref = referenceDate(now);
  const period = formatPeriod(c.validFrom, c.validTo);
  if (c.historical) return { period, extra: "Pretekli katalog", state: "expired" };
  if (ref < c.validFrom) return { period, extra: `Velja od ${formatShortDate(c.validFrom)}`, state: "upcoming" };
  const longest = (c.pageRules ?? []).map((r) => r.to).filter((to) => to > c.validTo).sort().reverse()[0];
  if (ref <= c.validTo) return { period, extra: longest ? `Del ponudbe do ${formatShortDate(longest)}` : null, state: "current" };
  const running = (c.pageRules ?? []).filter((r) => r.from <= ref && ref <= r.to).map((r) => r.to).sort().reverse()[0];
  if (running) return { period, extra: `Del ponudbe do ${formatShortDate(running)}`, state: "partial" };
  return { period, extra: "Ponudba je potekla", state: "expired" };
}
