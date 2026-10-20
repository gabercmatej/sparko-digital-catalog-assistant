"use client";
import { getPrimaryOffer, getProduct, PRICE_UNIT_LABEL } from "@/lib/catalog";
import { isSaved, useStore } from "@/lib/store/store";
import { Icon } from "../ui/Icon";
import { PricePill } from "./PricePill";
import { RetailerBadge } from "./RetailerBadge";
import styles from "./ProductMiniCard.module.css";

/**
 * The compact white product card of the home rail and the "Priporočila zate" band:
 * SPAR / INTERSPAR label, packshot, name, pack size and the red price pill. Optional round
 * "+" (onAdd) in the top-right corner. Width comes from the parent (fixed in a rail, 1fr in a grid).
 */
export function ProductMiniCard({
  productId,
  onSelect,
  onAdd,
  className,
}: {
  productId: string;
  onSelect?: () => void;
  /** Shows the round "+" add button; hidden once the product is saved (a check is shown instead). */
  onAdd?: () => void;
  className?: string;
}) {
  const store = useStore();
  const product = getProduct(productId);
  const offer = getPrimaryOffer(productId);
  if (!product || !offer) return null;
  const saved = isSaved(productId, store);
  const unit = PRICE_UNIT_LABEL[offer.priceUnit];
  const label = `${product.brand ? product.brand + " " : ""}${product.name}, ${product.packSize}${saved ? ", v Mojem katalogu" : ""}`;

  const body = (
    <>
      <RetailerBadge productId={productId} size="xs" className={styles.badge} />
      <span className={styles.media}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={product.image.src} width={product.image.width} height={product.image.height} alt="" loading="lazy" decoding="async" draggable={false} />
      </span>
      <span className={styles.name}>{product.name}</span>
      <span className={styles.foot}>
        <span className={styles.pack}>
          {product.packSize}
          {unit && <span className={styles.unit}>{unit}</span>}
        </span>
        <PricePill cents={offer.priceCents} size="sm" />
      </span>
    </>
  );

  return (
    <div className={`${styles.card}${className ? ` ${className}` : ""}`} data-product-id={productId} data-saved={saved || undefined} data-mini-card>
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
