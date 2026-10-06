"use client";
import { useState } from "react";
import { formatPrice, getOffer, getProduct } from "@/lib/catalog";
import { ProductActions } from "../product/ProductActions";
import { PriceBlock, ProductCard } from "../product/ProductCard";
import { ProductTile } from "../product/ProductTile";
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
 * (packshot left; brand, name, pack size and one grey line with the struck-through regular price; red price block flush in the
 * bottom-right corner). Tapping the row toggles ONLY the action area beneath it.
 */
function ProductRow({ productId, offerId, reason }: { productId: string; offerId: string; reason?: string }) {
  const [open, setOpen] = useState(false);
  const product = getProduct(productId)!;
  const offer = getOffer(offerId)!;
  const panelId = `row-${offerId}`;
  return (
    <li className={styles.row}>
      <button type="button" className={styles.rowBtn} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)} data-row-header>
        <span className={styles.rowImg} aria-hidden="true">
          <ProductTile productId={productId} size="carousel" thumb />
        </span>
        <span className={styles.rowInfo}>
          {product.brand && <span className={styles.rowBrand}>{product.brand}</span>}
          <span className={styles.rowName}>{product.name}</span>
        </span>
        <Icon name="chevron-down" size={20} className={styles.rowChevron} />
        <span className={styles.rowMeta}>
          <span className={styles.rowPack}>{product.packSize}</span>
          {reason && <span className={styles.rowNote}>{reason}</span>}
        </span>
        {/* One grey line under the pack size: only the regular price, struck through. */}
        {offer.regularPriceCents != null && (
          <span className={styles.rowRegular} data-regular-price>
            Redna cena <s className={styles.rowOldPrice}>{formatPrice(offer.regularPriceCents)}</s>
          </span>
        )}
        <PriceBlock offer={offer} />
      </button>
      {open && (
        <div id={panelId} className={styles.rowPanel} role="region" aria-label={`Dejanja: ${product.name}`}>
          <ProductActions productId={productId} toggle />
        </div>
      )}
    </li>
  );
}
