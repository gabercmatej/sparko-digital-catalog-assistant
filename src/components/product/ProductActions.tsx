"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collectionHref, leafletHref } from "@/lib/catalog";
import { isSaved, removeProduct, requestHighlight, saveProduct, useStore } from "@/lib/store/store";
import { Icon } from "../ui/Icon";
import styles from "./ProductActions.module.css";

/**
 * The two equal-sized product actions (final UI override #2):
 *  1. "Dodaj v Moj katalog" (filled green) / "✓ V Mojem katalogu" (saved, links to the item)
 *  2. "Poglej v SPAR katalogu" (green outline) → opens the original leaflet at the product.
 * The separate remove action sits below the buttons once the product is saved.
 */
export function ProductActions({ productId, showLeaflet = true }: { productId: string; showLeaflet?: boolean }) {
  const store = useStore();
  const router = useRouter();
  const saved = isSaved(productId, store);

  return (
    <div className={styles.wrap}>
      <div className={styles.buttons}>
        {saved ? (
          <Link href={collectionHref(productId)} className={`btn btn-saved ${styles.action}`} aria-label="V Mojem katalogu – odpri Moj katalog">
            <Icon name="check" size={18} strokeWidth={2.4} />
            <span>V Mojem katalogu</span>
          </Link>
        ) : (
          <button type="button" className={`btn btn-primary ${styles.action}`} onClick={() => saveProduct(productId)}>
            <Icon name="plus" size={18} strokeWidth={2.2} />
            <span>Dodaj v Moj katalog</span>
          </button>
        )}
        {showLeaflet && (
          <button
            type="button"
            className={`btn btn-secondary ${styles.action}`}
            onClick={() => {
              requestHighlight(productId);
              router.push(leafletHref(productId));
            }}
          >
            <Icon name="leaflet" size={18} />
            <span>Poglej v SPAR katalogu</span>
          </button>
        )}
      </div>
      {saved && (
        <div className={styles.footer}>
          <button type="button" className={`btn btn-ghost btn-sm ${styles.remove}`} onClick={() => removeProduct(productId)}>
            Odstrani
          </button>
        </div>
      )}
    </div>
  );
}
