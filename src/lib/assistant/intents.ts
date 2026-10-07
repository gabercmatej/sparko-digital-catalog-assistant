/**
 * Intent detection from the latest user message plus recent product context.
 * Pure and deterministic. Read-only intents never produce save/remove actions.
 */
import { getProduct } from "@/lib/catalog";
import type { ChatRequestMessage } from "@/lib/types";
import { fold } from "./normalize";
import { detectFilters, queryContentTokens, searchProducts, type SearchFilters } from "./search";
import { findStoreSection } from "@/lib/demo/storeMap";
import { ASK_PRODUCT_TEXT, ASK_STORE_PRODUCT_TEXT } from "./starters";

export type Intent =
  | "greeting"
  | "thanks"
  | "how_are_you"
  | "help"
  | "out_of_scope"
  | "save"
  | "remove"
  | "where_in_leaflet"
  | "nearest_store"
  | "store_location"
  | "cheaper"
  | "discounts"
  | "breakfast"
  | "meal"
  | "recommend"
  | "line"
  | "price_lookup"
  | "unknown_product";

export type MealKind = "dinner" | "lunch" | "any";

export type DetectedIntent = {
  intent: Intent;
  /** Folded latest user text. */
  folded: string;
  /** Raw latest user text. */
  text: string;
  filters: SearchFilters;
  /** Product ids from the most recent message that carried context (validated against the catalog). */
  contextProductIds: string[];
  meal?: { kind: MealKind; servings: number | null; budgetCents: number | null };
};

/** Verbs/words that should not be treated as product words for each command intent. */
export const COMMAND_STOP = new Set([
  "dodaj",
  "dodajte",
  "dodam",
  "dodas",
  "shrani",
  "shranite",
  "shranim",
  "daj",
  "odstrani",
  "odstranite",
  "izbrisi",
  "izbrisite",
  "odvzemi",
  "kje",
  "najdem",
  "najdes",
  "strani",
  "stran",
  "stran",
  "moj",
  "moja",
  "moje",
  "mojem",
  "mojega",
  "katalogom",
  "seznam",
  "seznama",
  "seznamu",
  "ga",
  "jo",
  "ju",
  "jih",
  "vse",
  "vsi",
  "nazaj",
  "napisi",
  "napisite",
  "reci",
  "recite",
  "trdi",
  "zapisi",
]);

const NUMBER_WORDS: Record<string, number> = {
  enega: 1,
  eno: 1,
  ena: 1,
  sebe: 1,
  dva: 2,
  dve: 2,
  dvoje: 2,
  dvojico: 2,
  par: 2,
  tri: 3,
  troje: 3,
  stiri: 4,
  stiriclansko: 4,
  pet: 5,
  sest: 6,
};

