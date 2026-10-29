/**
 * Validates src/data/catalog.json (version 3: the six catalogs of the V3.1 indexing), its audit trail
 * src/data/catalog-sources.json, src/data/historical.json (earlier catalogs, never current) and
 * src/data/future-promos.json (DEMO MOCK): schema, referential integrity, per-catalog page/placement geometry,
 * asset paths (exact case) + real WebP dimensions, price/discount consistency (no regular price or percentage
 * that is not consistent with the printed price), offer-level validity (general dates, page rules mapped through
 * printed page labels, printed per-offer dates with evidence), store restrictions (DESPAR Koper, SPAR Online),
 * per-page coverage (indexed + excluded = printed offers), whole-pack recipe totals and the future-promo rules.
 * Exit code 1 on any error.
 *
 * Run: npx tsx scripts/validate-data.ts   (npm run validate:data)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import raw from "../src/data/catalog.json";
import rawSources from "../src/data/catalog-sources.json";
import rawPromos from "../src/data/future-promos.json";
import rawHistorical from "../src/data/historical.json";
import { catalogDataSchema, futurePromoDataSchema, historicalDataSchema } from "../src/lib/schemas";

type Sources = {
  products: Record<string, { imageProvenance: string }>;
  offers: Record<string, { sourceQuote: string; validityEvidence: string | null; verificationMethod: string; verificationNotes: string | null }>;
  excluded: Record<string, { page: number; text?: string; reason?: string }[]>;
  pages: Record<string, Record<string, { theme: string | null; offersOnPage: number | null; notes: string | null }>>;
};
const sources = rawSources as unknown as Sources;
/** Reference date of the release ("today" for the current / expired checks). */
const REFERENCE_DATE = "2026-10-28";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const errors: string[] = [];
const warnings: string[] = [];
const err = (m: string) => errors.push(m);
const warn = (m: string) => warnings.push(m);

const parsed = catalogDataSchema.safeParse(raw);
if (!parsed.success) {
  for (const issue of parsed.error.issues) err(`schema: ${issue.path.join(".")}: ${issue.message}`);
  report();
}
const data = parsed.data!;
const { catalogs, products, offers, placements, recipes } = data;

// ------------------------------------------------------------- unique IDs
function unique(kind: string, ids: string[]) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) err(`duplicate ${kind} id: ${id}`);
    seen.add(id);
  }
  return seen;
}
unique("catalog", catalogs.map((c) => c.id));
const productIds = unique("product", products.map((p) => p.id));
unique("offer", offers.map((o) => o.id));
unique("placement", placements.map((p) => p.id));
unique("recipe", recipes.map((r) => r.id));
if (catalogs.length !== 6) err(`expected the 6 catalogs of V3.1, found ${catalogs.length}`);
if (catalogs[0]?.id !== "spar-4426") warn("first catalog (Home order) is expected to be SPAR 44/26");
unique("catalog homeOrder", catalogs.map((c) => String(c.homeOrder)));

// ------------------------------------------------------------- asset helpers
/** Exists with exact case on every path segment (Vercel is case-sensitive). */
function existsExactCase(publicPath: string): boolean {
  const parts = publicPath.replace(/^\//, "").split("/");
  let dir = PUBLIC;
  for (const part of parts) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
    if (!fs.readdirSync(dir).includes(part)) return false;
    dir = path.join(dir, part);
  }
  return true;
}

/** Minimal WebP header parser (VP8 lossy, VP8L lossless, VP8X extended). */
function webpSize(file: string): { width: number; height: number } | null {
  const b = fs.readFileSync(file);
  if (b.length < 30 || b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  }
  return null;
}

function checkImage(label: string, img: { src: string; width: number; height: number }) {
  if (!existsExactCase(img.src)) {
    err(`${label}: missing asset (exact case) ${img.src}`);
    return;
  }
  if (!img.src.endsWith(".webp")) {
    warn(`${label}: not a WebP, dimensions not verified (${img.src})`);
    return;
  }
  const size = webpSize(path.join(PUBLIC, img.src));
  if (!size) err(`${label}: unreadable WebP header ${img.src}`);
  else if (size.width !== img.width || size.height !== img.height)
    err(`${label}: ${img.src} is ${size.width}x${size.height}, JSON says ${img.width}x${img.height}`);
}

