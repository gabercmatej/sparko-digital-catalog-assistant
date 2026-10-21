/**
 * Pure state model of the home page (`/domov`). One source of truth: which top-zone mode is shown
 * (catalog covers or the product list), which category is selected and which discovery (action
 * button) drives the content. The top list AND the bottom rail are derived from the same selector
 * (`visibleIds`), so they can never diverge. No React, no I/O: unit-tested in tests/unit/home-state.test.ts.
 */
import { newProducts, products, productsInCategory } from "@/lib/catalog";
import { rankDiscounts } from "@/lib/assistant/discounts";
import { categoryLabel } from "@/lib/recommendations";

export type TopMode = "catalogs" | "products";
/** "all" is the "VSI" chip. */
export type CategoryKey = "all" | (string & {});
/** default = unfiltered editorial list; category = a chip / sheet choice; discounts / new = action buttons. */
export type Discovery = "default" | "discounts" | "category" | "new";
export type HomeState = { topMode: TopMode; activeCategory: CategoryKey; activeDiscovery: Discovery };

export type HomeAction =
  | { type: "setTopMode"; mode: TopMode }
  /** "Kaj je najbolj znižano" / "Kaj je novega v katalogu". */
  | { type: "discover"; discovery: "discounts" | "new" }
  /** A category chip or a pick in the category sheet ("all" = VSI). */
  | { type: "selectCategory"; category: CategoryKey }
  /** The rail's "Poglej vse": show what the rail shows in the top zone. */
  | { type: "viewAll" };

/** Upper bound of rail cards (keeps the DOM small). */
export const RAIL_MAX = 20;
export const ALL_CATEGORY = "all";
export const DEFAULT_RAIL_TITLE = "Aktualni izdelki iz kataloga";

export const initialHomeState: HomeState = { topMode: "catalogs", activeCategory: ALL_CATEGORY, activeDiscovery: "default" };

/** Categories always offered first (when the catalog has products for them), in this order. */
export const PRIORITY_CATEGORIES = ["zajtrk", "pekovsko", "vecerja", "osnovna-zivila", "mlecni-izdelki"] as const;

/** Real category slugs for the chips and the sheet: the priority ones, then others with >= 2 products (most first). */
export function availableCategories(): string[] {
  const counts = new Map<string, number>();
  for (const p of products) for (const c of new Set(p.categories)) counts.set(c, (counts.get(c) ?? 0) + 1);
  const priority = PRIORITY_CATEGORIES.filter((s) => (counts.get(s) ?? 0) > 0) as string[];
  const rest = [...counts.entries()]
    .filter(([slug, n]) => n >= 2 && !priority.includes(slug))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([slug]) => slug);
  return [...priority, ...rest];
}

/** Chip / sheet order: VSI first, then the real categories. */
export function categoryOptions(): { key: CategoryKey; label: string; count: number }[] {
  return [
    { key: ALL_CATEGORY, label: "VSI", count: products.length },
    ...availableCategories().map((slug) => ({ key: slug, label: capitalize(categoryLabel(slug)), count: productsInCategory(slug).length })),
  ];
}

function capitalize(s: string): string {
  return s.charAt(0).toLocaleUpperCase("sl") + s.slice(1);
}

export function homeReducer(state: HomeState, action: HomeAction): HomeState {
  switch (action.type) {
    case "setTopMode":
      // Back to the catalogs resets every filter; Izdelki keeps what is selected (default: VSI).
      return action.mode === "products" ? { ...state, topMode: "products" } : initialHomeState;
    case "discover":
      return { topMode: "products", activeCategory: ALL_CATEGORY, activeDiscovery: action.discovery };
    case "selectCategory":
      return { topMode: "products", activeCategory: action.category, activeDiscovery: "category" };
    case "viewAll":
      return { ...state, topMode: "products" };
  }
}

/** Verified, currently valid percent discounts, best first, one entry per product. */
export function discountedProducts(): { productId: string; percent: number }[] {
  const seen = new Set<string>();
  const out: { productId: string; percent: number }[] = [];
  for (const { offer, product } of rankDiscounts({ limit: Infinity })) {
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    out.push({ productId: product.id, percent: offer.discountPercent ?? 0 });
  }
  return out;
}

/** The single selector behind the top list and the rail: the complete product set of the current state. */
export function visibleIds(state: HomeState): string[] {
  switch (state.activeDiscovery) {
    case "discounts":
      return discountedProducts().map((d) => d.productId);
    case "new":
      return newProducts().map((p) => p.id);
    case "category":
      return state.activeCategory === ALL_CATEGORY ? products.map((p) => p.id) : productsInCategory(state.activeCategory).map((p) => p.id);
    default:
      return products.map((p) => p.id);
  }
}

/** Top list (products mode): everything in the set; the list scrolls inside its fixed-height box. */
export function topItems(state: HomeState): string[] {
  return visibleIds(state);
}

/** Rail: the same set (editorial order in catalog mode, where no list is on screen), capped. */
export function railItems(state: HomeState): string[] {
  return visibleIds(state.topMode === "catalogs" ? initialHomeState : state).slice(0, RAIL_MAX);
}

function discoveryTitle(state: HomeState, fallback: string): string {
  switch (state.activeDiscovery) {
    case "discounts":
      return "Najbolj znižano";
    case "new":
      return "Novo v katalogu";
    case "category":
      return state.activeCategory === ALL_CATEGORY ? fallback : capitalize(categoryLabel(state.activeCategory));
    default:
      return fallback;
  }
}

export function railTitle(state: HomeState): string {
  const s = state.topMode === "catalogs" ? initialHomeState : state;
  const t = discoveryTitle(s, DEFAULT_RAIL_TITLE);
  return s.activeDiscovery === "category" && s.activeCategory !== ALL_CATEGORY ? `${t} iz kataloga` : t;
}

/** Heading of the top list. */
export function topTitle(state: HomeState): string {
  return discoveryTitle(state, "Izdelki iz katalogov");
}
