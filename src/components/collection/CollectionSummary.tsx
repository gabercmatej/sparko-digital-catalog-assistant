"use client";
import { formatPrice } from "@/lib/catalog";
import type { CollectionTotals } from "@/lib/savings";
import styles from "./CollectionSummary.module.css";

/**
 * Compact totals bar at the bottom of Moj katalog (a flex sibling of the scroll area, directly above the
 * bottom nav). Numbers come from collectionTotals(); skeletons are shown until the store is hydrated.
 */
export function CollectionSummary({ totals, hydrated }: { totals: CollectionTotals; hydrated: boolean }) {
  const total = formatPrice(totals.totalCents);
  const savings = formatPrice(totals.savingsCents);

  return (
    <div className={styles.bar} data-collection-summary role="group" aria-label="Povzetek cen v Mojem katalogu" aria-busy={!hydrated}>
      <div className={`${styles.col} ${styles.colTotal}`}>
        <span className={styles.label}>Skupni znesek</span>
        {hydrated ? (
          <strong className={styles.value} data-total-price>
            {total}
          </strong>
        ) : (
          <span className={styles.skeleton} aria-hidden="true" />
        )}
      </div>
      <div className={`${styles.col} ${styles.colSavings}`}>
        <span className={styles.label}>Skupni prihranek</span>
        {hydrated ? (
          <strong className={styles.value} data-total-savings aria-label={`Skupni prihranek ${savings}`}>
            {totals.savingsCents > 0 ? `\u2212${savings}` : savings}
          </strong>
        ) : (
          <span className={styles.skeleton} aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
