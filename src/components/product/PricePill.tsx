import { badgePrice, formatPrice } from "@/lib/catalog";
import styles from "./PricePill.module.css";

/**
 * Catalog-style price badge ("3,38 €", the € the same size as the digits). tone="now" is the red current price; tone="upcoming"
 * is the softer blue future (demo) promo price; tone="expired" is the muted neutral price of an offer that is not current. Screen readers get the plain "3,38 €" text.
 */
export function PricePill({ cents, tone = "now", size = "md", srPrefix, className }: { cents: number; tone?: "now" | "upcoming" | "expired"; size?: "sm" | "md" | "lg"; srPrefix?: string; className?: string }) {
  return (
    <span className={`${styles.pill} ${styles[tone]} ${styles[size]}${className ? ` ${className}` : ""}`} data-price-pill={tone}>
      <span aria-hidden="true" data-price>
        {badgePrice(cents)}
      </span>
      <span className="sr-only">
        {srPrefix ? `${srPrefix} ` : ""}
        {formatPrice(cents)}
      </span>
    </span>
  );
}
