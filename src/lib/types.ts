/**
 * Canonical Sparko data contracts. Every module (chat, Moj katalog, leaflet,
 * retrieval, data scripts) uses these types and the IDs in src/data/catalog.json.
 * Money is always integer EUR cents. Normalized coordinates are 0..1 relative
 * to the rendered PDF page image.
 */

// ---------------------------------------------------------------- catalog data

export type CatalogPage = {
  /** 0-based index into the PDF. */
  pdfPageIndex: number;
  /** 1-based PDF page number (pdfPageIndex + 1). */
  pdfPageNumber: number;
  /** Page number as printed on the page, or null when none is printed/legible. */
  printedPageLabel: string | null;
  /** Public URL of the full page image, e.g. /catalog/pages/page-05.webp */
  image: { src: string; width: number; height: number };
  /** Small thumbnail for page picker. */
  thumb: { src: string; width: number; height: number };
  /** Short editorial theme, e.g. "S-BUDGET", "Mesnica", "Zajtrk". */
  theme: string | null;
};

/** Store-format category of a leaflet: drives the colour and the label of its Home card, the leaflet switcher and the product source badge. */
export type LeafletCategory = "spar" | "interspar" | "spar-online" | "despar";
/** Which store format a catalog (and so every offer in it) belongs to. Drives the SPAR / INTERSPAR / SPAR Online / DESPAR source label. */
export type Retailer = LeafletCategory;

/** Printed exception to a catalog's general validity for some pages (e.g. »strani 22–27 do 10. 11.«). */
export type PageRule = {
  /** 1-based PDF page numbers the rule covers. */
  pdfPages: number[];
  /** The page numbers as printed on those pages (the footnote names printed numbers), null when none is printed. */
  printedLabels: (string | null)[];
  from: string;
  to: string;
};

export type Catalog = {
  id: string; // "spar-4426"
  retailer: Retailer;
  title: string; // "SPAR katalog 44/26"
  issueLabel: string; // "44/26"
  /** ISO date the catalog was published / starts, "2026-10-28". */
  publishedDate: string;
  /** General catalog validity as printed (pages and individual offers may differ, see pageRules / Offer.validity). */
  validFrom: string; // "2026-10-28"
  validTo: string; // "2026-11-03"
  /** Short printed exception / restriction, e.g. "Izdelki na straneh 22–27 do 10. 11. 2026.", or null. */
  validityNote: string | null;
  pageRules: PageRule[];
  /** Catalog-wide store restriction ("Samo v trgovini DESPAR Koper."), or null. */
  availability: string | null;
  /** Position on Home (1 = first); null for historical catalogs. */
  homeOrder: number | null;
  sourceFile: string; // original file name
  /** Public URL of the original PDF. */
  pdfUrl: string;
  pageCount: number;
  /** Cover (PDF page 1) image for the home catalog cards. */
  cover: { src: string; width: number; height: number };
  pages: CatalogPage[];
};

/**
 * A leaflet the viewer can open: one of the six current catalogs of src/data/catalog.json (Home order) or one of
 * the earlier catalogs of src/data/historical.json (homeOrder null, never current).
 */
export type ViewerCatalog = {
  id: string;
  category: LeafletCategory;
  title: string;
  issueLabel: string;
  validFrom: string;
  validTo: string;
  /** Printed exception to the general validity (other end date for some pages, single store …), or null. */
  validityNote: string | null;
  pdfUrl: string;
  pageCount: number;
  cover: { src: string; width: number; height: number };
  pages: CatalogPage[];
  pageRules: PageRule[];
  availability: string | null;
  /** True when verified products and placement boxes exist for it. */
  interactive: boolean;
  /** Position on Home (1 = first), or null when not shown there (historical catalogs). */
  homeOrder: number | null;
  /** An earlier catalog kept for saved products and old chats (src/data/historical.json). */
  historical: boolean;
};

export type QuantityUnit = "g" | "kg" | "ml" | "l" | "kos";