// ------------------------------------------------------------- catalogs & pages
const catalogById = new Map(catalogs.map((c) => [c.id, c]));
const pageKeys = new Set<string>();
for (const c of catalogs) {
  if (!existsExactCase(c.pdfUrl)) err(`catalog ${c.id}: pdfUrl missing: ${c.pdfUrl}`);
  if (!c.pdfUrl.startsWith(`/catalog/${c.id}/`)) warn(`catalog ${c.id}: pdfUrl outside /catalog/${c.id}/ (${c.pdfUrl})`);
  checkImage(`catalog ${c.id} cover`, c.cover);
  if (c.pages.length !== c.pageCount) err(`catalog ${c.id}: ${c.pages.length} page entries but pageCount=${c.pageCount}`);
  if (c.validFrom > c.validTo) err(`catalog ${c.id}: validFrom ${c.validFrom} after validTo ${c.validTo}`);
  if (!fs.existsSync(path.join(ROOT, c.sourceFile))) warn(`catalog ${c.id}: source file ${c.sourceFile} not found in repo root`);
  if (c.homeOrder === null) err(`catalog ${c.id}: current catalogs need a homeOrder`);
  for (const r of c.pageRules) {
    if (r.from > r.to) err(`catalog ${c.id}: page rule ${r.pdfPages.join(",")} from after to`);
    if (r.to <= c.validTo) warn(`catalog ${c.id}: page rule ${r.pdfPages.join(",")} does not extend the general validity`);
    r.pdfPages.forEach((n, i) => {
      if (n < 1 || n > c.pageCount) err(`catalog ${c.id}: page rule page ${n} outside 1..${c.pageCount}`);
      const label = c.pages[n - 1]?.printedPageLabel ?? null;
      if (label !== r.printedLabels[i]) err(`catalog ${c.id}: page rule PDF page ${n} printed label ${r.printedLabels[i]} != page label ${label}`);
    });
  }
  if ((c.retailer === "despar" || c.retailer === "spar-online") && !c.availability) err(`catalog ${c.id}: ${c.retailer} needs its store restriction`);
  const idx = new Set<number>();
  for (const p of c.pages) {
    if (idx.has(p.pdfPageIndex)) err(`catalog ${c.id}: duplicate page index ${p.pdfPageIndex}`);
    idx.add(p.pdfPageIndex);
    pageKeys.add(`${c.id}:${p.pdfPageIndex}`);
    if (p.pdfPageNumber !== p.pdfPageIndex + 1) err(`catalog ${c.id} page ${p.pdfPageIndex}: pdfPageNumber must be index+1`);
    if (p.pdfPageIndex >= c.pageCount) err(`catalog ${c.id} page ${p.pdfPageIndex}: index beyond pageCount`);
    checkImage(`${c.id} page ${p.pdfPageNumber} image`, p.image);
    checkImage(`${c.id} page ${p.pdfPageNumber} thumb`, p.thumb);
  }
}

// ------------------------------------------------------------- historical data (SPAR 41/26, INTERSPAR 14/26)
const histParsed = historicalDataSchema.safeParse(rawHistorical);
const histImages = new Set<string>();
if (!histParsed.success) {
  for (const issue of histParsed.error.issues) err(`historical schema: ${issue.path.join(".")}: ${issue.message}`);
} else {
  const h = histParsed.data;
  const earliestCurrent = catalogs.map((c) => c.validFrom).sort()[0];
  for (const c of h.catalogs) {
    if (catalogById.has(c.id)) err(`historical catalog ${c.id}: id also used by a current catalog`);
    if (!existsExactCase(c.pdfUrl)) err(`historical catalog ${c.id}: pdfUrl missing: ${c.pdfUrl}`);
    if (c.homeOrder !== null) err(`historical catalog ${c.id}: must not be on Home`);
  }
  for (const p of h.products) {
    if (productIds.has(p.id)) err(`historical product ${p.id}: id also used by a current product`);
    if (!existsExactCase(p.image.src)) err(`historical product ${p.id}: missing packshot ${p.image.src}`);
    histImages.add(p.image.src);
  }
  for (const o of h.offers)
    if (!o.validity.to || o.validity.to >= earliestCurrent) err(`historical offer ${o.id}: must end before the current catalogs (${o.validity.to})`);
  console.log(`Zgodovinski podatki (samo shranjeni izdelki): ${h.catalogs.map((c) => c.title).join(", ")} – ${h.products.length} izdelkov`);
}

