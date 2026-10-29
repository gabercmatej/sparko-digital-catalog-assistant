/**
 * Questions about one catalog ("Pokaži izdelke iz INTERSPAR kataloga", "Kaj je v DESPAR Koper?") and about what is
 * new ("Kaj je novega v katalogu?"). Deterministic: the answer lists current offers of that catalog, or says
 * plainly that its offers have expired (with the printed dates), never presenting expired prices as current.
 */
import { activeProducts, activeProductsInCatalog } from "@/lib/activeCatalog";
import { catalogs, formatDate, formatShortDate, getPrimaryOffer } from "@/lib/catalog";
import { catalogValidity } from "@/lib/offerStatus";
import { referenceDate } from "@/lib/promoCalendar";
import type { Catalog, Product } from "@/lib/types";
import { catalogShortTitle } from "./placeholders";

/** Catalog named in a folded query, or undefined ("spar" alone names no single catalog). */
export function detectCatalog(folded: string): Catalog | undefined {
  const by = (id: string) => catalogs.find((c) => c.id === id);
  if (/\bdespar\w*|\bkoper\w*/.test(folded)) return by("despar-koper-1626");
  if (/\bmega ?spar\w*|\bprihrank\w* katalog/.test(folded)) return by("mega-spar-0826");
  if (/\bspar online\b|\bonline\b|\bspletn\w* (trgovin\w*|katalog\w*)/.test(folded)) return by("spar-online-4426");
  if (/\binterspar\w*/.test(folded)) return by("interspar-1526");
  if (/\b43 ?\/? ?26\b/.test(folded)) return by("spar-4326");
  if (/\b44 ?\/? ?26\b/.test(folded)) return by("spar-4426");
  return undefined;
}

/** True when the query asks for a catalog's products in general (no product words beyond catalog vocabulary). */
export function isGeneralCatalogQuestion(folded: string, contentTokens: string[]): boolean {
  const generic = /^(izdelk|katalog|ponudb|akcij|letak|pokaz|kaj|vse|spar|interspar|despar|koper|mega|online|spletn|trgovin|prihrank|imate|ima|je|so|iz|v|na|\d)/;
  return contentTokens.every((t) => generic.test(t)) && /\b(izdelk\w*|katalog\w*|ponudb\w*|akcij\w*|letak\w*|pokazi|kaj je|kaj imate)\b/.test(folded);
}

/** ["3","4","5","6","7"] -> "3–7"; ["3","23"] -> "3 in 23". */
function pageList(pages: string[]): string {
  const n = pages.map(Number);
  if (n.length > 2 && n.every((x, i) => i === 0 || x === n[i - 1] + 1)) return `${n[0]}–${n[n.length - 1]}`;
  return n.length > 1 ? `${pages.slice(0, -1).join(", ")} in ${pages[pages.length - 1]}` : pages.join("");
}

export type CatalogAnswer = { text: string; productIds: string[] };

/** Current offers of one catalog, or an honest expiry note (dates written out by the server). */
export function catalogAnswer(c: Catalog, now: Date = new Date()): CatalogAnswer {
  const name = catalogShortTitle(c);
  const items = activeProductsInCatalog(c.id, now);
  const v = catalogValidity(c, now);
  const restriction = c.availability ? ` (${c.availability.charAt(0).toLowerCase()}${c.availability.slice(1).replace(/\.$/, "")})` : "";
  if (items.length) {
    const ref = referenceDate(now);
    const running = c.pageRules.filter((r) => r.from <= ref && ref <= r.to);
    const pages = running.flatMap((r) => r.printedLabels.map((l, i) => l ?? String(r.pdfPages[i])));
    const partial =
      v.state === "partial" && running.length
        ? `Splošna ponudba kataloga ${name} je veljala ${v.period}, ponudba na ${pages.length > 1 ? "straneh" : "strani"} ${pageList(pages)} pa velja do ${formatDate(running[0].to)}. `
        : "";
    return { text: `${partial}Iz kataloga ${name}${restriction} so v aktualni ponudbi:`, productIds: items.map((p) => p.id) };
  }
  const ref = referenceDate(now);
  if (ref < c.validFrom) return { text: `Katalog ${name} velja šele od ${formatDate(c.validFrom)}.`, productIds: [] };
  return {
    text: `Ponudba kataloga ${name} (${v.period}) je potekla, zato njegovih cen ne prikazujem kot aktualnih. Katalog si lahko še vedno ogledaš v letaku.`,
    productIds: [],
  };
}

/**
 * "Kaj je novega v katalogu?": current offers with a printed NOVO badge; when there are none, the offers that
 * started with the newest catalogs (their validFrom is the latest start date). Never a made-up "new" flag.
 */
export function newInCatalog(now: Date = new Date()): { text: string; products: Product[] } {
  const list = activeProducts(now);
  const printed = list.filter((p) => p.isNew);
  if (printed.length) return { text: "Novo v aktualni ponudbi (z oznako NOVO v katalogu):", products: printed };
  const starts = list.map((p) => getPrimaryOffer(p.id)!.validity.from ?? "").sort().reverse();
  const newest = starts[0];
  const fresh = list.filter((p) => getPrimaryOffer(p.id)!.validity.from === newest);
  return { text: `Nova ponudba, ki velja od ${newest ? formatShortDate(newest) : "začetka novih katalogov"}:`, products: fresh };
}