export type Product = {
  /** Stable, kebab-case, carries the catalog context, e.g. "nutella-1kg-4426" (historical: "nutella-1kg"). */
  id: string;
  /**
   * Catalog-independent identity slug: the same product in two catalogs shares it. Used to deduplicate search
   * results and to offer a historical saved item's identical current offer.
   */
  identityKey: string;
  name: string; // "Nutella"
  /** Brand or private label line, e.g. "S-BUDGET", "SPAR", "Ljubljanske mlekarne". */
  brand: string | null;
  /** Product line used for recommendations (+3), e.g. "S-BUDGET". */
  line: string | null;
  /** Descriptor shown under the name, e.g. "10 % m. m." */
  descriptor: string | null;
  /** Human pack size, e.g. "1 kg", "400 g", "10 kosov". */
  packSize: string;
  quantity: { amount: number; unit: QuantityUnit } | null;
  /** First entry is the primary category. Lowercase slugs, e.g. "mlecni-izdelki". */
  categories: string[];
  /** Lowercase Slovenian aliases & inflections, without diacritics variants is fine. */
  aliases: string[];
  image: {
    src: string; // "/products/nutella-1kg.webp"
    width: number;
    height: number;
    /** How the image was obtained (audit trail in catalog-sources.json; not shipped to the browser). */
    provenance?: string;
  };
  /** Editorial theme group of the leaflet (+1 in recommendations). */
  theme: string | null;
  /** Editorial order for carousel / tie-breaks (lower first). */
  editorialRank: number;
  /** "Novo v katalogu". */
  isNew: boolean;
  /** printed_badge = "NOVO" printed in the leaflet; demo_editorial = explicit demo pick (mock). null iff !isNew. */
  newSource: "printed_badge" | "demo_editorial" | null;
};

export type PriceKind =
  | "catalog_price" // plain catalog price, no condition
  | "loyalty_price" // requires SPAR plus card
  | "coupon_price"; // requires a coupon

export type PriceUnit = "pack" | "kg" | "100g" | "kos";

export type ValidityStatus =
  | "explicit" // dates printed for this offer / its page block
  | "catalog_default" // general catalog validity printed on page/cover applies
  | "unknown"; // not determinable from source

export type Offer = {
  id: string; // "offer-nutella-1kg-4126"
  productId: string;
  catalogId: string;
  priceCents: number;
  priceUnit: PriceUnit;
  priceKind: PriceKind;
  /** Verified regular price in cents, else null. Never inferred. */
  regularPriceCents: number | null;
  /** Discount percentage exactly as printed (e.g. 25), else null. */
  discountPercent: number | null;
  /** Price per kg / l ONLY when printed in the leaflet, else null. */
  unitPrice: { cents: number; per: "kg" | "l" } | null;
  conditions: {
    spPlusRequired: boolean;
    couponRequired: boolean;
    /** Additional printed condition, e.g. "ob nakupu 2 kosov". */
    note: string | null;
  };
  validity: {
    status: ValidityStatus;
    from: string | null; // ISO date
    to: string | null; // ISO date
    /** Printed text that justifies the dates (audit trail in catalog-sources.json). */
    evidence?: string | null;
  };
  /** Store / channel restriction (DESPAR Koper only, SPAR Online only, MEGA SPAR store types …). */
  availability: { restricted: boolean; note: string | null };
  /** Source text excerpt supporting price and pack size (audit trail in catalog-sources.json). */
  sourceQuote?: string;
  verification: {
    status: "verified" | "partial";
    checkedOn: string; // ISO date
    method?: string;
    notes?: string | null;
  };
};

export type NormalizedBox = { x: number; y: number; width: number; height: number };

export type Placement = {
  id: string; // "pl-nutella-1kg-4126-p01"
  offerId: string;
  /** Catalog the page belongs to (always the offer's catalogId). */
  catalogId: string;
  pdfPageIndex: number; // 0-based within that catalog
  pdfPageNumber: number; // 1-based
  printedPageLabel: string | null;
  bbox: NormalizedBox;
};

export type RecipeIngredient = {
  offerId: string;
  /** What the recipe needs, e.g. "300 g". */
  requiredQuantity: string;
  /** Whole packs to buy. Cost = packs * priceCents. */
  packsNeeded: number;
  /** Conversion explanation, e.g. "1 kg pakiranje zadošča za 300 g". */
  conversionNote: string;
};

export type Recipe = {
  id: string;
  title: string;
  kind: "dinner" | "breakfast" | "lunch";
  servings: number;
  /** Budget in cents the recipe was checked against, or null. */
  budgetCents: number | null;
  ingredients: RecipeIngredient[];
  /** Explicit pantry assumptions, e.g. "olje, sol in poper imaš doma". */
  pantryAssumptions: string[];
  steps: string[];
  /** Total minutes (approximate, editorial). */
  minutes: number | null;
};

/** src/data/historical.json: earlier catalogs (SPAR 41/26, INTERSPAR 14/26), only for saved items / old chats. */
export type HistoricalData = {
  version: 1;
  note: string;
  catalogs: Catalog[];
  products: Product[];
  offers: Offer[];
  placements: Placement[];
};

export type CatalogData = {
  version: 3;
  /** The six current catalogs, Home order (SPAR 44/26 first). */
  catalogs: Catalog[];
  products: Product[];
  offers: Offer[];
  placements: Placement[];
  recipes: Recipe[];
};

