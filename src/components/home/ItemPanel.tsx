"use client";
import { formatPrice, getPrimaryOffer, getProduct } from "@/lib/catalog";
import { PricePill } from "../product/PricePill";
import { PriceStack } from "../product/PriceStack";
import { categoryOptions, discountedProducts, topTitle, type CategoryKey, type HomeState } from "./homeState";
import styles from "./ItemPanel.module.css";

/** One list row: image left, brand / name / pack size in the middle, retailer label above the price on the right. */
function Row({ productId, percent, onSelect }: { productId: string; percent?: number; onSelect: (id: string) => void }) {
  const product = getProduct(productId);
  const offer = getPrimaryOffer(productId);
  if (!product || !offer) return null;
  const regular = offer.regularPriceCents;
  const label = `${product.brand ? product.brand + " " : ""}${product.name}, ${product.packSize}`;
  return (
    <li>
      <button type="button" className={styles.row} onClick={() => onSelect(productId)} data-home-row data-product-id={productId} aria-label={label}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.thumb} src={product.image.src} width={product.image.width} height={product.image.height} alt="" loading="lazy" decoding="async" draggable={false} />
        <span className={styles.text}>
          {product.brand && <span className={styles.brand}>{product.brand}</span>}
          <span className={styles.name}>{product.name}</span>
          <span className={styles.meta}>
            {product.packSize}
            {regular != null && (
              <>
                <span aria-hidden="true"> · </span>
                <s>{formatPrice(regular)}</s>
              </>
            )}
          </span>
        </span>
        <span className={styles.side}>
          {percent != null && <span className={styles.percent}>-{percent} %</span>}
          <PriceStack productId={productId}>
            <PricePill cents={offer.priceCents} size="md" />
          </PriceStack>
        </span>
      </button>
    </li>
  );
}

/**
 * Top zone, "Izdelki" mode. Fills the top box exactly (height comes from the parent): a fixed heading
 * and chip row, and a list that scrolls inside the remaining space, so changing results never moves
 * anything outside this box.
 */
export function ItemPanel({
  state,
  ids,
  onCategory,
  onSelect,
}: {
  state: HomeState;
  ids: string[];
  onCategory: (category: CategoryKey) => void;
  onSelect: (productId: string) => void;
}) {
  const percents = state.activeDiscovery === "discounts" ? new Map(discountedProducts().map((d) => [d.productId, d.percent])) : null;
  const chipsActive = state.activeDiscovery === "default" || state.activeDiscovery === "category";
  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.title}>{topTitle(state)}</h2>
        <span className={styles.count}>{ids.length} izdelkov</span>
      </div>
      <div className={styles.chips} role="group" aria-label="Kategorije">
        {categoryOptions().map((o) => (
          <button key={o.key} type="button" className={styles.chip} aria-pressed={chipsActive && state.activeCategory === o.key} onClick={() => onCategory(o.key)}>
            {o.label}
          </button>
        ))}
      </div>
      {ids.length === 0 ? (
        <p className={styles.empty}>V tem katalogu ni izdelkov za ta izbor.</p>
      ) : (
        <ul className={styles.list} aria-label={topTitle(state)} data-testid="home-list">
          {ids.map((id) => (
            <Row key={id} productId={id} percent={percents?.get(id)} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </div>
  );
}
