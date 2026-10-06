/**
 * Mocked indoor floor plan for "where is this product in the store". No real planogram or
 * store-layout API is called: the layout, sections and user position below are fixed for one
 * example store. The shape (store → sections with rects in map coordinates, entrance, user
 * position, per-section direction phrase) is what a real indoor-map source would provide, so this
 * module can be swapped for real store data without touching the UI.
 *
 * Map coordinate space: x 0..100 (left → right), y 0..80 (back wall → entrance). The store
 * interior spans roughly x 4..96, y 2..74; the entrance gap is at the bottom centre.
 *
 * Keep this file free of React imports — it may be imported server-side.
 */
import { fold } from "@/lib/assistant/normalize";

export type StoreSectionId = "pekarna" | "mlecni" | "sadje" | "meso" | "zamrznjeno" | "pijace" | "blagajne";

export type StoreSectionTone = "bakery" | "dairy" | "produce" | "meat" | "neutral" | "checkout";

export type MapPoint = { x: number; y: number };

export type StoreSection = {
  id: StoreSectionId;
  /** User-facing department name, e.g. "Pekarna". */
  label: string;
  /** Rect in map coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  tone: StoreSectionTone;
  /** Where the target pin's tip points when this section is highlighted. */
  pin: MapPoint;
  /** Short direction phrase used in the answer text ("desno od glavnega vhoda, ..."). */
  direction: string;
};

export type Shelf = { x: number; y: number; w: number; h: number };

export type IndoorStore = {
  id: string;
  /** Display name, e.g. "SPAR Letališka cesta 26". */
  name: string;
  brand: string;
  address: string;
  /** Outer wall outline (open polyline from one door jamb around to the other). */
  outline: MapPoint[];
  /** Door gap in the bottom wall. */
  entrance: { x1: number; x2: number; y: number };
  sections: StoreSection[];
  /** Generic aisle shelving (no department label). */
  shelves: Shelf[];
  /** Mocked "you are here" position (blue dot), just inside the entrance. */
  userLocation: MapPoint;
};

export const DEMO_INDOOR_STORE: IndoorStore = {
  id: "spar-letaliska-26",
  name: "SPAR Letališka cesta 26",
  brand: "SPAR",
  address: "Letališka cesta 26",
  outline: [
    { x: 44, y: 74 },
    { x: 4, y: 74 },
    { x: 4, y: 10 },
    { x: 9.5, y: 4 },
    { x: 64, y: 4 },
    { x: 64, y: 2 },
    { x: 96, y: 2 },
    { x: 96, y: 74 },
    { x: 56, y: 74 },
  ],
  entrance: { x1: 44, x2: 56, y: 74 },
  sections: [
    {
      id: "mlecni",
      label: "Mlečni izdelki",
      x: 8,
      y: 7,
      w: 57,
      h: 11,
      tone: "dairy",
      pin: { x: 58, y: 15.5 },
      direction: "ob zadnji steni trgovine, nasproti vhoda",
    },
    {
      id: "pekarna",
      label: "Pekarna",
      x: 69,
      y: 5,
      w: 24.5,
      h: 21,
      tone: "bakery",
      pin: { x: 89, y: 13 },
      direction: "desno od glavnega vhoda, pri prehodu med sadjem in mlečnimi izdelki",
    },
    {
      id: "sadje",
      label: "Sadje in zelenjava",
      x: 7,
      y: 22,
      w: 22,
      h: 38,
      tone: "produce",
      pin: { x: 24.5, y: 31 },
      direction: "levo od glavnega vhoda, takoj na začetku trgovine",
    },
    {
      id: "meso",
      label: "Meso",
      x: 82,
      y: 30,
      w: 11.5,
      h: 28,
      tone: "meat",
      pin: { x: 87.75, y: 35 },
      direction: "ob desni steni trgovine, pri hladilnih vitrinah",
    },
    {
      id: "zamrznjeno",
      label: "Zamrznjeno",
      x: 33,
      y: 22,
      w: 21,
      h: 8,
      tone: "neutral",
      pin: { x: 43.5, y: 23.5 },
      direction: "v osrednjem delu trgovine, levo ob zamrzovalnih skrinjah",
    },
    {
      id: "pijace",
      label: "Pijače",
      x: 58,
      y: 22,
      w: 20,
      h: 8,
      tone: "neutral",
      pin: { x: 68, y: 23.5 },
      direction: "v osrednjem delu trgovine, desno med policami",
    },
    {
      id: "blagajne",
      label: "Blagajne",
      x: 33,
      y: 49,
      w: 45,
      h: 10.5,
      tone: "checkout",
      pin: { x: 39.5, y: 50.5 },
      direction: "tik pred glavnim vhodom",
    },
  ],
  shelves: [
    { x: 33, y: 33.5, w: 21, h: 2.6 },
    { x: 58, y: 33.5, w: 20, h: 2.6 },
    { x: 33, y: 38.5, w: 21, h: 2.6 },
    { x: 58, y: 38.5, w: 20, h: 2.6 },
    { x: 33, y: 43.5, w: 21, h: 2.6 },
    { x: 58, y: 43.5, w: 20, h: 2.6 },
    { x: 7, y: 64, w: 22, h: 6 },
    { x: 80, y: 62, w: 13.5, h: 8 },
  ],
  userLocation: { x: 50, y: 65.5 },
};

