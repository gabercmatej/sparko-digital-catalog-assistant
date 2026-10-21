import { describe, expect, it } from "vitest";
import { getPrimaryOffer, getProduct, newProducts, products, productsInCategory } from "@/lib/catalog";
import { rankDiscounts } from "@/lib/assistant/discounts";
import { categoryLabel } from "@/lib/recommendations";
import {
  availableCategories,
  categoryOptions,
  DEFAULT_RAIL_TITLE,
  homeReducer,
  initialHomeState,
  PRIORITY_CATEGORIES,
  railItems,
  railTitle,
  RAIL_MAX,
  topItems,
  visibleIds,
  type HomeState,
} from "@/components/home/homeState";

const select = (category: string): HomeState => homeReducer(initialHomeState, { type: "selectCategory", category });
const discounts = homeReducer(initialHomeState, { type: "discover", discovery: "discounts" });
const news = homeReducer(initialHomeState, { type: "discover", discovery: "new" });
const izdelki = homeReducer(initialHomeState, { type: "setTopMode", mode: "products" });
const allStates = (): HomeState[] => [initialHomeState, izdelki, discounts, news, select("all"), ...availableCategories().map(select)];

describe("homeReducer", () => {
  it("starts with the catalogs on top, VSI and no discovery", () => {
    expect(initialHomeState).toEqual({ topMode: "catalogs", activeCategory: "all", activeDiscovery: "default" });
  });
  it("Izdelki defaults to VSI (all products, both catalogs); Katalogi resets", () => {
    expect(izdelki).toEqual({ topMode: "products", activeCategory: "all", activeDiscovery: "default" });
    expect(topItems(izdelki)).toEqual(products.map((p) => p.id));
    expect(homeReducer(select("zajtrk"), { type: "setTopMode", mode: "catalogs" })).toEqual(initialHomeState);
  });
  it("Izdelki keeps an already chosen category when re-selected", () => {
    const s = select("zajtrk");
    expect(homeReducer(s, { type: "setTopMode", mode: "products" })).toEqual(s);
  });
  it("picking a category (sheet or chip) sets mode and category together", () => {
    const slug = availableCategories()[0];
    expect(homeReducer(initialHomeState, { type: "selectCategory", category: slug })).toEqual({ topMode: "products", activeCategory: slug, activeDiscovery: "category" });
    // from a discount view too
    expect(homeReducer(discounts, { type: "selectCategory", category: slug }).activeDiscovery).toBe("category");
  });
  it("picking VSI from the sheet shows everything again", () => {
    const s = homeReducer(select("zajtrk"), { type: "selectCategory", category: "all" });
    expect(s.topMode).toBe("products");
    expect(visibleIds(s)).toEqual(products.map((p) => p.id));
  });
  it("discover actions switch to Izdelki, reset the category and are idempotent", () => {
    for (const discovery of ["discounts", "new"] as const) {
      const s = homeReducer(select("zajtrk"), { type: "discover", discovery });
      expect(s).toEqual({ topMode: "products", activeCategory: "all", activeDiscovery: discovery });
      expect(homeReducer(s, { type: "discover", discovery })).toEqual(s);
    }
  });
  it("viewAll shows the current selection in the top zone", () => {
    expect(homeReducer(initialHomeState, { type: "viewAll" })).toEqual(izdelki);
    expect(homeReducer(discounts, { type: "viewAll" })).toEqual(discounts);
  });
});

describe("categories", () => {
  it("options start with VSI, then the priority categories in order, then the rest", () => {
    const opts = categoryOptions();
    expect(opts[0]).toMatchObject({ key: "all", label: "VSI", count: products.length });
    const keys = opts.slice(1).map((o) => o.key);
    const priority = PRIORITY_CATEGORIES.filter((s) => productsInCategory(s).length > 0);
    expect(priority.length).toBeGreaterThanOrEqual(5);
    expect(keys.slice(0, priority.length)).toEqual(priority);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("labels come from categoryLabel and every option has products", () => {
    for (const o of categoryOptions().slice(1)) {
      expect(o.label.toLocaleLowerCase("sl")).toBe(categoryLabel(o.key).toLocaleLowerCase("sl"));
      expect(o.count).toBe(productsInCategory(o.key).length);
      expect(o.count).toBeGreaterThan(0);
    }
  });
  it("the priority slugs map to the expected labels", () => {
    expect(categoryLabel("mlecni-izdelki").toLocaleLowerCase("sl")).toBe("mlečni izdelki");
    expect(categoryLabel("pekovsko").toLocaleLowerCase("sl")).toBe("pekovsko pecivo");
  });
  it("selecting a category lists only its products", () => {
    for (const slug of availableCategories()) {
      const ids = visibleIds(select(slug));
      expect(ids).toEqual(productsInCategory(slug).map((p) => p.id));
      for (const id of ids) expect(getProduct(id)!.categories).toContain(slug);
    }
  });
});

describe("selectors", () => {
  it("every state returns existing, unique, priced products", () => {
    for (const s of allStates()) {
      for (const ids of [visibleIds(s), topItems(s), railItems(s)]) {
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) {
          expect(getProduct(id)).toBeDefined();
          expect(getPrimaryOffer(id)).toBeDefined();
        }
      }
    }
  });
  it("top list and rail derive from the same set in Izdelki mode", () => {
    for (const s of allStates().filter((x) => x.topMode === "products")) {
      expect(topItems(s)).toEqual(visibleIds(s));
      expect(railItems(s)).toEqual(visibleIds(s).slice(0, RAIL_MAX));
    }
  });
  it("the rail of a category shows that category (and its SPAR/INTERSPAR products)", () => {
    const s = select("mlecni-izdelki");
    const rail = railItems(s);
    expect(rail.length).toBeGreaterThan(0);
    for (const id of rail) expect(getProduct(id)!.categories).toContain("mlecni-izdelki");
    expect(railTitle(s)).toBe(`${categoryLabel("mlecni-izdelki").charAt(0).toLocaleUpperCase("sl")}${categoryLabel("mlecni-izdelki").slice(1)} iz kataloga`);
  });
  it("catalog mode rail is the editorial order with the default title", () => {
    const rail = railItems(initialHomeState);
    expect(rail).toEqual(products.map((p) => p.id).slice(0, rail.length));
    expect(railTitle(initialHomeState)).toBe(DEFAULT_RAIL_TITLE);
    expect(railTitle(izdelki)).toBe(DEFAULT_RAIL_TITLE);
  });
  it("discounts use only products from rankDiscounts, best percent first, in top and rail", () => {
    const ranked = rankDiscounts({ limit: Infinity });
    const pct = new Map(ranked.map((d) => [d.product.id, d.offer.discountPercent ?? 0]));
    const ids = topItems(discounts);
    expect(ids.every((id) => pct.has(id))).toBe(true);
    expect(ids.length).toBe(new Set(ranked.map((d) => d.product.id)).size);
    const list = ids.map((id) => pct.get(id) ?? -1);
    expect([...list].sort((a, b) => b - a)).toEqual(list);
    expect(railItems(discounts)).toEqual(ids.slice(0, RAIL_MAX));
    expect(railTitle(discounts)).toBe("Najbolj znižano");
  });
  it("new list contains only isNew products", () => {
    const ids = topItems(news);
    expect(ids).toEqual(newProducts().map((p) => p.id));
    for (const id of ids) expect(getProduct(id)!.isNew).toBeTruthy();
    expect(railTitle(news)).toBe("Novo v katalogu");
  });
  it("is deterministic", () => {
    for (const s of allStates()) expect(railItems(s)).toEqual(railItems({ ...s }));
  });
});
