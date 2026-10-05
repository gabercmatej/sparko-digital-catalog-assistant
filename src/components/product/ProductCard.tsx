"use client";
import { conditionText, formatPrice, getOffer, getPrimaryOffer, getProduct, PRICE_UNIT_LABEL } from "@/lib/catalog";
import { ProductActions } from "./ProductActions";
import { ProductTile } from "./ProductTile";
import styles from "./ProductCard.module.css";

/**
 * Verified product card used in chat replies (product click and typed queries) and
 * in the leaflet / Moj katalog bottom sheets. All facts come from the catalog dataset.
 * Each fact appears once: packshot + red price on the tile, brand / name / pack size beside it.
 */
export function ProductCard({
  productId,
  offerId,
  showLeaflet = true,
  headingLevel = 3,
}: {
  productId: string;
  offerId?: string;
  showLeaflet?: boolean;
  headingLevel?: 2 | 3 | 4;
}) {
  const product = getProduct(productId);
  const offer = (offerId && getOffer(offerId)) || getPrimaryOffer(productId);
  if (!product || !offer) return null;
  const cond = conditionText(offer);
  const unit = PRICE_UNIT_LABEL[offer.priceUnit];
  const H = `h${headingLevel}` as "h3";

  return (
    <article className={styles.card} aria-label={`${product.name}, ${product.packSize}`} data-product-card={productId}>
      <div className={styles.top}>
        <ProductTile productId={productId} size="card" minimal />
        <div className={styles.details}>
          {product.brand && <span className={styles.brand}>{product.brand}</span>}
          <H className={styles.name}>{product.name}</H>
          <span className={styles.desc}>{product.packSize}</span>
          {/* The visible price is the tile's red badge (aria-hidden); this keeps it for screen readers. */}
          <span className="sr-only">
            {formatPrice(offer.priceCents)}
            {unit ? ` ${unit}` : ""}
          </span>
          {cond && <span className={styles.cond}>{cond}</span>}
        </div>
      </div>
      <ProductActions productId={productId} showLeaflet={showLeaflet} />
    </article>
  );
}
