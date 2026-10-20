import { describe, expect, it } from "vitest";
import { getPrimaryOffer, getProduct, newProducts, products, productsInCategory } from "@/lib/catalog";
import { rankDiscounts } from "@/lib/assistant/discounts";
import { categoryLabel } from "@/lib/recommendations";
import {
  availableCategories,
  DEFAULT_RAIL_TITLE,
  homeReducer,
  initialHomeState,
  intentItems,
  railItems,
  railTitle,
  RAIL_MIN,
  topItems,
  TOP_PREVIEW,
  type HomeState,
} from "@/components/home/homeState";

const discounts: HomeState = { mode: "izdelki", intent: "discounts", category: null };
const news: HomeState = { mode: "izdelki", intent: "new", category: null };
const featured: HomeState = { mode: "izdelki", intent: "featured", category: null };
const cat = (slug: string | null): HomeState => ({ mode: "izdelki", intent: "categories", category: slug });
const allStates = (): HomeState[] => [initialHomeState, featured, discounts, news, ...availableCategories().map(cat)];

describe("homeReducer", () => {
  it("starts in catalog mode with the featured intent", () => {
    expect(initialHomeState).toEqual({ mode: "katalogi", intent: "featured", category: null });
  });
  it("segment Izdelki keeps the intent, Katalogi resets it", () => {
    expect(homeReducer(initialHomeState, { type: "segment", mode: "izdelki" })).toEqual(featured);
    expect(homeReducer(discounts, { type: "segment", mode: "izdelki" })).toEqual(discounts);
    expect(homeReducer(cat(availableCategories()[0] ?? null), { type: "segment", mode: "katalogi" })).toEqual(initialHomeState);
  });
  it("actions switch to the matching intent and are idempotent", () => {
    for (const intent of ["discounts", "new"] as const) {
      const s = homeReducer(initialHomeState, { type: "intent", intent });
      expect(s).toEqual({ mode: "izdelki", intent, category: null });
      expect(homeReducer(s, { type: "intent", intent })).toEqual(s);
    }
    const c = homeReducer(initialHomeState, { type: "intent", intent: "categories" });
    expect(c).toEqual(cat(availableCategories()[0] ?? null));
    expect(homeReducer(c, { type: "intent", intent: "categories" })).toEqual(c);
  });
  it("tapping the categories action again keeps the chosen category", () => {
    const second = availableCategories()[1];
    if (!second) return;
    const s = homeReducer(cat(availableCategories()[0]), { type: "category", slug: second });
    expect(s.category).toBe(second);
    expect(homeReducer(s, { type: "intent", intent: "categories" }).category).toBe(second);
  });
  it("viewAll switches to Izdelki and keeps the intent", () => {
    expect(homeReducer(initialHomeState, { type: "viewAll" })).toEqual(featured);
    expect(homeReducer(discounts, { type: "viewAll" })).toEqual(discounts);
  });
});

describe("selectors", () => {
  it("categories have at least two products, ordered by count", () => {
    const counts = availableCategories().map((c) => productsInCategory(c).length);
    expect(counts.every((n) => n >= 2)).toBe(true);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });
  it("every state returns existing, unique products", () => {
    for (const s of allStates()) {
      for (const ids of [intentItems(s), topItems(s), railItems(s)]) {
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) {
          expect(getProduct(id)).toBeDefined();
          expect(getPrimaryOffer(id)).toBeDefined();
        }
      }
    }
  });
  it("is deterministic", () => {
    for (const s of allStates()) expect(railItems(s)).toEqual(railItems({ ...s }));
  });
  it("discounts are sorted by printed percent, descending", () => {
    const pct = new Map(rankDiscounts({ limit: Infinity }).map((d) => [d.product.id, d.offer.discountPercent ?? 0]));
    const list = intentItems(discounts).map((id) => pct.get(id) ?? -1);
    expect(list.every((p) => p > 0)).toBe(true);
    expect([...list].sort((a, b) => b - a)).toEqual(list);
  });
  it("new list contains only isNew products", () => {
    const ids = intentItems(news);
    expect(ids).toEqual(newProducts().map((p) => p.id));
    for (const id of ids) expect(getProduct(id)!.isNew).toBeTruthy();
  });
  it("category list contains only that category", () => {
    for (const slug of availableCategories()) {
      const ids = intentItems(cat(slug));
      expect(ids.length).toBeGreaterThanOrEqual(2);
      for (const id of ids) expect(getProduct(id)!.categories).toContain(slug);
    }
  });
  it("top list is the first TOP_PREVIEW items", () => {
    for (const s of allStates()) expect(topItems(s)).toEqual(intentItems(s).slice(0, TOP_PREVIEW));
  });
  it("the rail never repeats the visible top list in Izdelki mode", () => {
    for (const s of allStates().filter((x) => x.mode === "izdelki")) {
      const top = new Set(topItems(s));
      for (const id of railItems(s)) expect(top.has(id)).toBe(false);
    }
  });
  it("catalog mode rail is the editorial order", () => {
    const rail = railItems(initialHomeState);
    expect(rail).toEqual(products.map((p) => p.id).slice(0, rail.length));
    expect(railTitle(initialHomeState)).toBe(DEFAULT_RAIL_TITLE);
  });
  it("rail title follows the intent when it has enough further items, else the default", () => {
    const check = (s: HomeState, title: string) => {
      const rest = intentItems(s).length - TOP_PREVIEW;
      expect(railTitle(s)).toBe(rest >= RAIL_MIN ? title : DEFAULT_RAIL_TITLE);
    };
    check(discounts, "Najbolj znižano");
    check(news, "Novo v katalogu");
    const slug = availableCategories()[0];
    if (slug) {
      const label = categoryLabel(slug);
      check(cat(slug), `${label.charAt(0).toLocaleUpperCase("sl")}${label.slice(1)} iz kataloga`);
    }
    expect(railTitle(featured)).toBe(DEFAULT_RAIL_TITLE);
  });
});
