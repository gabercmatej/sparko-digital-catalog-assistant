"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collectionHref, leafletHref } from "@/lib/catalog";
import { isSaved, removeProduct, requestHighlight, saveProduct, toggleProduct, useStore } from "@/lib/store/store";
import { Icon } from "../ui/Icon";
import styles from "./ProductActions.module.css";

/**
 * The two equal-sized product actions (final UI override #2):
 *  1. "Dodaj v Moj katalog" (filled green) / "✓ V Mojem katalogu" (saved, links to the item)
 *  2. "Poglej v SPAR katalogu" (green outline) → opens the original leaflet at the product.
 * The separate remove action sits below the buttons once the product is saved.
 * `toggle` (chat messages): the saved button itself removes the product again, no separate remove.
 */
export function ProductActions({ productId, showLeaflet = true, toggle = false }: { productId: string; showLeaflet?: boolean; toggle?: boolean }) {
  const store = useStore();
  const router = useRouter();
  const saved = isSaved(productId, store);
  const openLeaflet = () => {
    requestHighlight(productId);
    router.push(leafletHref(productId));
  };

  if (toggle) {
    return (
      <div className={styles.buttons} data-toggle-actions>
        <button
          type="button"
          className={`btn ${saved ? "btn-saved" : "btn-primary"} ${styles.action}`}
          onClick={() => toggleProduct(productId)}
          data-saved={saved || undefined}
        >
          <Icon name={saved ? "check" : "plus"} size={18} strokeWidth={saved ? 2.4 : 2.2} />
          <span>{saved ? "V mojem katalogu" : "Dodaj v Moj katalog"}</span>
          {saved && <span className="sr-only">, tapni za odstranitev</span>}
        </button>
        {showLeaflet && (
          <button type="button" className={`btn btn-secondary ${styles.action} ${styles.leaflet}`} onClick={openLeaflet}>
            <Icon name="leaflet" size={18} />
            <span>Poglej v SPAR katalogu</span>
          </button>
        )}
      </div>
    );
  }

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
            onClick={openLeaflet}
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