export function getStoreSection(id: string, store: IndoorStore = DEMO_INDOOR_STORE): StoreSection | null {
  return store.sections.find((s) => s.id === id) ?? null;
}

/* ------------------------------------------------------------------ product → section matcher */

type KeywordRule = {
  section: StoreSectionId;
  /** Nominative, user-facing label. */
  label: string;
  /** Folded prefixes; a token matches when it starts with one of them. */
  stems?: string[];
  /** Folded exact word forms (used for short words that would over-match as prefixes). */
  words?: string[];
};

const RULES: KeywordRule[] = [
  // Pekarna
  { section: "pekarna", label: "Kruh", stems: ["kruh"] },
  { section: "pekarna", label: "Pecivo", stems: ["peciv"] },
  { section: "pekarna", label: "Žemlje", stems: ["zemljic"], words: ["zemlja", "zemlje", "zemljo", "zemlji", "zemelj", "zemljami"] },
  { section: "pekarna", label: "Bageta", stems: ["baget"] },
  { section: "pekarna", label: "Rogljiči", stems: ["rogljic"] },
  { section: "pekarna", label: "Toast", stems: ["toast"] },
  { section: "pekarna", label: "Burek", stems: ["burek", "bureka", "burekom"] },
  { section: "pekarna", label: "Pekovski izdelki", stems: ["pekovsk", "pekarn"] },
  // Mlečni izdelki
  { section: "mlecni", label: "Mleko", stems: ["mlek"] },
  { section: "mlecni", label: "Mlečni izdelki", stems: ["mlecn"] },
  { section: "mlecni", label: "Jogurt", stems: ["jogurt"] },
  { section: "mlecni", label: "Sir", words: ["sir", "sira", "siru", "sirom", "siri", "sirov", "sire"] },
  { section: "mlecni", label: "Skuta", stems: ["skut"] },
  { section: "mlecni", label: "Maslo", stems: ["masl"] },
  { section: "mlecni", label: "Smetana", stems: ["smetan"] },
  { section: "mlecni", label: "Kefir", stems: ["kefir"] },
  // Sadje in zelenjava
  { section: "sadje", label: "Sadje", stems: ["sadj"] },
  { section: "sadje", label: "Zelenjava", stems: ["zelenjav"] },
  { section: "sadje", label: "Jagode", stems: ["jagod"] },
  { section: "sadje", label: "Jabolka", stems: ["jabolk"] },
  { section: "sadje", label: "Banane", stems: ["banan"] },
  { section: "sadje", label: "Paradižnik", stems: ["paradiznik"] },
  { section: "sadje", label: "Krompir", stems: ["krompir"] },
  { section: "sadje", label: "Solata", stems: ["solat"] },
  // Meso
  { section: "meso", label: "Meso", stems: ["meso", "mesa", "mesom", "mesni", "mesne"] },
  { section: "meso", label: "Zrezki", stems: ["zrez"] },
  { section: "meso", label: "Piščanec", stems: ["piscan"] },
  { section: "meso", label: "Salama", stems: ["salam"] },
  { section: "meso", label: "Klobase", stems: ["klobas"] },
  { section: "meso", label: "Šunka", stems: ["sunk"] },
  // Zamrznjeno
  { section: "zamrznjeno", label: "Zamrznjeni izdelki", stems: ["zamrznjen", "zmrznjen"] },
  { section: "zamrznjeno", label: "Sladoled", stems: ["sladoled"] },
  { section: "zamrznjeno", label: "Pomfri", stems: ["pommes", "pomfri"] },
  // Pijače
  { section: "pijace", label: "Voda", words: ["voda", "vode", "vodo", "vodi", "vod"] },
  { section: "pijace", label: "Sok", words: ["sok", "soka", "soku", "sokom", "soki", "sokov", "soke"] },
  { section: "pijace", label: "Pivo", words: ["pivo", "piva", "pivom", "piv"] },
  { section: "pijace", label: "Vino", words: ["vino", "vina", "vinom", "vin"] },
  { section: "pijace", label: "Pijače", stems: ["pijac"] },
];

