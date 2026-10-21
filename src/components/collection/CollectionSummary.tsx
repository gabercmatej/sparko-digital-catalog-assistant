"use client";
import { useEffect, useId, useRef, useState } from "react";
import { formatPrice } from "@/lib/catalog";
import type { CollectionTotals } from "@/lib/savings";
import { Icon } from "../ui/Icon";
import styles from "./CollectionSummary.module.css";

/**
 * Compact totals bar at the bottom of Moj katalog (a flex sibling of the scroll area, directly above the
 * bottom nav). Numbers come from collectionTotals(); skeletons are shown until the store is hydrated.
 */
export function CollectionSummary({ totals, hydrated }: { totals: CollectionTotals; hydrated: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const noteId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const total = formatPrice(totals.totalCents);
  const savings = formatPrice(totals.savingsCents);
  // Partial figures are marked "x od y" so an incomplete sum never reads as the exact total.
  const pricePartial = hydrated && totals.pricedCount < totals.itemCount;
  const savingsPartial = hydrated && totals.savingsKnownCount < totals.itemCount;

  return (
    <div ref={ref} className={styles.bar} data-collection-summary role="group" aria-label="Povzetek cen v Mojem katalogu" aria-busy={!hydrated}>
      <div className={styles.col}>
        <span className={styles.label}>Cena izdelkov</span>
        {hydrated ? (
          <strong className={`${styles.value} ${styles.total}`} data-total-price>
            {total}
          </strong>
        ) : (
          <span className={styles.skeleton} aria-hidden="true" />
        )}
        {pricePartial && (
          <span className={styles.partial} data-total-partial>
            vštetih {totals.pricedCount} od {totals.itemCount}
          </span>
        )}
      </div>
      <div className={styles.col}>
        <span className={styles.label}>Skupni prihranek</span>
        {hydrated ? (
          <strong className={`${styles.value} ${styles.savings}`} data-total-savings>
            {savings}
          </strong>
        ) : (
          <span className={styles.skeleton} aria-hidden="true" />
        )}
        {savingsPartial && (
          <span className={styles.partial} data-savings-partial>
            znan za {totals.savingsKnownCount} od {totals.itemCount}
          </span>
        )}
      </div>
      <button type="button" className={styles.info} aria-label="Kako je izračunano?" aria-expanded={open} aria-controls={noteId} onClick={() => setOpen((o) => !o)}>
        <Icon name="info" size={18} />
      </button>
      {open && (
        <div id={noteId} className={styles.note} role="note" data-summary-note>
          <p>Prihranek je izračunan za izdelke z znano redno ceno.</p>
          {hydrated && totals.spPlusCount > 0 && <p>Upoštevane so cene s kartico SPAR plus.</p>}
          {hydrated && totals.excludedPerKg > 0 && <p>{perKgText(totals.excludedPerKg)}</p>}
        </div>
      )}
    </div>
  );
}

/** "1 izdelek s ceno na kg ni vštet …" with Slovenian singular / dual / plural agreement. */
function perKgText(n: number): string {
  const m = n % 100;
  if (m === 1) return `${n} izdelek s ceno na kg ni vštet v ceno.`;
  if (m === 2) return `${n} izdelka s ceno na kg nista všteta v ceno.`;
  if (m === 3 || m === 4) return `${n} izdelki s ceno na kg niso všteti v ceno.`;
  return `${n} izdelkov s ceno na kg ni vštetih v ceno.`;
}
