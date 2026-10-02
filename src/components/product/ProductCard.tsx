"use client";
import { assessOffer } from "@/lib/assessment";
import { conditionText, formatPrice, getOffer, getPrimaryOffer, getProduct, PRICE_UNIT_LABEL, validityText } from "@/lib/catalog";
import { useStore } from "@/lib/store/store";
import { ProductActions } from "./ProductActions";
import { ProductTile } from "./ProductTile";
import styles from "./ProductCard.module.css";

/**
 * Verified product card used in chat replies (product click and typed queries) and
 * in the leaflet bottom sheet. All facts come from the catalog dataset.
 */
export function ProductCard({
  productId,
  offerId,
  reason,
  showLeaflet = true,
  headingLevel = 3,
}: {
  productId: string;
  offerId?: string;
  reason?: string;
  showLeaflet?: boolean;
  headingLevel?: 2 | 3 | 4;
}) {
  const store = useStore();
  const product = getProduct(productId);
  const offer = (offerId && getOffer(offerId)) || getPrimaryOffer(productId);
  if (!product || !offer) return null;
  const cond = conditionText(offer);
  const unit = PRICE_UNIT_LABEL[offer.priceUnit];
  const assessments = assessOffer(product, offer, { savedProductIds: store.saved.map((s) => s.productId) });
  const H = `h${headingLevel}` as "h3";

  return (
    <article className={styles.card} aria-label={`${product.name}, ${product.packSize}`} data-product-card={productId}>
      <div className={styles.top}>
        <ProductTile productId={productId} size="card" />
        <div className={styles.details}>
          {product.brand && <span className={styles.brand}>{product.brand}</span>}
          <H className={styles.name}>{product.name}</H>
          <span className={styles.desc}>{[product.descriptor, product.packSize].filter(Boolean).join(", ")}</span>
          <span className={styles.price}>
            {formatPrice(offer.priceCents)}
            {unit && <span className={styles.unit}> {unit}</span>}
          </span>
          {cond && <span className={styles.cond}>{cond}</span>}
        </div>
      </div>
      {reason && <p className={styles.reason}>{reason}</p>}
      {assessments.length > 0 && (
        <ul className={styles.assessments} aria-label="Sparkova ocena">
          {assessments.map((a) => (
            <li key={a.kind} className={styles.assessment}>
              <strong>{a.label}</strong>
              <span> · {a.reason}</span>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.validity}>{validityText(offer)}</p>
      <ProductActions productId={productId} showLeaflet={showLeaflet} />
    </article>
  );
}
