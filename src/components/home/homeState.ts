/**
 * Pure state model of the home page (`/domov`): which top-zone mode is shown (catalog covers or an
 * item list), which "intent" (action button) drives the list and the product rail, and the selectors
 * that turn that state into product ids. No React, no I/O: unit-tested in tests/unit/home-state.test.ts.
 */
import { newProducts, products, productsInCategory } from "@/lib/catalog";
import { rankDiscounts } from "@/lib/assistant/discounts";
import { categoryLabel } from "@/lib/recommendations";

export type HomeMode = "katalogi" | "izdelki";
export type HomeIntent = "featured" | "discounts" | "new" | "categories";
export type HomeState = { mode: HomeMode; intent: HomeIntent; category: string | null };

export type HomeAction =
  | { type: "segment"; mode: HomeMode }
  /** One of the three content action buttons (the nearest-store button never touches this state). */
  | { type: "intent"; intent: Exclude<HomeIntent, "featured"> }
  | { type: "category"; slug: string }
  /** The rail's "Poglej vse": show the rail's intent in the top zone. */
  | { type: "viewAll" };

/** Rows shown in the top list before "Poglej vse" expands it. */
export const TOP_PREVIEW = 4;
/** The rail uses the intent's remaining items only when at least this many are left. */
export const RAIL_MIN = 4;
/** Upper bound of rail cards (keeps the DOM small). */
export const RAIL_MAX = 20;
export const DEFAULT_RAIL_TITLE = "Aktualni izdelki iz kataloga";

export const initialHomeState: HomeState = { mode: "katalogi", intent: "featured", category: null };

/** Categories with at least two products, most products first (ties by slug): the chip row. */
export function availableCategories(): string[] {
  const counts = new Map<string, number>();
  for (const p of products) for (const c of new Set(p.categories)) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([slug]) => slug);
}

export function homeReducer(state: HomeState, action: HomeAction): HomeState {
  switch (action.type) {
    case "segment":
      return action.mode === "izdelki" ? { ...state, mode: "izdelki" } : { mode: "katalogi", intent: "featured", category: null };
    case "intent":
      if (action.intent === "categories") {
        // Tapping the active action again keeps the current category instead of resetting it.
        return { mode: "izdelki", intent: "categories", category: state.intent === "categories" && state.category ? state.category : (availableCategories()[0] ?? null) };
      }
      return { mode: "izdelki", intent: action.intent, category: null };
    case "category":
      return { mode: "izdelki", intent: "categories", category: action.slug };
    case "viewAll":
      return state.intent === "categories" && !state.category ? { ...state, mode: "izdelki", category: availableCategories()[0] ?? null } : { ...state, mode: "izdelki" };
  }
}

const editorialIds = (): string[] => products.map((p) => p.id);

/** Verified percent discounts, best first, one entry per product. */
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

/** The complete list of the current intent (what "Poglej vse" expands to). */
export function intentItems(state: HomeState): string[] {
  switch (state.intent) {
    case "discounts":
      return discountedProducts().map((d) => d.productId);
    case "new":
      return newProducts().map((p) => p.id);
    case "categories":
      return state.category ? productsInCategory(state.category).map((p) => p.id) : [];
    default:
      return editorialIds();
  }
}

/** Collapsed top list: the first TOP_PREVIEW items of the intent. */
export function topItems(state: HomeState): string[] {
  return intentItems(state).slice(0, TOP_PREVIEW);
}

function railPlan(state: HomeState): { ids: string[]; title: string } {
  const all = intentItems(state);
  const fallback = (shown: Set<string>) => editorialIds().filter((id) => !shown.has(id));
  // Catalog mode: no list is on screen, so the default rail is simply the editorial order.
  if (state.mode === "katalogi") return { ids: editorialIds().slice(0, RAIL_MAX), title: DEFAULT_RAIL_TITLE };
  const shown = new Set(topItems(state));
  const rest = all.slice(TOP_PREVIEW);
  // Rule: the rail never repeats the visible top list. If the intent has at least RAIL_MIN further
  // items they fill the rail under the intent's own title; otherwise (and for the default intent,
  // whose "rest" is the editorial order anyway) the rail falls back to editorial items not shown above.
  if (state.intent !== "featured" && rest.length >= RAIL_MIN) return { ids: rest.slice(0, RAIL_MAX), title: intentRailTitle(state) };
  return { ids: fallback(shown).slice(0, RAIL_MAX), title: DEFAULT_RAIL_TITLE };
}

function intentRailTitle(state: HomeState): string {
  switch (state.intent) {
    case "discounts":
      return "Najbolj znižano";
    case "new":
      return "Novo v katalogu";
    case "categories": {
      const label = categoryLabel(state.category ?? "");
      return `${label.charAt(0).toLocaleUpperCase("sl")}${label.slice(1)} iz kataloga`;
    }
    default:
      return DEFAULT_RAIL_TITLE;
  }
}

export function railItems(state: HomeState): string[] {
  return railPlan(state).ids;
}

export function railTitle(state: HomeState): string {
  return railPlan(state).title;
}

/** Heading of the top list. */
export function topTitle(state: HomeState): string {
  switch (state.intent) {
    case "discounts":
      return "Najbolj znižano";
    case "new":
      return "Novo v katalogu";
    case "categories":
      return "Po kategorijah";
    default:
      return "Izdelki iz katalogov";
  }
}