const RE = {
  greeting: /^(zivjo|zivijo|zdravo|hej|hey|hoj|ojla|pozdravljen\w*|pozdrav|dober (dan|vecer|jutro)|dobro jutro|hello|hi|cao|lp)\b/,
  thanks: /^(hvala\w*|najlepsa hvala|super|odlicno|top|kul|ok(ej)?|v redu|lepo|fajn)\b|\bhvala\b/,
  howAreYou: /\b(kako si|kako gre|kako kaj|kako se imas|kako ti gre)\b/,
  help: /\b(kaj (vse )?(znas|zmores|pocnes|delas)|kaj (vse )?(te )?lahko (vprasam|vprasa\w*|naredis)|kako (mi )?lahko pomagas|pomoc|pomagaj|kdo si|kaj si( ti)?|kako delujes|kaj je sparko)\b/,
  save: /\b(dodaj\w*|shrani(te| mi)?|daj (to |ga |jo )?v (moj )?katalog)\b/,
  remove: /\b(odstrani\w*|izbrisi\w*|odvzemi|vrzi ven)\b/,
  where: /\b(kje (je|so|najdem|bi nasel|v letaku|v katalogu)|v letaku|na kateri strani|katera stran|kateri strani|stran v (letaku|katalogu)|pokazi v (letaku|katalogu)|odpri (v )?(letak|katalog))\b/,
  cheaper: /\b(cenej\w*|najcenej\w*|bolj poceni|kaj je poceni|manj drag\w*|varcnej\w*)\b/,
  discounts: /\b(znizan\w*|znizanj\w*|popust\w*|akcij\w*|razprodaj\w*|prihran\w*|najbolj ugodn\w*|ugodne ponudbe)\b/,
  breakfast: /\b(zajtrk\w*|zajtrkoval\w*|za zjutraj)\b/,
  meal: /\b(vecerj\w*|kosil\w*|obrok\w*|recept\w*|skuham|skuhati|kuhati|kuham|pecem|speci|pripravim|pripraviti|kaj (naj |lahko |bi )?(jem|pojem|pripravim|skuham)|jed\w*)\b/,
  recommend: /\b(priporoc\w*|predlagaj\w*|predlog\w*|svetuj\w*|kaj (mi )?predlagas|podobn\w*)\b/,
  line: /\bsbudget\b/,
  // Store locator (mocked demo data): "Kje je meni najbližji SPAR?", "Kateri SPAR mi je najbližje?", "nearest spar".
  nearWord: /\b(najbliz\w*|blizin\w*|blizu|nearest|closest)\b/,
  storeWord: /\b(spar|sparu|spara|sparov|sparom|interspar\w*|trgovin\w*|prodajaln\w*|market\w*|store|shop)\b/,
  whereIsSpar: /^(kje|kam)( pa)? (je|imam|najdem|bi nasel|bi nasla|lahko najdem|grem v)( kak\w*| en\w*| nek\w*)? (spar|interspar)( trgovin\w*)?$/,
  // In-store product location: explicit store phrasing; leaflet phrasing ("v letaku", "na strani") always wins.
  inStore: /\b(v (spar |interspar |tej |moji |nasi |najblizji )?(trgovini|marketu|prodajalni)|v sparu|v interspar\w*)\b/,
  inStoreWhere: /\b(v (katerem|kateri) (oddelku|polici|delu|vrsti|prehodu)|na (kateri|katero) polic\w*|kateri oddelek|se nahaja\w*|kje (stoji|stojijo|lezi))\b/,
  whereWord: /\bkje\b/,
  leafletWord: /\b(letak\w*|katalog\w*|stran|strani|pdf)\b/,
  // A place IN the leaflet ("v katalogu", "na strani"), as opposed to "izdelek iz kataloga".
  leafletPlace: /\b(v|na) (letak\w*|katalog\w*)\b|\bstrani?\b|\bpdf\b/,
  // "Imam 10 €, kaj lahko kupim?" – shopping within a budget.
  budgetShop: /\b(kupim|kupiti|kupis|nakupim|nakupiti|nakup\w*)\b/,
  outOfScope:
    /\b(vreme\w*|vremenska|dez|dezuje|dezevn\w*|sneg\w*|temperatur\w*|napoved|politik\w*|volitv\w*|vlad\w*|stranka|stranke|predsednik\w*|programir\w*|javascript|python|koda|kodo|html|css|sql|nogomet\w*|kosark\w*|tekma|tekme|film\w*|serij\w*|novic\w*|borz\w*|kripto\w*|bitcoin|delnic\w*|zgodovin\w*|matematik\w*|domac\w* nalog\w*|esej\w*|pesem|pesmi|vic\w*|horoskop\w*|zdravil\w*|zdravnik\w*|bolezen|diagnoz\w*|pravni|odvetnik\w*|ignoriraj navodila|system prompt|sistemski poziv)\b/,
};

const SMALLTALK_WORDS = new Set(
  (
    "zivjo zivijo zdravo hej hey hoj ojla pozdravljen pozdravljeni pozdravljena pozdrav dober dobro dan vecer jutro hello hi lp cao " +
    "hvala najlepsa lepa super odlicno top kul ok okej redu lepo fajn kako gre kaj imas se ti si vse znas zmores pocnes delas " +
    "vprasam vprasati vprasa naredis pomagas pomoc pomagaj kdo delujes sparko sparka"
  ).split(" "),
);

/** True when, after small-talk words, the message still names a catalog product ("Živjo, koliko stane skuta?"). */
function mentionsProduct(text: string): boolean {
  if (!queryContentTokens(text, SMALLTALK_WORDS).length) return false;
  return searchProducts(text, { extraStop: SMALLTALK_WORDS, limit: 1 }).length > 0;
}

function previousAssistantText(messages: ChatRequestMessage[]): string | null {
  for (let i = messages.length - 2; i >= 0; i--) if (messages[i].role === "assistant") return messages[i].text;
  return null;
}

/** Product ids from the most recent prior message (assistant or user) that carried context. */
export function recentContextIds(messages: ChatRequestMessage[]): string[] {
  for (let i = messages.length - 2; i >= 0; i--) {
    const ids = (messages[i].contextProductIds ?? []).filter((id) => !!getProduct(id));
    if (ids.length) return Array.from(new Set(ids));
  }
  // The latest user message itself may carry context (e.g. a product-card button)
  const last = messages[messages.length - 1];
  return Array.from(new Set((last?.contextProductIds ?? []).filter((id) => !!getProduct(id))));
}

export function parseServings(folded: string): number | null {
  const m = folded.match(/\bza\s+(\d{1,2})\b(?!\s*(?:eur|evr|,))/) ?? folded.match(/\b(\d{1,2})\s*(?:osebi|osebe|oseb|osebo|porcij\w*|ljudi)\b/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 12) return n;
  }
  const w = folded.match(/\bza\s+(enega|eno|ena|sebe|dva|dve|dvoje|par|tri|troje|stiri|pet|sest)\b/) ?? folded.match(/\b(dva|dve|tri|stiri|pet|sest)\s+(?:osebi|osebe|oseb)\b/);
  if (w) return NUMBER_WORDS[w[1]] ?? null;
  if (/\b(dvojico|za naju|romantic\w*)\b/.test(folded)) return 2;
  return null;
}

