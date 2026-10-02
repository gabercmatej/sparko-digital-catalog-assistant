"use client";
import { formatPrice, getRecipe, recipeLines, recipeTotals } from "@/lib/catalog";
import { saveProduct, useStore } from "@/lib/store/store";
import { ProductTile } from "../product/ProductTile";
import styles from "./RecipeCard.module.css";

/** Checked meal suggestion: whole-pack costs, conversions, pantry assumptions, steps. */
export function RecipeCard({ recipeId }: { recipeId: string }) {
  const { settings } = useStore();
  const recipe = getRecipe(recipeId);
  if (!recipe) {
    return <p className={styles.missing}>Tega recepta v demo katalogu ne najdem.</p>;
  }
  const lines = recipeLines(recipe);
  const totals = recipeTotals(recipe);
  const budget = recipe.budgetCents;
  // Which total applies to this tester: SPAR plus "yes" → card price; "no" → without card; unset → be conservative.
  const relevant = !totals ? null : !totals.needsCard || settings.spPlus === "yes" ? totals.withCard : totals.withoutCard;
  const withinBudget = budget != null && relevant != null && relevant <= budget;

  return (
    <article className={styles.card} aria-label={`Recept: ${recipe.title}`}>
      <header className={styles.head}>
        <h3 className={styles.title}>{recipe.title}</h3>
        <p className={styles.meta}>
          {recipe.servings} {recipe.servings === 1 ? "porcija" : recipe.servings === 2 ? "porciji" : recipe.servings < 5 ? "porcije" : "porcij"}
          {recipe.minutes ? ` · približno ${recipe.minutes} min` : ""}
          {budget != null ? ` · proračun ${formatPrice(budget)}` : ""}
        </p>
      </header>

      {lines ? (
        <ul className={styles.lines} aria-label="Sestavine iz demo kataloga">
          {lines.map((l) => (
            <li key={l.offer.id} className={styles.line}>
              <ProductTile productId={l.product.id} size="carousel" onSelect={() => saveProduct(l.product.id)} ariaLabelPrefix="Dodaj v Moj katalog" />
              <div className={styles.lineText}>
                <span className={styles.lineName}>{l.product.name}</span>
                <span className={styles.lineQty}>Potrebuješ: {l.requiredQuantity}</span>
                <span className={styles.lineCost}>
                  {l.packs} × {l.product.packSize} po {formatPrice(l.offer.priceCents)} = <strong>{formatPrice(l.lineCents)}</strong>
                </span>
                {l.conversionNote && <span className={styles.lineNote}>{l.conversionNote}</span>}
                {(l.offer.conditions.spPlusRequired || l.offer.conditions.couponRequired) && (
                  <span className={styles.lineNote}>{l.offer.conditions.spPlusRequired ? "Cena s kartico SPAR plus" : "Cena s kuponom"}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.missing}>Za eno od sestavin cena celega pakiranja ni znana, zato skupne cene ne računam.</p>
      )}

      {totals && (
        <div className={styles.totals}>
          {totals.needsCard ? (
            <>
              <div className={styles.totalRow}>
                <span>Skupaj s kartico SPAR plus</span>
                <strong>{formatPrice(totals.withCard)}</strong>
              </div>
              <div className={styles.totalRow}>
                <span>Brez kartice</span>
                {totals.withoutCard != null ? <strong>{formatPrice(totals.withoutCard)}</strong> : <span className={styles.unknown}>brez kartice cena ni znana</span>}
              </div>
            </>
          ) : (
            <div className={styles.totalRow}>
              <span>Skupaj za cela pakiranja</span>
              <strong>{formatPrice(totals.withCard)}</strong>
            </div>
          )}
          {withinBudget && <span className={styles.budget}>V tvojem proračunu</span>}
          {!withinBudget && totals.needsCard && settings.spPlus !== "yes" && budget != null && totals.withCard <= budget && (
            <span className={styles.budgetNote}>V proračunu s kartico SPAR plus.</span>
          )}
        </div>
      )}

      {recipe.pantryAssumptions.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.subTitle}>Predpostavke</h4>
          <ul className={styles.assumptions}>
            {recipe.pantryAssumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {recipe.steps.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.subTitle}>Priprava</h4>
          <ol className={styles.steps}>
            {recipe.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}
      <p className={styles.footnote}>Cene iz demo kataloga. Tapni izdelek, da ga dodaš v Moj katalog.</p>
    </article>
  );
}
