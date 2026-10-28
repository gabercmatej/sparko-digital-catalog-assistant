/**
 * Validates src/data/catalog.json (version 2: several catalogs) and src/data/future-promos.json (DEMO MOCK):
 * schema, referential integrity, per-catalog page/placement geometry, asset paths (exact case) + real WebP
 * dimensions, price/discount consistency, validity dates, isNew/newSource consistency, whole-pack recipe totals
 * and the future-promo rules (price below the current offer, dates after the catalog's validity, inside the period).
 * Exit code 1 on any error.
 *
 * Run: npx tsx scripts/validate-data.ts   (npm run validate:data)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import raw from "../src/data/catalog.json";
import rawPromos from "../src/data/future-promos.json";
import rawLeaflets from "../src/data/leaflets.json";
import { catalogDataSchema, futurePromoDataSchema, leafletDataSchema } from "../src/lib/schemas";

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
if (catalogs.length < 2) warn(`expected 2 catalogs (SPAR + INTERSPAR), found ${catalogs.length}`);
if (catalogs[0]?.retailer !== "spar") warn("first catalog is expected to be the SPAR one");

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

// ------------------------------------------------------------- browse-only leaflets (Home carousel, leaflets.json)
const leafletParsed = leafletDataSchema.safeParse(rawLeaflets);
if (!leafletParsed.success) {
  for (const issue of leafletParsed.error.issues) err(`leaflets schema: ${issue.path.join(".")}: ${issue.message}`);
} else {
  const leaflets = leafletParsed.data.leaflets;
  unique("leaflet", leaflets.map((l) => l.id));
  for (const l of leaflets) if (catalogById.has(l.id)) err(`leaflet ${l.id}: id also used by a product-data catalog`);
  unique("leaflet homeOrder", leaflets.map((l) => String(l.homeOrder)));
  for (const l of leaflets) {
    if (!existsExactCase(l.pdfUrl)) err(`leaflet ${l.id}: pdfUrl missing: ${l.pdfUrl}`);
    if (!l.pdfUrl.startsWith(`/catalog/${l.id}/`)) err(`leaflet ${l.id}: pdfUrl outside /catalog/${l.id}/`);
    checkImage(`leaflet ${l.id} cover`, l.cover);
    if (l.pages.length !== l.pageCount) err(`leaflet ${l.id}: ${l.pages.length} page entries but pageCount=${l.pageCount}`);
    if (l.validFrom > l.validTo) err(`leaflet ${l.id}: validFrom ${l.validFrom} after validTo ${l.validTo}`);
    if (!fs.existsSync(path.join(ROOT, l.sourceFile))) warn(`leaflet ${l.id}: source file ${l.sourceFile} not found in repo root`);
    l.pages.forEach((pg, i) => {
      if (pg.pdfPageIndex !== i || pg.pdfPageNumber !== i + 1) err(`leaflet ${l.id}: page ${i} out of order`);
      checkImage(`${l.id} page ${pg.pdfPageNumber} image`, pg.image);
      checkImage(`${l.id} page ${pg.pdfPageNumber} thumb`, pg.thumb);
    });
  }
  for (const pl of placements) if (leaflets.some((l) => l.id === pl.catalogId)) err(`placement ${pl.id}: browse-only leaflet ${pl.catalogId} must not carry placements`);
  for (const o of offers) if (leaflets.some((l) => l.id === o.catalogId)) err(`offer ${o.id}: browse-only leaflet ${o.catalogId} must not carry offers`);
  console.log(`Letaki na Domov (samo listanje): ${leaflets.map((l) => `${l.title} (${l.pageCount} str.)`).join(", ")}`);
}

// ------------------------------------------------------------- products, offers, placements
const offersByProduct = new Map<string, typeof offers>();
for (const o of offers) offersByProduct.set(o.productId, [...(offersByProduct.get(o.productId) ?? []), o]);
const referencedImages = new Set<string>();
for (const p of products) {
  checkImage(`product ${p.id}`, p.image);
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
  if (v.status !== "unknown" && !v.evidence) err(`offer ${o.id}: validity ${v.status} without evidence`);
  if (v.status === "unknown" && (v.from || v.to)) err(`offer ${o.id}: unknown validity must not carry dates`);
  if (cat && v.from && v.from < cat.validFrom) err(`offer ${o.id}: validity starts ${v.from} before catalog ${cat.validFrom}`);
  if (cat && v.to && v.to > cat.validTo) err(`offer ${o.id}: validity ends ${v.to} after the general catalog validity ${cat.validTo}`);
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
  for (const f of fs.readdirSync(productDir)) if (!referencedImages.has(`/products/${f}`)) warn(`unreferenced packshot public/products/${f}`);

const percentOffers = offers.filter((o) => o.discountPercent !== null).length;
if (percentOffers < 10) err(`only ${percentOffers} offers with a printed discount percentage (need >= 10 for the discount ranking)`);
const newCount = products.filter((p) => p.isNew).length;
if (newCount < 6 || newCount > 8) warn(`${newCount} products flagged isNew (6-8 expected)`);

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
    const cat = catalogById.get(p.catalogId);
    if (cat && p.validFrom <= cat.validTo) err(`future promo ${p.id}: validFrom ${p.validFrom} not after catalog validTo ${cat.validTo}`);
    if (p.regularPriceCents !== null) {
      if (p.regularPriceCents < p.priceCents) err(`future promo ${p.id}: regular price below promo price`);
      const computed = Math.round(((p.regularPriceCents - p.priceCents) / p.regularPriceCents) * 100);
      if (p.discountPercent !== null && Math.abs(computed - p.discountPercent) > 1)
        err(`future promo ${p.id}: discountPercent ${p.discountPercent} vs computed ${computed}`);
    } else if (p.discountPercent !== null) err(`future promo ${p.id}: discountPercent without regular price`);
  }
  const ptuj = fp.promos.filter((p) => /perutnina ptuj/i.test(products.find((x) => x.id === p.productId)?.brand ?? "")).length;
  if (ptuj < 3) warn(`future promos: only ${ptuj} Perutnina Ptuj promos (>= 3 expected)`);
  promoLines.push(`Prihodnje akcije (DEMO MOCK): ${fp.promos.length}, obdobje ${fp.period.from} – ${fp.period.to}, Perutnina Ptuj: ${ptuj}`);
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
    for (const l of promoLines) console.log(l);
  }
  for (const w of warnings) console.warn(`WARN  ${w}`);
  for (const e of errors) console.error(`ERROR ${e}`);
  console.log(errors.length ? `\n${errors.length} error(s)` : "\nOK – no errors");
  process.exit(errors.length ? 1 : 0);
}
