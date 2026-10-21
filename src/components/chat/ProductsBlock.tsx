"use client";
import { useState } from "react";
import { formatPrice, formatShortDate, getOffer, getProduct, PRICE_UNIT_LABEL } from "@/lib/catalog";
import type { FuturePromo } from "@/lib/types";
import { ProductActions } from "../product/ProductActions";
import { PriceBlock, ProductCard } from "../product/ProductCard";
import { PricePill } from "../product/PricePill";
import { brandLabel } from "../product/ProductSummary";
import { ProductTile } from "../product/ProductTile";
import { RetailerBadge } from "../product/RetailerBadge";
import { Icon } from "../ui/Icon";
import styles from "./Chat.module.css";

const MAX_CARDS = 3;
const MAX_ROWS = 8;

/** Renders a `products` block: featured cards, or compact rows that expand into their actions. */
export function ProductsBlock({ offerIds, reasons, layout = "card" }: { offerIds: string[]; reasons?: Record<string, string>; layout?: "card" | "list" }) {
  const items = offerIds
    .map((offerId) => {
      const offer = getOffer(offerId);
      const product = offer && getProduct(offer.productId);
      return offer && product ? { offer, product } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  if (!items.length) return null;

  const cards = layout === "card" ? items.slice(0, MAX_CARDS) : [];
  const rows = layout === "card" ? items.slice(MAX_CARDS, MAX_CARDS + MAX_ROWS) : items.slice(0, MAX_ROWS);

  return (
    <div className={styles.products}>
      {cards.map(({ offer, product }) => (
        <ProductCard key={offer.id} productId={product.id} offerId={offer.id} variant="chat" />
      ))}
      {rows.length > 0 && (
        <ul className={styles.rows}>
          {rows.map(({ offer, product }) => (
            <ProductRow key={offer.id} productId={product.id} offerId={offer.id} reason={reasons?.[offer.id]} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A compact product row inside Sparko's grey message: the same white rectangle as the chat card
 * (packshot left; SPAR / INTERSPAR label, brand, name, pack size and one grey line with the struck-through
 * regular price; red price block flush in the bottom-right corner). Tapping the row toggles ONLY the action
 * area beneath it.
 *
 * With `upcoming` (a future demo promo) the row shows both prices side by side under the text: the
 * CURRENT price as the red pill ("Zdaj") and the upcoming price as a softer blue box ("Od 14. 10.").
 */
export function ProductRow({ productId, offerId, reason, upcoming }: { productId: string; offerId: string; reason?: string; upcoming?: FuturePromo }) {
  const [open, setOpen] = useState(false);
  const product = getProduct(productId)!;
  const offer = getOffer(offerId)!;
  const panelId = `row-${upcoming ? upcoming.id : offerId}`;
  const brand = brandLabel(product);
  const unit = PRICE_UNIT_LABEL[offer.priceUnit];
  const regular = offer.regularPriceCents != null && (
    <span className={styles.rowRegular} data-regular-price>
      Redna cena <s className={styles.rowOldPrice}>{formatPrice(offer.regularPriceCents)}</s>
    </span>
  );
  return (
    <li className={styles.row} data-product-row-id={productId}>
      <button
        type="button"
        className={styles.rowBtn}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        data-row-header
        data-upcoming={upcoming ? "" : undefined}
      >
        <span className={styles.rowImg} aria-hidden="true">
          <ProductTile productId={productId} size="carousel" thumb />
        </span>
        <span className={styles.rowInfo}>
          {brand && <span className={styles.rowBrand}>{brand}</span>}
          <span className={styles.rowName}>{product.name}</span>
        </span>
        <Icon name="chevron-down" size={16} className={styles.rowChevron} />
        <span className={styles.rowMeta}>
          <span className={styles.rowPack}>{product.packSize}</span>
          {reason && <span className={styles.rowNote}>{reason}</span>}
          {regular}
        </span>
        {upcoming ? (
          <>
            <span className={styles.priceStrip} data-price-strip>
              <RetailerBadge productId={productId} size="xs" className={styles.stripBadge} />
              <span className={styles.priceCol}>
                <span className={styles.priceLabel}>Zdaj{unit ? ` · ${unit}` : ""}</span>
                <PricePill cents={offer.priceCents} tone="now" size="md" srPrefix="Zdaj" />
              </span>
              <span className={styles.priceCol} data-upcoming-price>
                <span className={`${styles.priceLabel} ${styles.priceLabelUpcoming}`}>
                  <ClockIcon />
                  Od {formatShortDate(upcoming.validFrom)}
                </span>
                <PricePill cents={upcoming.priceCents} tone="upcoming" size="md" srPrefix={`Od ${formatShortDate(upcoming.validFrom)}`} />
              </span>
            </span>
          </>
        ) : (
          <>
            <PriceBlock offer={offer} productId={productId} compact />
          </>
        )}
      </button>
      {open && (
        <div id={panelId} className={styles.rowPanel} role="region" aria-label={`Dejanja: ${product.name}`}>
          <ProductActions productId={productId} toggle />
        </div>
      )}
    </li>
  );
}

/** Small clock for the "Od 14. 10." label (decorative). */
function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.5l3.5 2" />
    </svg>
  );
}
