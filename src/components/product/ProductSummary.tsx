"use client";
import { conditionText, formatPrice, getOffer, getPrimaryOffer, getProduct, unitLabel } from "@/lib/catalog";
import type { Product } from "@/lib/types";
import { offerNotes } from "./offerNotes";
import { ProductTile } from "./ProductTile";
import styles from "./ProductSummary.module.css";

/** The brand line above a product name, unless the name already carries the brand ("Perutnina Ptuj piščančje prsi"). */
export function brandLabel(p: Product): string | null {
  return p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? p.brand : null;
}

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
  const notes = offerNotes(offer);
  const unit = unitLabel(product.packSize, offer.priceUnit);
  const Name = heading ? (`h${heading}` as "h3") : "span";

  return (
    <span className={styles.summary}>
      <ProductTile productId={productId} size="carousel" minimal />
      <span className={styles.text}>
        {brandLabel(product) && <span className={styles.brand}>{brandLabel(product)}</span>}
        <Name className={styles.name}>{product.name}</Name>
        <span className={styles.pack}>{product.packSize}</span>
        {/* The visible price is the tile's red badge (aria-hidden); this keeps it for screen readers. */}
        <span className="sr-only">
          {formatPrice(offer.priceCents)}
          {unit ? ` ${unit}` : ""}
        </span>
        {cond && <span className={styles.note}>{cond}</span>}
        {notes.status && <span className={`${styles.note} ${styles.status}`}>{notes.status}</span>}
        {notes.availability && <span className={styles.note}>{notes.availability}</span>}
        {note && <span className={styles.note}>{note}</span>}
      </span>
    </span>
  );
}
