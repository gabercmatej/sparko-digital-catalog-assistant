"use client";
import { badgePrice, formatPrice, getOffer, getPrimaryOffer, getProduct, PRICE_UNIT_LABEL } from "@/lib/catalog";
import type { Offer } from "@/lib/types";
import { ProductActions } from "./ProductActions";
import { brandLabel, ProductSummary } from "./ProductSummary";
import { RetailerBadge } from "./RetailerBadge";
import { ProductTile } from "./ProductTile";
import styles from "./ProductCard.module.css";

/**
 * Verified product card used in chat replies (product click and typed queries) and
 * in the leaflet / Moj katalog bottom sheets. All facts come from the catalog dataset.
 * The compact summary (shared with the chat rows) plus the actions.
 *
 * `variant="chat"` is the in-message presentation: a plain white product row (packshot, brand,
 * name, pack size, red price block in the bottom-right corner) followed by the one-button
 * Moj katalog toggle and the SPAR katalog action; it sits inside Sparko's grey message bubble.
 */
export function ProductCard({
  productId,
  offerId,
  showLeaflet = true,
  headingLevel = 3,
  variant = "default",
}: {
  productId: string;
  offerId?: string;
  showLeaflet?: boolean;
  headingLevel?: 2 | 3 | 4;
  variant?: "default" | "chat";
}) {
  const product = getProduct(productId);
  const offer = (offerId && getOffer(offerId)) || getPrimaryOffer(productId);
  if (!product || !offer) return null;

  if (variant === "chat") {
    const Name = `h${headingLevel}` as "h3";
    return (
      <article className={styles.chat} aria-label={`${product.name}, ${product.packSize}`} data-product-card={productId} data-variant="chat">
        <div className={styles.row} data-product-row>
          <ProductTile productId={productId} size="carousel" thumb />
          <div className={styles.info}>
            {brandLabel(product) && <span className={styles.brand}>{brandLabel(product)}</span>}
            <Name className={styles.name}>{product.name}</Name>
          </div>
          <span className={styles.pack}>{product.packSize}</span>
          <PriceBlock offer={offer} productId={productId} />
        </div>
        <ProductActions productId={productId} showLeaflet={showLeaflet} toggle />
      </article>
    );
  }

  return (
    <article className={styles.card} aria-label={`${product.name}, ${product.packSize}`} data-product-card={productId}>
      <ProductSummary productId={productId} offerId={offer.id} heading={headingLevel} />
      <ProductActions productId={productId} showLeaflet={showLeaflet} />
    </article>
  );
}

/**
 * The catalog-style red price block ("3,38 €" as one run of text) with the SPAR / INTERSPAR RetailerBadge
 * (right-aligned, when `productId` is given) and the "SPAR plus" / unit label above it. Shared by the chat card and the compact chat rows; it occupies the `price` grid area and
 * is meant to sit flush in the bottom-right corner of its white row. Inline markup only (spans).
 */
export function PriceBlock({ offer, productId, compact = false }: { offer: Offer; productId?: string; compact?: boolean }) {
  const unit = PRICE_UNIT_LABEL[offer.priceUnit];
  return (
    <span className={`${styles.priceWrap}${compact ? ` ${styles.compact}` : ""}`} data-price-block>
      {productId && <RetailerBadge productId={productId} size="xs" className={styles.badge} />}
      {offer.conditions.spPlusRequired && <span className={styles.cond}>SPAR plus</span>}
      {unit && <span className={styles.unit}>{unit}</span>}
      <span className={styles.price} aria-hidden="true" data-price>
        {badgePrice(offer.priceCents)}
      </span>
      <span className="sr-only">
        {formatPrice(offer.priceCents)}
        {unit ? ` ${unit}` : ""}
      </span>
    </span>
  );
}
