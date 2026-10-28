import { CATEGORY_LABEL } from "@/lib/catalog";
import type { LeafletCategory } from "@/lib/types";
import retailer from "../product/RetailerBadge.module.css";
import styles from "./CatalogBadge.module.css";

const WORD: Record<LeafletCategory, string> = { spar: "SPAR", interspar: "INTERSPAR", "spar-online": "SPAR", despar: "DESPAR" };

/**
 * Store-format label of a leaflet, in the same red wordmark + SPAR tree style as the product RetailerBadge.
 * SPAR Online adds its "ONLINE" suffix, as on its own leaflet.
 */
export function CatalogBadge({ category, size = "sm", className }: { category: LeafletCategory; size?: "xs" | "sm" | "md"; className?: string }) {
  return (
    <span className={`${retailer.badge} ${retailer[size]} ${styles.badge}${className ? ` ${className}` : ""}`} data-category={category} aria-label={CATEGORY_LABEL[category]} role="img">
      <span className={retailer.word} aria-hidden="true">
        {WORD[category]}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/spar-tree.svg" alt="" className={retailer.tree} width={14} height={14} aria-hidden="true" />
      {category === "spar-online" && (
        <span className={styles.suffix} aria-hidden="true">
          ONLINE
        </span>
      )}
    </span>
  );
}