// ---------------------------------------------------------------- future promotions (DEMO MOCK)

/**
 * An upcoming promotion for a product that is in the current catalog. DEMO MOCK: the real
 * future-promo feed does not exist yet; src/data/future-promos.json is deterministic demo data,
 * shaped so it can be swapped for a real feed. Never mixed with verified current offers:
 * the current price always comes from the product's current Offer.
 */
export type FuturePromo = {
  id: string; // "fp-<productId>-w42"
  productId: string;
  catalogId: string;
  validFrom: string; // ISO date
  validTo: string; // ISO date
  priceCents: number;
  regularPriceCents: number | null;
  discountPercent: number | null;
  spPlusRequired: boolean;
};

export type FuturePromoData = {
  version: 1;
  mock: true;
  note: string;
  period: { from: string; to: string };
  promos: FuturePromo[];
};

// ---------------------------------------------------------------- user state

export type SavedItem = {
  productId: string;
  offerId: string;
  savedAt: number; // epoch ms
};

export type SpPlusSetting = "yes" | "no" | "unset";

/** Structured, data-driven pieces of an assistant message. Rendered from catalog data, never from model prose. */
export type MessageBlock =
  | {
      type: "products";
      offerIds: string[];
      /** Optional per-offer reason line (already verified / rule-generated). */
      reasons?: Record<string, string>;
      /** Layout: single featured card or compact list. */
      layout?: "card" | "list";
    }
  | { type: "recipe"; recipeId: string }
  /**
   * Discount timing: "Znižano ta teden" (verified current offers) and "Znižano naslednji teden"
   * (FuturePromo ids, demo mock). Either list may be empty; periods are derived from the data.
   */
  | {
      type: "discount_timeline";
      currentOfferIds: string[];
      upcomingPromoIds: string[];
      /**
       * DEMO MOCK forecast (src/lib/demoForecast.ts): product ids simulated to be promoted next week WITHOUT a
       * structured promo - shown with the period and the verified current price only (no future price/percent).
       */
      forecastProductIds?: string[];
    }
  | {
      type: "choices";
      prompt?: string;
      options: { label: string; message: string }[];
    }
  | { type: "notice"; tone: "info" | "warning"; text: string }
  /** Nearest-store map card (mocked store locator, see src/lib/demo/stores.ts). */
  | { type: "nearest_store" }
  /** Symbolic in-store map with the product's section marked (mocked, see src/lib/demo/storeMap.ts). */
  | { type: "store_map"; sectionId: string };

export type MessageStatus = "ok" | "pending" | "error";

/**
 * live = generated with the language model (validated);
 * fallback = deterministic answer because the model is unavailable/not configured;
 * deterministic = intentionally rule-based (product click, explicit command).
 */
export type AnswerMode = "live" | "fallback" | "deterministic";

export type Message = {
  id: string;
  role: "user" | "assistant";
  createdAt: number;
  text: string;
  blocks?: MessageBlock[];
  status: MessageStatus;
  mode?: AnswerMode;
  /** Product IDs this message is about (used as follow-up context). */
  contextProductIds?: string[];
  /** For errors: the user message id to retry. */
  retryOf?: string;
  /** Client-rendered actions from the API (e.g. open_leaflet button). */
  actions?: ChatAction[];
  /** Honest note shown on fallback answers. */
  modeNotice?: string;
};

export type Conversation = {
  id: string;
  kind: "demo" | "user";
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  /** For forks of a demo conversation. */
  forkedFrom?: string;
};

// ---------------------------------------------------------------- chat API

export type ChatRequestMessage = {
  role: "user" | "assistant";
  text: string;
  contextProductIds?: string[];
};

export type ChatRequest = {
  conversationId: string;
  /** Recent history, oldest first; last entry is the new user message. */
  messages: ChatRequestMessage[];
  savedProductIds: string[];
  spPlus: SpPlusSetting;
};

/** Actions the client may perform after a response. Saving still goes through the store. */
export type ChatAction =
  | { type: "save"; productId: string }
  | { type: "remove"; productId: string }
  | { type: "open_leaflet"; productId: string };

export type ChatResponse = {
  conversationId: string;
  message: {
    text: string;
    blocks: MessageBlock[];
    contextProductIds: string[];
  };
  actions: ChatAction[];
  mode: AnswerMode;
  /** Short reason when mode is fallback, e.g. "Jezikovni model ni nastavljen." */
  notice?: string;
};

export type ChatErrorResponse = { error: string; code: "bad_request" | "rate_limited" | "server_error" };
