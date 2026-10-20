import { RETAILER_LABEL, retailerOf } from "@/lib/catalog";
import type { Retailer } from "@/lib/types";
import styles from "./RetailerBadge.module.css";

/**
 * The SPAR / INTERSPAR source label shown on EVERY product card, row and tile: a red wordmark box
 * plus the green SPAR tree roundel. Pass `retailer` directly or a `productId` to derive it from the
 * product's catalog. Renders nothing for an unknown product.
 */
export function RetailerBadge({ retailer, productId, size = "sm", className }: { retailer?: Retailer; productId?: string; size?: "xs" | "sm" | "md"; className?: string }) {
  const r = retailer ?? (productId ? retailerOf(productId) : undefined);
  if (!r) return null;
  const label = RETAILER_LABEL[r];
  return (
    <span className={`${styles.badge} ${styles[size]}${className ? ` ${className}` : ""}`} data-retailer={r} aria-label={label} role="img">
      <span className={styles.word} aria-hidden="true">
        {label}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/spar-tree.svg" alt="" className={styles.tree} width={14} height={14} aria-hidden="true" />
    </span>
  );
}