// ------------------------------------------------------------- products, offers, placements
const offersByProduct = new Map<string, typeof offers>();
for (const o of offers) offersByProduct.set(o.productId, [...(offersByProduct.get(o.productId) ?? []), o]);
const referencedImages = new Set<string>();
for (const p of products) {
  checkImage(`product ${p.id}`, p.image);
  if (!sources.products[p.id]?.imageProvenance) err(`product ${p.id}: no packshot provenance in catalog-sources.json`);
  if (!p.identityKey) err(`product ${p.id}: identityKey missing`);
  referencedImages.add(p.image.src);
  const own = offersByProduct.get(p.id) ?? [];
  if (own.length === 0) err(`product ${p.id}: no offer`);
  else if (own.length > 1) err(`product ${p.id}: ${own.length} offers (exactly one primary offer expected)`);
  if (p.isNew && p.newSource === null) err(`product ${p.id}: isNew without newSource`);
  if (!p.isNew && p.newSource !== null) err(`product ${p.id}: newSource ${p.newSource} but isNew is false`);
}
const offerById = new Map(offers.map((o) => [o.id, o]));
for (const o of offers) {
  if (!productIds.has(o.productId)) err(`offer ${o.id}: unknown product ${o.productId}`);
  const cat = catalogById.get(o.catalogId);
  if (!cat) err(`offer ${o.id}: unknown catalog ${o.catalogId}`);
  if (!placements.some((pl) => pl.offerId === o.id)) err(`offer ${o.id}: no placement`);
  if (o.priceKind === "loyalty_price" && !o.conditions.spPlusRequired) err(`offer ${o.id}: loyalty_price without spPlusRequired`);
  const src = sources.offers[o.id];
  if (!src?.sourceQuote) err(`offer ${o.id}: no printed source quote in catalog-sources.json`);
  else {
    const e = Math.floor(o.priceCents / 100);
    const c2 = String(o.priceCents % 100).padStart(2, "0");
    if (!src.sourceQuote.includes(`${e},${c2}`) && !src.sourceQuote.includes(`${e} ${c2}`)) warn(`offer ${o.id}: price ${e},${c2} not in its source quote`);
  }
  if (o.verification.status !== "verified") warn(`offer ${o.id}: verification ${o.verification.status}`);
  if (cat && (cat.retailer === "despar" || cat.retailer === "spar-online") && !o.availability.restricted)
    err(`offer ${o.id}: ${cat.title} offers must carry the store restriction`);
  if (o.availability.restricted && !o.availability.note) err(`offer ${o.id}: restricted without a note`);
  if (o.priceKind === "coupon_price" && !o.conditions.couponRequired) err(`offer ${o.id}: coupon_price without couponRequired`);
  if (o.regularPriceCents !== null && o.regularPriceCents <= o.priceCents)
    err(`offer ${o.id}: regular price ${o.regularPriceCents} not above price ${o.priceCents}`);
  if (o.regularPriceCents !== null && o.discountPercent !== null) {
    const computed = Math.round((1 - o.priceCents / o.regularPriceCents) * 100);
    if (Math.abs(computed - o.discountPercent) > 2)
      err(`offer ${o.id}: printed ${o.discountPercent}% vs computed ${computed}% from prices`);
  } else if (o.discountPercent !== null) {
    warn(`offer ${o.id}: discountPercent without regular price`);
  }
  const v = o.validity;
  if (v.from && v.to && v.from > v.to) err(`offer ${o.id}: validity from ${v.from} after to ${v.to}`);
  if (v.status === "explicit" && (!v.from || !v.to)) warn(`offer ${o.id}: explicit validity without both dates`);
  if (v.status !== "unknown" && !src?.validityEvidence) err(`offer ${o.id}: validity ${v.status} without evidence`);
  if (v.status === "unknown" && (v.from || v.to)) err(`offer ${o.id}: unknown validity must not carry dates`);
  if (v.status === "unknown") err(`offer ${o.id}: every V3.1 offer needs printed validity`);
  const pl0 = placements.find((pl) => pl.offerId === o.id);
  const rule = cat && pl0 ? cat.pageRules.find((r) => r.pdfPages.includes(pl0.pdfPageNumber)) : undefined;
  if (cat && v.status === "catalog_default" && (v.from !== cat.validFrom || v.to !== cat.validTo))
    err(`offer ${o.id}: catalog_default validity ${v.from}..${v.to} differs from the catalog ${cat.validFrom}..${cat.validTo}`);
  if (cat && rule && v.status === "catalog_default") err(`offer ${o.id}: page ${pl0!.pdfPageNumber} has a page rule (${rule.to}) but the offer uses the general dates`);
  if (cat && v.to && v.to > cat.validTo && !rule && !(src?.validityEvidence ?? "").includes("»"))
    err(`offer ${o.id}: validity ends ${v.to} after the general catalog validity ${cat.validTo} without a page rule or printed evidence`);
  if (cat && v.from && v.from < cat.validFrom) warn(`offer ${o.id}: printed validity starts ${v.from} before the catalog ${cat.validFrom} (${src?.validityEvidence?.slice(0, 80)})`);
}
for (const pl of placements) {
  const o = offerById.get(pl.offerId);
  if (!o) err(`placement ${pl.id}: unknown offer ${pl.offerId}`);
  const cat = catalogById.get(pl.catalogId);
  if (!cat) err(`placement ${pl.id}: unknown catalog ${pl.catalogId}`);
  if (o && o.catalogId !== pl.catalogId) err(`placement ${pl.id}: catalogId ${pl.catalogId} != offer catalogId ${o.catalogId}`);
  const page = cat?.pages.find((p) => p.pdfPageIndex === pl.pdfPageIndex);
  if (cat && !page) err(`placement ${pl.id}: page index ${pl.pdfPageIndex} not in catalog ${pl.catalogId}`);
  if (cat && pl.pdfPageIndex >= cat.pageCount) err(`placement ${pl.id}: page index ${pl.pdfPageIndex} beyond pageCount ${cat.pageCount}`);
  if (pl.pdfPageNumber !== pl.pdfPageIndex + 1) err(`placement ${pl.id}: pdfPageNumber must be index+1`);
  if (page && pl.printedPageLabel !== page.printedPageLabel)
    warn(`placement ${pl.id}: printedPageLabel ${pl.printedPageLabel} differs from page (${page.printedPageLabel})`);
  const b = pl.bbox;
  const eps = 1e-6;
  if (b.x < 0 || b.y < 0 || b.x + b.width > 1 + eps || b.y + b.height > 1 + eps)
    err(`placement ${pl.id}: bbox out of [0,1] (${JSON.stringify(b)})`);
}
// no overlapping boxes on the same page
const byPage = new Map<string, typeof placements>();
for (const pl of placements) byPage.set(`${pl.catalogId}:${pl.pdfPageIndex}`, [...(byPage.get(`${pl.catalogId}:${pl.pdfPageIndex}`) ?? []), pl]);
for (const list of byPage.values())
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i].bbox;
      const c = list[j].bbox;
      if (a.x < c.x + c.width && c.x < a.x + a.width && a.y < c.y + c.height && c.y < a.y + a.height)
        warn(`placements ${list[i].id} and ${list[j].id} overlap`);
    }

