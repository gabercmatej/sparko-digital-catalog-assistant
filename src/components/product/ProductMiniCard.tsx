"use client";
import { getPrimaryOffer, getProduct, unitLabel } from "@/lib/catalog";
import { isSaved, useStore } from "@/lib/store/store";
import { Icon } from "../ui/Icon";
import { offerNotes } from "./offerNotes";
import { PricePill } from "./PricePill";
import { RetailerBadge } from "./RetailerBadge";
import styles from "./ProductMiniCard.module.css";

/**
 * The compact white product card of the home rail and the "Priporočila zate" band:
 * Anatomy (grid rows): [SPAR / INTERSPAR label top-left | "+" / check top-right] / packshot (flexible,
 * contained) / bold name (2 lines reserved) / [pack size bottom-left | red square price bottom-right].
 * Also used by the chat carousel (`rail`). Optional round "+" (onAdd) in the top-right corner. Width: 100% of the parent, or the canonical fixed rail width with `rail`.
 */
export function ProductMiniCard({
  productId,
  onSelect,
  onAdd,
  className,
  rail = false,
  ariaLabelPrefix,
}: {
  productId: string;
  onSelect?: () => void;
  /** Shows the round "+" add button; hidden once the product is saved (a check is shown instead). */
  onAdd?: () => void;
  className?: string;
  /** Fixed canonical rail width (--mini-card-w, 134px): home rail and chat carousel. Otherwise 100% of the parent (grids). */
  rail?: boolean;
  /** Accessible-name prefix, e.g. "Pokaži" -> "Pokaži: Brand Name, 500 g". */
  ariaLabelPrefix?: string;
}) {
  const store = useStore();
  const product = getProduct(productId);
  const offer = getPrimaryOffer(productId);
  if (!product || !offer) return null;
  const notes = offerNotes(offer);
  const saved = isSaved(productId, store);
  const unit = unitLabel(product.packSize, offer.priceUnit);
  const label = `${ariaLabelPrefix ? ariaLabelPrefix + ": " : ""}${product.brand ? product.brand + " " : ""}${product.name}, ${product.packSize}${notes.status ? ", " + notes.status : ""}${saved ? ", v Mojem katalogu" : ""}`;

  const body = (
    <>
      <span className={styles.top}>
        <RetailerBadge productId={productId} size="xs" className={styles.badge} />
      </span>
      <span className={styles.media}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={product.image.src} width={product.image.width} height={product.image.height} alt="" loading="lazy" decoding="async" draggable={false} />
      </span>
      <span className={styles.name}>{product.name}</span>
      <span className={styles.foot}>
        <span className={styles.pack} data-card-pack>
          {product.packSize}
          {unit && <span className={styles.unit}>{unit}</span>}
        </span>
        <PricePill cents={offer.priceCents} size="sm" tone={notes.current ? "now" : "expired"} className={styles.price} />
      </span>
    </>
  );

  return (
    <div className={`${styles.card}${rail ? ` ${styles.rail}` : ""}${className ? ` ${className}` : ""}`} data-product-id={productId} data-saved={saved || undefined} data-mini-card>
      {onSelect ? (
        <button type="button" className={styles.hit} onClick={onSelect} aria-label={label}>
          {body}
        </button>
      ) : (
        <div className={styles.hit} role="group" aria-label={label}>
          {body}
        </div>
      )}
      {saved ? (
        <span className={`${styles.corner} ${styles.saved}`} aria-hidden="true">
          <Icon name="check" size={14} strokeWidth={3} />
        </span>
      ) : (
        onAdd && (
          <button type="button" className={`${styles.corner} ${styles.add}`} onClick={onAdd} aria-label={`Dodaj v Moj katalog: ${product.name}`}>
            <Icon name="plus" size={16} strokeWidth={2.6} />
          </button>
        )
      )}
    </div>
  );
}
