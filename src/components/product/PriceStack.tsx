import type { ReactNode } from "react";
import { RetailerBadge } from "./RetailerBadge";
import styles from "./PriceStack.module.css";

/**
 * The shared price area of every product card, row and tile: the SPAR / INTERSPAR RetailerBadge
 * RIGHT-aligned directly above the price (`children`: a PricePill, a red price block, ...).
 * Same badge size everywhere (xs) so the source label looks identical on all cards.
 */
export function PriceStack({ productId, children, className }: { productId: string; children: ReactNode; className?: string }) {
  return (
    <span className={`${styles.stack}${className ? ` ${className}` : ""}`} data-price-stack>
      <RetailerBadge productId={productId} size="xs" className={styles.badge} />
      {children}
    </span>
  );
}