// packshots on disk that no product references (stale assets)
const productDir = path.join(PUBLIC, "products");
if (fs.existsSync(productDir))
  for (const f of fs.readdirSync(productDir))
    if (!referencedImages.has(`/products/${f}`) && !histImages.has(`/products/${f}`)) warn(`unreferenced packshot public/products/${f}`);

const percentOffers = offers.filter((o) => o.discountPercent !== null).length;
if (percentOffers < 10) err(`only ${percentOffers} offers with a printed discount percentage (need >= 10 for the discount ranking)`);
if (products.some((p) => p.newSource === "demo_editorial")) err("V3.1 data must not contain demo_editorial NOVO flags (printed badges only)");

// ------------------------------------------------------------- coverage (indexed + excluded = printed offers per page)
const coverageLines: string[] = [];
for (const c of catalogs) {
  const pages = sources.pages[c.id] ?? {};
  const excluded = sources.excluded[c.id] ?? [];
  let printed = 0;
  for (let n = 1; n <= c.pageCount; n++) {
    const pg = pages[String(n)];
    if (!pg) {
      err(`coverage ${c.id}: PDF page ${n} has no coverage entry`);
      continue;
    }
    const indexed = placements.filter((pl) => pl.catalogId === c.id && pl.pdfPageNumber === n).length;
    const ex = excluded.filter((e) => e.page === n).length;
    if (pg.offersOnPage === null) warn(`coverage ${c.id}: PDF page ${n} has no printed-offer count`);
    else if (pg.offersOnPage !== indexed + ex) err(`coverage ${c.id}: PDF page ${n} prints ${pg.offersOnPage} offers, indexed ${indexed} + excluded ${ex}`);
    printed += pg.offersOnPage ?? 0;
  }
  const own = offers.filter((o) => o.catalogId === c.id);
  const current = own.filter((o) => o.validity.from! <= REFERENCE_DATE && REFERENCE_DATE <= o.validity.to!).length;
  coverageLines.push(`  ${c.title}: natisnjenih ${printed}, indeksiranih ${own.length}, izločenih ${excluded.length}, aktualnih ${REFERENCE_DATE}: ${current}`);
}

