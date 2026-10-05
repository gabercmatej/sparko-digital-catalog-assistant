"use client";
import { conditionText, formatPrice, getOffer, getPrimaryOffer, getProduct, PRICE_UNIT_LABEL } from "@/lib/catalog";
import { ProductTile } from "./ProductTile";
import styles from "./ProductSummary.module.css";

/**
 * The single compact product presentation: small packshot tile (image + red price) on the
 * left, brand / name / pack size on the right. Shared by chat cards, expandable chat rows
 * and the product sheets so every product looks the same. Inline-only markup (spans) so it
 * can sit inside a button; pass `heading` to render the name as a heading instead.
 */
export function ProductSummary({
  productId,
  offerId,
  heading,
  note,
}: {
  productId: string;
  offerId?: string;
  heading?: 2 | 3 | 4;
  note?: string;
}) {
  const product = getProduct(productId);
  const offer = (offerId && getOffer(offerId)) || getPrimaryOffer(productId);
  if (!product || !offer) return null;
  const cond = conditionText(offer);
  const unit = PRICE_UNIT_LABEL[offer.priceUnit];
  const Name = heading ? (`h${heading}` as "h3") : "span";

  return (
    <span className={styles.summary}>
      <ProductTile productId={productId} size="carousel" minimal />
      <span className={styles.text}>
        {product.brand && <span className={styles.brand}>{product.brand}</span>}
        <Name className={styles.name}>{product.name}</Name>
        <span className={styles.pack}>{product.packSize}</span>
        {/* The visible price is the tile's red badge (aria-hidden); this keeps it for screen readers. */}
        <span className="sr-only">
          {formatPrice(offer.priceCents)}
          {unit ? ` ${unit}` : ""}
        </span>
        {cond && <span className={styles.note}>{cond}</span>}
        {note && <span className={styles.note}>{note}</span>}
      </span>
    </span>
  );
}