function matchRule(token: string): KeywordRule | null {
  for (const rule of RULES) {
    if (rule.words?.includes(token)) return rule;
    if (rule.stems?.some((s) => token.startsWith(s))) return rule;
  }
  return null;
}

/**
 * Finds the department for a product mentioned in free text ("Kje najdem kruh?").
 * Returns the first product word (in query order) that maps to a known section.
 */
export function findStoreSection(
  query: string,
  store: IndoorStore = DEMO_INDOOR_STORE,
): { section: StoreSection; productLabel: string } | null {
  const tokens = fold(query).split(" ").filter(Boolean);
  for (const token of tokens) {
    const rule = matchRule(token);
    if (!rule) continue;
    const section = getStoreSection(rule.section, store);
    if (section) return { section, productLabel: rule.label };
  }
  return null;
}

/* ------------------------------------------------------------------ answer text */

/** Accusative forms for labels whose nominative reads wrong after "najdeš" (feminine sg., some plurals). */
const ACCUSATIVE: Record<string, string> = {
  Bageta: "Bageto",
  Rogljiči: "Rogljiče",
  "Pekovski izdelki": "Pekovske izdelke",
  "Mlečni izdelki": "Mlečne izdelke",
  Skuta: "Skuto",
  Smetana: "Smetano",
  Zelenjava: "Zelenjavo",
  Solata: "Solato",
  Zrezki: "Zrezke",
  Piščanec: "Piščanca",
  Salama: "Salamo",
  Šunka: "Šunko",
  "Zamrznjeni izdelki": "Zamrznjene izdelke",
  Voda: "Vodo",
};

/**
 * "Trenutno si v SPAR trgovini Letališka cesta 26. Kruh najdeš v oddelku Pekarna, desno od glavnega
 * vhoda, pri prehodu med sadjem in mlečnimi izdelki."
 */
export function storeLocationText(productLabel: string, section: StoreSection, store: IndoorStore = DEMO_INDOOR_STORE): string {
  const product = ACCUSATIVE[productLabel] ?? productLabel;
  return `Trenutno si v ${store.brand} trgovini ${store.address}. ${product} najdeš v oddelku ${section.label}, ${section.direction}.`;
}
