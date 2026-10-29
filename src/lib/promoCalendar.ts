/**
 * Promo calendar: which offers are "current" and which promos are "upcoming" relative to a reference date.
 * Pure, client-safe (no server-only imports), `now` injectable for tests.
 *
 * DATE MODEL (V3.1). The six catalogs overlap and each offer carries its own printed validity (general catalog
 * dates, page exceptions such as »strani 22–27 do 10. 11.«, or dates printed on the offer):
 *  - while the real date (Europe/Ljubljana) lies inside the span of the catalogs' offers, it IS the reference date
 *    (on 28. 10. 2026: SPAR 44/26 is current, SPAR 43/26 only on its pages 3 and 23, INTERSPAR 15/26 on pages 3-7);
 *  - before that span the reference date is the earliest offer start; after it, the start of the newest catalog
 *    (so a demo shown later still presents the newest issue as "this week" instead of an empty catalog).
 * Current = the offer's own validity window contains the reference date. Historical offers (41/26, 14/26) end
 * before every reference date and are therefore never current.
 * Upcoming = promo starts after the reference date.
 */
import { catalogs, getCatalog, offers } from "./catalog";
import { upcomingPeriod } from "./futurePromos";
import type { FuturePromo, Offer } from "./types";

/** ISO date (YYYY-MM-DD) of the instant in Europe/Ljubljana. */
export function ljubljanaDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Ljubljana", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const spanFrom = [...offers.map((o) => o.validity.from), ...catalogs.map((c) => c.validFrom)].filter((d): d is string => !!d).sort()[0];
const spanTo = [...offers.map((o) => o.validity.to), ...catalogs.map((c) => c.validTo)].filter((d): d is string => !!d).sort().reverse()[0];
const newestStart = catalogs.map((c) => c.validFrom).sort().reverse()[0];

/** The reference "demo today" (see the module comment). */
export function referenceDate(now: Date = new Date()): string {
  const today = ljubljanaDate(now);
  if (today < spanFrom) return spanFrom;
  if (today > spanTo) return newestStart;
  return today;
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

/** True when the offer is valid on the reference date (alias with a clearer name for list filters). */
export const isOfferActive = isOfferCurrent;

/**
 * The upcoming ("Naslednji teden") period: the period of future-promos.json, else the seven days after
 * the primary catalog's general validTo.
 */
export function upcomingWindow(): { from: string; to: string } {
  if (upcomingPeriod?.from && upcomingPeriod?.to) return { from: upcomingPeriod.from, to: upcomingPeriod.to };
  const end = catalogs[0].validTo;
  return { from: addDays(end, 1), to: addDays(end, 7) };
}