// ------------------------------------------------------------- recipes
const recipeTotals: string[] = [];
for (const r of recipes) {
  let total = 0;
  let worst = 0; // at regular price for card/coupon-only lines
  for (const ing of r.ingredients) {
    const o = offerById.get(ing.offerId);
    if (!o) {
      err(`recipe ${r.id}: unknown offer ${ing.offerId}`);
      continue;
    }
    if (o.priceUnit !== "pack") err(`recipe ${r.id}: ${o.id} is priced per ${o.priceUnit}, recipes use whole packs only`);
    const conditional = o.conditions.spPlusRequired || o.conditions.couponRequired;
    total += ing.packsNeeded * o.priceCents;
    if (conditional) {
      if (o.regularPriceCents === null) {
        err(`recipe ${r.id}: ${o.id} needs card/coupon but has no known regular price`);
        worst += ing.packsNeeded * o.priceCents;
      } else worst += ing.packsNeeded * o.regularPriceCents;
    } else worst += ing.packsNeeded * o.priceCents;
  }
  if (r.budgetCents !== null) {
    if (total > r.budgetCents) err(`recipe ${r.id}: total ${total} > budget ${r.budgetCents}`);
    if (worst > r.budgetCents) err(`recipe ${r.id}: total at regular prices ${worst} > budget ${r.budgetCents}`);
  }
  if (r.pantryAssumptions.length === 0) warn(`recipe ${r.id}: no pantry assumptions listed`);
  recipeTotals.push(
    `  ${r.id}: ${fmt(total)} (brez kartice ${fmt(worst)})${r.budgetCents !== null ? ` / proračun ${fmt(r.budgetCents)}` : ""}, ${r.servings} porcije`,
  );
}
for (const kind of ["dinner", "lunch", "breakfast"] as const)
  if (!recipes.some((r) => r.kind === kind)) warn(`no ${kind} recipe`);

