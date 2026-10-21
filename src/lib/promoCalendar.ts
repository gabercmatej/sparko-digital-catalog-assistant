/**
 * Promo calendar: which offers are "current" and which promos are "upcoming" relative to a reference date.
 * Pure, client-safe (no server-only imports), `now` injectable for tests.
 *
 * DEMO DATE MODEL. The demo catalogs (SPAR 41/26, INTERSPAR 14/26) are valid for a fixed week. A demo is
 * shown long after that week, so "today" cannot simply be the real date:
 *  - if the real date (Europe/Ljubljana) lies inside a catalog's validity window, it IS the reference date;
 *  - otherwise (catalogs expired or not yet valid) the reference date falls back to the earliest catalog
 *    `validFrom`, i.e. "the demo week" - the catalogs then count as the current week and the data in
 *    future-promos.json (starting after the catalogs' validTo) as the upcoming week.
 * Current = the offer's own validity (else its catalog's) contains the reference date.
 * Upcoming = promo starts after the reference date.
 */
import { catalogs, getCatalog } from "./catalog";
import { upcomingPeriod } from "./futurePromos";
import type { FuturePromo, Offer } from "./types";

/** ISO date (YYYY-MM-DD) of the instant in Europe/Ljubljana. */
export function ljubljanaDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Ljubljana", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The reference "demo today" (see the module comment). */
export function referenceDate(now: Date = new Date()): string {
  const today = ljubljanaDate(now);
  if (catalogs.some((c) => c.validFrom <= today && today <= c.validTo)) return today;
  return catalogs.map((c) => c.validFrom).sort()[0];
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Validity window of an offer: its own dates when printed, else its catalog's. */
export function offerWindow(o: Offer): { from: string; to: string } | null {
  if (o.validity.from && o.validity.to) return { from: o.validity.from, to: o.validity.to };
  const c = getCatalog(o.catalogId);
  return c ? { from: c.validFrom, to: c.validTo } : null;
}

/** True when the offer is valid on the reference date. */
export function isOfferCurrent(o: Offer, now: Date = new Date()): boolean {
  const w = offerWindow(o);
  const ref = referenceDate(now);
  return !!w && w.from <= ref && ref <= w.to;
}

/** True when the promo starts after the reference date (and so is not part of the current week). */
export function isPromoUpcoming(p: Pick<FuturePromo, "validFrom">, now: Date = new Date()): boolean {
  return p.validFrom > referenceDate(now);
}

/**
 * The upcoming ("Naslednji teden") period: the period of future-promos.json, else the seven days after
 * the latest catalog validTo.
 */
export function upcomingWindow(): { from: string; to: string } {
  if (upcomingPeriod?.from && upcomingPeriod?.to) return { from: upcomingPeriod.from, to: upcomingPeriod.to };
  const end = catalogs.map((c) => c.validTo).sort().reverse()[0];
  return { from: addDays(end, 1), to: addDays(end, 7) };
}
