import { formatPrice, splitPrice } from "@/lib/catalog";
import styles from "./PricePill.module.css";

/**
 * Rounded catalog-style price pill ("3,38€"). tone="now" is the red current price; tone="upcoming"
 * is the softer blue future (demo) promo price. Screen readers get the plain "3,38 €" text.
 */
export function PricePill({ cents, tone = "now", size = "md", srPrefix, className }: { cents: number; tone?: "now" | "upcoming"; size?: "sm" | "md" | "lg"; srPrefix?: string; className?: string }) {
  const { euros, cents: c } = splitPrice(cents);
  return (
    <span className={`${styles.pill} ${styles[tone]} ${styles[size]}${className ? ` ${className}` : ""}`} data-price-pill={tone}>
      <span aria-hidden="true" className={styles.num}>
        {euros},{c}
        <span className={styles.eur}>€</span>
      </span>
      <span className="sr-only">
        {srPrefix ? `${srPrefix} ` : ""}
        {formatPrice(cents)}
      </span>
    </span>
  );
}
