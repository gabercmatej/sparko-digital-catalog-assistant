"use client";
import { getOffer, getPrimaryOffer, getProduct } from "@/lib/catalog";
import { ProductActions } from "./ProductActions";
import { ProductSummary } from "./ProductSummary";
import styles from "./ProductCard.module.css";

/**
 * Verified product card used in chat replies (product click and typed queries) and
 * in the leaflet / Moj katalog bottom sheets. All facts come from the catalog dataset.
 * The compact summary (shared with the chat rows) plus the actions.
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

  return (
    <article className={styles.card} aria-label={`${product.name}, ${product.packSize}`} data-product-card={productId}>
      <ProductSummary productId={productId} offerId={offer.id} heading={headingLevel} />
      <ProductActions productId={productId} showLeaflet={showLeaflet} />
    </article>
  );
}
