"use client";
import { getPrimaryOffer, getProduct, splitPrice, PRICE_UNIT_LABEL } from "@/lib/catalog";
import { isSaved, useStore } from "@/lib/store/store";
import { Icon } from "../ui/Icon";
import styles from "./ProductTile.module.css";

type Size = "carousel" | "card" | "grid";

/**
 * The canonical square product tile: exact 1:1, sharp corners, light gray,
 * contained (never stretched) packshot, catalog-style red price block.
 * Interactive when `onSelect` is given. `minimal` drops the printed name and pack size for
 * layouts that already show them next to the tile, so nothing is repeated.
 */
export function ProductTile({
  productId,
  size = "grid",
  onSelect,
  showSaved = true,
  ariaLabelPrefix,
  minimal = false,
  thumb = false,
}: {
  productId: string;
  size?: Size;
  onSelect?: () => void;
  showSaved?: boolean;
  ariaLabelPrefix?: string;
  minimal?: boolean;
  /** Packshot (+ saved check) only, on a transparent ground: for layouts that print the price themselves. */
  thumb?: boolean;
}) {
  const store = useStore();
  const product = getProduct(productId);
  const offer = getPrimaryOffer(productId);
  if (!product || !offer) return null;
  const saved = showSaved && isSaved(productId, store);
  const { euros, cents } = splitPrice(offer.priceCents);
  const unitLabel = PRICE_UNIT_LABEL[offer.priceUnit];
  const label = `${ariaLabelPrefix ? ariaLabelPrefix + ": " : ""}${product.brand ? product.brand + " " : ""}${product.name}, ${product.packSize}, ${euros},${cents} €${unitLabel ? " " + unitLabel : ""}${offer.conditions.spPlusRequired ? ", s kartico SPAR plus" : ""}${saved ? ", v Mojem katalogu" : ""}`;

  const inner = (
    <>
      <span className={styles.media}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={product.image.src} width={product.image.width} height={product.image.height} alt="" loading={size === "carousel" ? "eager" : "lazy"} decoding="async" draggable={false} />
      </span>
      {!minimal && !thumb && <span className={styles.name}>{product.name}</span>}
      {!thumb && (
        <span className={styles.meta}>
          <span className={styles.text}>{!minimal && <span className={styles.pack}>{product.packSize}</span>}</span>
          <span className={styles.priceWrap}>
            {offer.conditions.spPlusRequired && <span className={styles.cond}>SPAR plus</span>}
            <span className={styles.price} aria-hidden="true">
              <span className={styles.euros}>{euros}</span>
              <span className={styles.comma}>,</span>
              <span className={styles.cents}>{cents}</span>
              <span className={styles.eur}>€</span>
            </span>
          </span>
        </span>
      )}
      {unitLabel && !thumb && <span className={styles.unit}>{unitLabel}</span>}
      {saved && (
        <span className={styles.savedBadge} aria-hidden="true">
          <Icon name="check" size={size === "carousel" ? 12 : 15} strokeWidth={3} />
        </span>
      )}
    </>
  );

  const cls = `${styles.tile} ${styles[size]}${minimal ? ` ${styles.minimal}` : ""}${thumb ? ` ${styles.thumb}` : ""}`;
  if (onSelect) {
    return (
      <button type="button" className={cls} onClick={onSelect} aria-label={label} data-product-id={productId} data-saved={saved || undefined}>
        {inner}
      </button>
    );
  }
  return (
    <div className={cls} role="img" aria-label={label} data-product-id={productId} data-saved={saved || undefined}>
      {inner}
    </div>
  );
}
