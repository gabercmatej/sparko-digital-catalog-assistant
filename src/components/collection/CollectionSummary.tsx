"use client";
import { formatPrice } from "@/lib/catalog";
import type { CollectionTotals } from "@/lib/savings";
import styles from "./CollectionSummary.module.css";

/**
 * Compact totals bar at the bottom of Moj katalog (a flex sibling of the scroll area, directly above the
 * bottom nav). Numbers come from collectionTotals() (current offers only; `excluded` items get a one-line note); skeletons are shown until the store is hydrated.
 */
/** Slovene number agreement: "1 izdelek ... ni vštet", "2 izdelka ... nista všteta", "3 izdelki / 5 izdelkov ... niso všteti". */
function excludedNote(n: number): string {
  const noun = n === 1 ? "izdelek" : n === 2 ? "izdelka" : n <= 4 ? "izdelki" : "izdelkov";
  const verb = n === 1 ? "ni vštet" : n === 2 ? "nista všteta" : "niso všteti";
  return `${n} ${noun} s preteklo ponudbo ${verb}.`;
}

export function CollectionSummary({ totals, hydrated, excluded = 0 }: { totals: CollectionTotals; hydrated: boolean; excluded?: number }) {
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
      {hydrated && excluded > 0 && (
        <p className={styles.note} data-excluded-note>
          {excludedNote(excluded)}
        </p>
      )}
    </div>
  );
}
