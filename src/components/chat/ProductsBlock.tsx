"use client";
import { useState } from "react";
import { formatPrice, getOffer, getProduct, PRICE_UNIT_LABEL } from "@/lib/catalog";
import { ProductCard } from "../product/ProductCard";
import { ProductTile } from "../product/ProductTile";
import { Icon } from "../ui/Icon";
import styles from "./Chat.module.css";

const MAX_CARDS = 3;
const MAX_ROWS = 8;

/** Renders a `products` block: featured cards, or compact rows that expand into a card. */
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
        <ProductCard key={offer.id} productId={product.id} offerId={offer.id} reason={reasons?.[offer.id]} />
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

function ProductRow({ productId, offerId, reason }: { productId: string; offerId: string; reason?: string }) {
  const [open, setOpen] = useState(false);
  const product = getProduct(productId)!;
  const offer = getOffer(offerId)!;
  const unit = PRICE_UNIT_LABEL[offer.priceUnit];
  const panelId = `row-${offerId}`;
  return (
    <li className={styles.row}>
      <button type="button" className={styles.rowBtn} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        <ProductTile productId={productId} size="carousel" />
        <span className={styles.rowText}>
          {product.brand && <span className={styles.rowBrand}>{product.brand}</span>}
          <span className={styles.rowName}>{product.name}</span>
          <span className={styles.rowMeta}>
            {product.packSize} · <strong>{formatPrice(offer.priceCents)}</strong>
            {unit ? ` ${unit}` : ""}
          </span>
          {reason && <span className={styles.rowReason}>{reason}</span>}
        </span>
        <Icon name="chevron-down" size={18} className={styles.rowChevron} />
      </button>
      {open && (
        <div id={panelId} className={styles.rowPanel}>
          <ProductCard productId={productId} offerId={offerId} />
        </div>
      )}
    </li>
  );
}