// ------------------------------------------------------------- future promos (DEMO MOCK)
const promoLines: string[] = [];
const promoParsed = futurePromoDataSchema.safeParse(rawPromos);
if (!promoParsed.success) {
  for (const issue of promoParsed.error.issues) err(`future-promos schema: ${issue.path.join(".")}: ${issue.message}`);
} else {
  const fp = promoParsed.data;
  if (fp.period.from > fp.period.to) err(`future-promos: period from ${fp.period.from} after to ${fp.period.to}`);
  unique("future promo", fp.promos.map((p) => p.id));
  const offerOfProduct = new Map(offers.map((o) => [o.productId, o]));
  if (!fp.mock) err("future-promos must stay marked as DEMO MOCK");
  for (const p of fp.promos) {
    const o = offerOfProduct.get(p.productId);
    if (!o) {
      err(`future promo ${p.id}: unknown product ${p.productId}`);
      continue;
    }
    if (p.catalogId !== o.catalogId) err(`future promo ${p.id}: catalogId ${p.catalogId} != offer catalogId ${o.catalogId}`);
    if (p.priceCents >= o.priceCents) err(`future promo ${p.id}: price ${p.priceCents} not below current offer price ${o.priceCents}`);
    if (p.validFrom > p.validTo) err(`future promo ${p.id}: validFrom after validTo`);
    if (p.validFrom < fp.period.from || p.validTo > fp.period.to) err(`future promo ${p.id}: dates outside period ${fp.period.from}..${fp.period.to}`);
    if (o.validity.to && p.validFrom <= o.validity.to) err(`future promo ${p.id}: validFrom ${p.validFrom} not after the current offer's validity ${o.validity.to}`);
    if (p.regularPriceCents !== null) {
      if (p.regularPriceCents < p.priceCents) err(`future promo ${p.id}: regular price below promo price`);
      const computed = Math.round(((p.regularPriceCents - p.priceCents) / p.regularPriceCents) * 100);
      if (p.discountPercent !== null && Math.abs(computed - p.discountPercent) > 1)
        err(`future promo ${p.id}: discountPercent ${p.discountPercent} vs computed ${computed}`);
    } else if (p.discountPercent !== null) err(`future promo ${p.id}: discountPercent without regular price`);
  }
  promoLines.push(`Prihodnje akcije (DEMO MOCK, simulirano): ${fp.promos.length}, obdobje ${fp.period.from} – ${fp.period.to}`);
}

function fmt(c: number) {
  return (c / 100).toFixed(2).replace(".", ",") + " €";
}

report();

function report(): never {
  if (parsed.success) {
    for (const c of data.catalogs) {
      const n = data.offers.filter((o) => o.catalogId === c.id).length;
      console.log(`Katalog: ${c.title} (${c.pages.length}/${c.pageCount} strani, ${c.validFrom} – ${c.validTo}), ponudb: ${n}`);
    }
    console.log(`Izdelki: ${data.products.length}, ponudbe: ${data.offers.length}, umestitve: ${data.placements.length}, recepti: ${data.recipes.length}`);
    const loyalty = data.offers.filter((o) => o.conditions.spPlusRequired).length;
    const explicit = data.offers.filter((o) => o.validity.status === "explicit").length;
    const isNew = data.products.filter((p) => p.isNew);
    console.log(`  s SPAR plus kartico: ${loyalty}, s tiskanim popustom: ${percentOffers}, z izrecno veljavnostjo: ${explicit}`);
    console.log(`  novo: ${isNew.length} (printed_badge: ${isNew.filter((p) => p.newSource === "printed_badge").length}, demo_editorial: ${isNew.filter((p) => p.newSource === "demo_editorial").length})`);
    if (recipeTotals.length) console.log("Recepti:\n" + recipeTotals.join("\n"));
    if (coverageLines.length) console.log("Pokritost:\n" + coverageLines.join("\n"));
    for (const l of promoLines) console.log(l);
  }
  for (const w of warnings) console.warn(`WARN  ${w}`);
  for (const e of errors) console.error(`ERROR ${e}`);
  console.log(errors.length ? `\n${errors.length} error(s)` : "\nOK – no errors");
  process.exit(errors.length ? 1 : 0);
}
