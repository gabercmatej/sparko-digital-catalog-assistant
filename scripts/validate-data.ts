/**
 * Validates src/data/catalog.json: schema, referential integrity, page/placement geometry,
 * asset paths (exact case) + real WebP dimensions, price/discount consistency, validity dates
 * and whole-pack recipe totals. Exit code 1 on any error.
 *
 * Run: npx tsx scripts/validate-data.ts   (npm run validate:data)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import raw from "../src/data/catalog.json";
import { catalogDataSchema } from "../src/lib/schemas";

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
const { catalog, products, offers, placements, recipes } = data;

// ------------------------------------------------------------- unique IDs
function unique(kind: string, ids: string[]) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) err(`duplicate ${kind} id: ${id}`);
    seen.add(id);
  }
  return seen;
}
const productIds = unique("product", products.map((p) => p.id));
unique("offer", offers.map((o) => o.id));
unique("placement", placements.map((p) => p.id));
unique("recipe", recipes.map((r) => r.id));
unique("page", catalog.pages.map((p) => String(p.pdfPageIndex)));

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

// ------------------------------------------------------------- catalog & pages
if (!existsExactCase(catalog.pdfUrl)) err(`catalog.pdfUrl missing: ${catalog.pdfUrl}`);
if (catalog.pages.length !== catalog.pageCount) err(`pages: ${catalog.pages.length} entries but pageCount=${catalog.pageCount}`);
const pageByIndex = new Map(catalog.pages.map((p) => [p.pdfPageIndex, p]));
for (const p of catalog.pages) {
  if (p.pdfPageNumber !== p.pdfPageIndex + 1) err(`page ${p.pdfPageIndex}: pdfPageNumber must be index+1`);
  if (p.pdfPageIndex >= catalog.pageCount) err(`page ${p.pdfPageIndex}: index beyond pageCount`);
  checkImage(`page ${p.pdfPageNumber} image`, p.image);
  checkImage(`page ${p.pdfPageNumber} thumb`, p.thumb);
}

// ------------------------------------------------------------- products, offers, placements
for (const p of products) {
  checkImage(`product ${p.id}`, p.image);
  if (!offers.some((o) => o.productId === p.id)) err(`product ${p.id}: no offer`);
}
const offerById = new Map(offers.map((o) => [o.id, o]));
for (const o of offers) {
  if (!productIds.has(o.productId)) err(`offer ${o.id}: unknown product ${o.productId}`);
  if (o.catalogId !== catalog.id) err(`offer ${o.id}: catalogId ${o.catalogId} != ${catalog.id}`);
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
}
for (const pl of placements) {
  const o = offerById.get(pl.offerId);
  if (!o) err(`placement ${pl.id}: unknown offer ${pl.offerId}`);
  const page = pageByIndex.get(pl.pdfPageIndex);
  if (!page) err(`placement ${pl.id}: page index ${pl.pdfPageIndex} not in catalog.pages`);
  if (pl.pdfPageNumber !== pl.pdfPageIndex + 1) err(`placement ${pl.id}: pdfPageNumber must be index+1`);
  if (page && pl.printedPageLabel !== page.printedPageLabel)
    warn(`placement ${pl.id}: printedPageLabel ${pl.printedPageLabel} differs from page (${page.printedPageLabel})`);
  const b = pl.bbox;
  const eps = 1e-6;
  if (b.x < 0 || b.y < 0 || b.x + b.width > 1 + eps || b.y + b.height > 1 + eps)
    err(`placement ${pl.id}: bbox out of [0,1] (${JSON.stringify(b)})`);
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

function fmt(c: number) {
  return (c / 100).toFixed(2).replace(".", ",") + " €";
}

report();

function report(): never {
  if (parsed.success) {
    console.log(`Katalog: ${data.catalog.title} (${data.catalog.pages.length}/${data.catalog.pageCount} strani)`);
    console.log(`Izdelki: ${data.products.length}, ponudbe: ${data.offers.length}, umestitve: ${data.placements.length}, recepti: ${data.recipes.length}`);
    const loyalty = data.offers.filter((o) => o.conditions.spPlusRequired).length;
    const explicit = data.offers.filter((o) => o.validity.status === "explicit").length;
    console.log(`  s SPAR plus kartico: ${loyalty}, z izrecno veljavnostjo: ${explicit}`);
    if (recipeTotals.length) console.log("Recepti:\n" + recipeTotals.join("\n"));
  }
  for (const w of warnings) console.warn(`WARN  ${w}`);
  for (const e of errors) console.error(`ERROR ${e}`);
  console.log(errors.length ? `\n${errors.length} error(s)` : "\nOK – no errors");
  process.exit(errors.length ? 1 : 0);
}
