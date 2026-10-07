/**
 * Meal / breakfast suggestions from verified recipes. Totals are whole-pack costs from
 * `recipeTotals` (integer cents). A recipe is "in budget" only when the price that applies to
 * the user (with card, or without card when spPlus === "no") is known and <= budget.
 * Never invents a price to meet a budget: when nothing fits we say so and show the closest real total.
 */
import { products as allProducts, recipes as allRecipes, getPrimaryOffer, recipeLines, recipeTotals } from "@/lib/catalog";
import type { Product, Recipe, SpPlusSetting } from "@/lib/types";

export type MealRequest = {
  kind: "dinner" | "lunch" | "breakfast" | "any";
  servings: number | null;
  budgetCents: number | null;
  spPlus: SpPlusSetting;
};

export type RecipeEvaluation = {
  recipe: Recipe;
  totals: { withCard: number; withoutCard: number | null; needsCard: boolean } | null;
  /** Total that applies to this user (null = unknown). */
  effectiveCents: number | null;
  /** null when no budget was given. */
  fitsBudget: boolean | null;
  servingsOk: boolean;
  kindMatch: boolean;
};

export function evaluateRecipe(recipe: Recipe, req: MealRequest): RecipeEvaluation {
  const totals = recipeTotals(recipe);
  const effectiveCents = totals ? (req.spPlus === "no" ? totals.withoutCard : totals.withCard) : null;
  const fitsBudget = req.budgetCents == null ? null : effectiveCents != null && effectiveCents <= req.budgetCents;
  const servingsOk = req.servings == null || recipe.servings >= req.servings;
  const kindMatch = req.kind === "any" ? recipe.kind !== "breakfast" : recipe.kind === req.kind;
  return { recipe, totals, effectiveCents, fitsBudget, servingsOk, kindMatch };
}

export type MealSuggestion = {
  choice: RecipeEvaluation | null;
  /** True only when a budget was given and the chosen recipe is within it. */
  withinBudget: boolean;
  considered: number;
};

export function suggestMeal(req: MealRequest, recipes: readonly Recipe[] = allRecipes): MealSuggestion {
  const pool = recipes.filter((r) => (req.kind === "breakfast" ? r.kind === "breakfast" : r.kind !== "breakfast"));
  const evals = pool.map((r) => evaluateRecipe(r, req)).filter((e) => e.totals != null);
  if (!evals.length) return { choice: null, withinBudget: false, considered: 0 };
  const score = (e: RecipeEvaluation) => (e.fitsBudget === true ? 0 : 4) + (e.servingsOk ? 0 : 2) + (e.kindMatch ? 0 : 1);
  evals.sort(
    (a, b) =>
      score(a) - score(b) ||
      (a.effectiveCents ?? Number.MAX_SAFE_INTEGER) - (b.effectiveCents ?? Number.MAX_SAFE_INTEGER) ||
      a.recipe.id.localeCompare(b.recipe.id),
  );
  const choice = evals[0];
  return { choice, withinBudget: choice.fitsBudget === true, considered: evals.length };
}

/** Placeholder template describing the suggestion. */
export function mealTemplate(s: MealSuggestion, req: MealRequest): string {
  const c = s.choice;
  if (!c || !c.totals) {
    return req.kind === "breakfast"
      ? "Preverjenega recepta za zajtrk iz kataloga nimam, lahko pa ti pokažem nekaj izdelkov za zajtrk iz aktualne ponudbe."
      : "Za to iz kataloga še nimam preverjenega recepta s cenami vseh sestavin. Lahko ti pokažem posamezne izdelke iz aktualne ponudbe.";
  }
  const id = c.recipe.id;
  const dish = `{{recipeTitle:${id}}} (porcije: {{recipeServings:${id}}})`;
  const lead =
    req.budgetCents != null && c.fitsBudget
      ? `Če gledava aktualno ponudbo v katalogu, lahko v okviru {{budget}} pripraviš: ${dish}.`
      : req.kind === "breakfast"
        ? `Iz aktualnega kataloga ti za zajtrk predlagam: ${dish}.`
        : req.kind === "dinner"
          ? `Seveda – pogledal sem aktualni katalog. Za večerjo ti predlagam: ${dish}.`
          : req.kind === "lunch"
            ? `Seveda – pogledal sem aktualni katalog. Za kosilo ti predlagam: ${dish}.`
            : `Iz aktualnega kataloga ti predlagam: ${dish}.`;
  const parts: string[] = [lead];
  const cardNote = c.totals.needsCard && req.spPlus !== "no" ? " s kartico SPAR plus" : "";
  if (c.effectiveCents != null) {
    parts.push(`Cela potrebna pakiranja skupaj stanejo {{recipeTotal:${id}}}${cardNote}.`);
  } else {
    parts.push(`Cena brez kartice SPAR plus za vse sestavine v katalogu ni navedena; s kartico skupaj stanejo {{recipeTotalCard:${id}}}.`);
  }
  if (req.budgetCents != null && !c.fitsBudget) {
    if (c.effectiveCents == null) parts.push(`Zato ne morem potrditi, da je v okviru {{budget}}.`);
    else parts.push(`Noben preverjen recept iz kataloga ne pride v okvir {{budget}}, to je najbližji.`);
  }
  if (!c.servingsOk) parts.push(`Recept je za manj oseb, kot si želiš, zato bi potreboval več pakiranj.`);
  if (c.recipe.pantryAssumptions.length) parts.push(`Predpostavka: {{pantry:${id}}}.`);
  return parts.join(" ");
}

/** Product ids used by a recipe (whole-pack lines), in recipe order. */
export function recipeProductIds(recipe: Recipe): string[] {
  return (recipeLines(recipe) ?? []).map((l) => l.product.id);
}

/** Verified breakfast products when there is no breakfast recipe. */
export function breakfastProducts(limit = 4, list: readonly Product[] = allProducts): Product[] {
  return list.filter((p) => p.categories.includes("zajtrk") && !!getPrimaryOffer(p.id)).slice(0, limit);
}
