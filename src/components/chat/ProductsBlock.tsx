"use client";
import { useState } from "react";
import { getOffer, getProduct } from "@/lib/catalog";
import { ProductActions } from "../product/ProductActions";
import { ProductCard } from "../product/ProductCard";
import { ProductSummary } from "../product/ProductSummary";
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

function ProductRow({ productId, offerId, reason }: { productId: string; offerId: string; reason?: string }) {
  const [open, setOpen] = useState(false);
  const product = getProduct(productId)!;
  const panelId = `row-${offerId}`;
  return (
    <li className={styles.row}>
      <button type="button" className={styles.rowBtn} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        <ProductSummary productId={productId} offerId={offerId} note={reason} />
        <Icon name="chevron-down" size={18} className={styles.rowChevron} />
      </button>
      {open && (
        <div id={panelId} className={styles.rowPanel} role="region" aria-label={`Dejanja: ${product.name}`}>
          <ProductActions productId={productId} />
        </div>
      )}
    </li>
  );
}
