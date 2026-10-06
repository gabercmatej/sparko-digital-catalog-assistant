"use client";
import { Fragment, useState } from "react";
import { discountLine, getOffer, getProduct } from "@/lib/catalog";
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
 * (packshot left; brand, name, pack size and one short discount line; red price block flush in the
 * bottom-right corner). Tapping the row toggles ONLY the action area beneath it.
 */
function ProductRow({ productId, offerId, reason }: { productId: string; offerId: string; reason?: string }) {
  const [open, setOpen] = useState(false);
  const product = getProduct(productId)!;
  const offer = getOffer(offerId)!;
  const discount = discountLine(offer);
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
          {discount && (
            <span className={styles.rowDiscount} data-discount-line>
              {/* Each segment stays on one line ("46 % znižano"); the text is the formatter's string. */}
              {discount.split(" · ").map((part, i) => (
                <Fragment key={i}>
                  {i > 0 && " · "}
                  <span className={styles.rowDiscountPart}>{part}</span>
                </Fragment>
              ))}
            </span>
          )}
          {reason && <span className={styles.rowNote}>{reason}</span>}
        </span>
        <span className={styles.rowPack}>{product.packSize}</span>
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
