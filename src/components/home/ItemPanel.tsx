"use client";
import { formatPrice, getPrimaryOffer, getProduct } from "@/lib/catalog";
import { categoryLabel } from "@/lib/recommendations";
import { PricePill } from "../product/PricePill";
import { RetailerBadge } from "../product/RetailerBadge";
import { availableCategories, discountedProducts, TOP_PREVIEW, topTitle, type HomeState } from "./homeState";
import styles from "./ItemPanel.module.css";

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase("sl") + s.slice(1);

function Row({ productId, percent, onSelect }: { productId: string; percent?: number; onSelect: (id: string) => void }) {
  const product = getProduct(productId);
  const offer = getPrimaryOffer(productId);
  if (!product || !offer) return null;
  const regular = offer.regularPriceCents;
  return (
    <li>
      <button type="button" className={styles.row} onClick={() => onSelect(productId)} data-product-id={productId}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.thumb} src={product.image.src} width={product.image.width} height={product.image.height} alt="" loading="lazy" decoding="async" draggable={false} />
        <span className={styles.text}>
          <RetailerBadge productId={productId} size="sm" />
          <span className={styles.name}>{product.name}</span>
          <span className={styles.meta}>
            {product.packSize}
            {regular != null && (
              <>
                <span aria-hidden="true"> · </span>
                <span className={styles.regular}>
                  <span className="sr-only">Redna cena </span>
                  <s>{formatPrice(regular)}</s>
                </span>
              </>
            )}
          </span>
        </span>
        <span className={styles.price}>
          {percent != null && <span className={styles.percent}>-{percent} %</span>}
          <PricePill cents={offer.priceCents} size="md" />
        </span>
      </button>
    </li>
  );
}

/**
 * Top zone, "Izdelki" mode: a heading, (for the categories intent) a chip row, and a compact list of
 * the intent's products. Shows TOP_PREVIEW rows; "Poglej vse" expands the rest in place.
 */
export function ItemPanel({
  state,
  ids,
  fullCount,
  expanded,
  onToggleExpanded,
  onCategory,
  onSelect,
}: {
  state: HomeState;
  /** Product ids to render (the preview, or the full list once expanded). */
  ids: string[];
  /** Length of the intent's complete list. */
  fullCount: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  onCategory: (slug: string) => void;
  onSelect: (productId: string) => void;
}) {
  const percents = state.intent === "discounts" ? new Map(discountedProducts().map((d) => [d.productId, d.percent])) : null;
  return (
    <div className={styles.panel}>
      <h2 className={styles.title}>{topTitle(state)}</h2>
      {state.intent === "categories" && (
        <div className={styles.chips} role="group" aria-label="Kategorije">
          {availableCategories().map((slug) => (
            <button key={slug} type="button" className={styles.chip} aria-pressed={state.category === slug} onClick={() => onCategory(slug)}>
              {capitalize(categoryLabel(slug))}
            </button>
          ))}
        </div>
      )}
      {ids.length === 0 ? (
        <p className={styles.empty}>V tem katalogu ni izdelkov za ta izbor.</p>
      ) : (
        <ul className={styles.list} aria-label={topTitle(state)}>
          {ids.map((id) => (
            <Row key={id} productId={id} percent={percents?.get(id)} onSelect={onSelect} />
          ))}
        </ul>
      )}
      {fullCount > TOP_PREVIEW && (
        <button type="button" className={styles.more} aria-expanded={expanded} onClick={onToggleExpanded}>
          {expanded ? "Pokaži manj" : `Poglej vse (${fullCount})`}
        </button>
      )}
    </div>
  );
}