export function parseBudgetCents(folded: string): number | null {
  const m =
    folded.match(/\b(?:do|pod|manj kot|najvec|max|maksimalno|budget|proracun\w*)\s+(\d{1,3}(?:,\d{1,2})?)\s*(?:eur|evr\w*)?\b/) ??
    folded.match(/\b(\d{1,3}(?:,\d{1,2})?)\s*(?:eur|evr\w*)\b/);
  if (!m) return null;
  const v = Math.round(parseFloat(m[1].replace(",", ".")) * 100);
  return v > 0 && v <= 100_000 ? v : null;
}

export function detectIntent(messages: ChatRequestMessage[]): DetectedIntent {
  const last = messages[messages.length - 1];
  const text = (last?.text ?? "").trim();
  const folded = fold(text);
  const contextProductIds = recentContextIds(messages);
  const filters = detectFilters(text);
  const base = { folded, text, filters, contextProductIds };

  if (!folded) return { ...base, intent: "unknown_product" };

  // Explicit commands first (only explicit verbs mutate anything; the client still performs the mutation).
  if (RE.remove.test(folded)) return { ...base, intent: "remove" };
  if (RE.save.test(folded) && !/\b(ali|kako)\b.*\b(dodam|shranim)\b/.test(folded)) return { ...base, intent: "save" };
  // Demo location features (mocked data, deterministic): before the leaflet "kje" handling.
  if ((RE.nearWord.test(folded) && RE.storeWord.test(folded)) || RE.whereIsSpar.test(folded)) return { ...base, intent: "nearest_store" };
  const prev = previousAssistantText(messages);
  // Explicit store phrasing wins over a mere mention of the catalog ("Kje v trgovini je izdelek iz kataloga?").
  const inStoreOverLeaflet = RE.whereWord.test(folded) && RE.inStore.test(folded) && !RE.leafletPlace.test(folded);
  if (!RE.leafletWord.test(folded) || inStoreOverLeaflet) {
    // "Kje v trgovini je kruh?", "V katerem oddelku je mleko?", and "Kje je kruh?" for products with a known store section.
    if (RE.inStoreWhere.test(folded)) return { ...base, intent: "store_location" };
    if (RE.whereWord.test(folded) && (RE.inStore.test(folded) || findStoreSection(text))) return { ...base, intent: "store_location" };
    // Reply to "Kateri izdelek iščeš v trgovini?".
    if (prev && fold(prev) === fold(ASK_STORE_PRODUCT_TEXT) && folded.split(" ").length <= 4) return { ...base, intent: "store_location" };
  }
  if (RE.where.test(folded)) return { ...base, intent: "where_in_leaflet" };
  // Reply to "Seveda. Kateri izdelek te zanima?": a short message naming a product is a price lookup.
  if (prev && fold(prev) === fold(ASK_PRODUCT_TEXT) && folded.split(" ").length <= 4 && searchProducts(text, { limit: 1 }).length) {
    return { ...base, intent: "price_lookup" };
  }
  if (RE.outOfScope.test(folded) && !RE.meal.test(folded) && !RE.breakfast.test(folded)) return { ...base, intent: "out_of_scope" };
  if (RE.discounts.test(folded)) return { ...base, intent: "discounts" };
  if (RE.breakfast.test(folded)) return { ...base, intent: "breakfast" };
  if (RE.meal.test(folded)) {
    const kind: MealKind = /\bkosil/.test(folded) ? "lunch" : /\bvecerj/.test(folded) ? "dinner" : "any";
    return { ...base, intent: "meal", meal: { kind, servings: parseServings(folded), budgetCents: parseBudgetCents(folded) } };
  }
  // A budget without a named product ("Imam 10 €, kaj lahko kupim?"): a verified recipe within that budget.
  const budgetCents = parseBudgetCents(folded);
  if (budgetCents != null && RE.budgetShop.test(folded) && !mentionsProduct(text)) {
    return { ...base, intent: "meal", meal: { kind: "any", servings: parseServings(folded), budgetCents } };
  }
  if (RE.cheaper.test(folded)) return { ...base, intent: "cheaper" };
  if (RE.recommend.test(folded)) return { ...base, intent: "recommend" };
  if (folded.split(" ").length <= 8 && !mentionsProduct(text)) {
    if (RE.help.test(folded)) return { ...base, intent: "help" };
    if (RE.howAreYou.test(folded)) return { ...base, intent: "how_are_you" };
    if (RE.thanks.test(folded)) return { ...base, intent: "thanks" };
    if (RE.greeting.test(folded)) return { ...base, intent: "greeting" };
  }
  // Line listing ("S-BUDGET izdelki"); "sbudget skuta" is a product lookup and is resolved later by the responder.
  if (RE.line.test(folded)) return { ...base, intent: "line" };
  return { ...base, intent: "price_lookup" };
}
