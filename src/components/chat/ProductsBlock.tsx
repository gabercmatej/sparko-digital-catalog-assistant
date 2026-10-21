"use client";
import { useState } from "react";
import { formatPeriod, formatPrice, formatShortDate, getOffer, getProduct, unitLabel } from "@/lib/catalog";
import { DEMO_FORECAST_LABEL } from "@/lib/demoForecast";
import type { FuturePromo } from "@/lib/types";
import { ProductActions } from "../product/ProductActions";
import { ProductCard } from "../product/ProductCard";
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
 * THE one chat row (generic results, "Znižano ta teden", upcoming promos and DEMO forecasts share it).
 * Grid: [packshot] [info] [reserved chevron column]; rows: SPAR / INTERSPAR label + chevron / brand + name
 * (2-line clamp) / footer = meta (pack, notes) on the left and the price badge(s) on the right (wrapping to
 * their own right-aligned line when narrow). Tapping the row toggles ONLY the action area beneath it.
 *
 * Variants differ only in data: `upcoming` (a future demo promo) shows the CURRENT price as the red square
 * ("Zdaj") beside the upcoming one as a soft blue square ("Od 14. 10."); `forecast` (a DEMO simulated promo
 * period, no future price) shows the current price plus the period and the discreet "Demo napoved" tag.
 */
export function ProductRow({
  productId,
  offerId,
  reason,
  upcoming,
  forecast,
}: {
  productId: string;
  offerId: string;
  reason?: string;
  upcoming?: FuturePromo;
  forecast?: { from: string; to: string };
}) {
  const [open, setOpen] = useState(false);
  const product = getProduct(productId);
  const offer = getOffer(offerId);
  if (!product || !offer) return null;
  const future = !!(upcoming || forecast);
  const panelId = `row-${upcoming ? upcoming.id : forecast ? `forecast-${productId}` : offerId}`;
  const brand = brandLabel(product);
  const unit = unitLabel(product.packSize, offer.priceUnit);
  const nowLabel = future ? `Zdaj${unit ? ` · ${unit}` : ""}` : unit;
  const regular = !future && offer.regularPriceCents != null && (
    <span className={styles.rowRegular} data-regular-price>
      Redna cena <s className={styles.rowOldPrice}>{formatPrice(offer.regularPriceCents)}</s>
    </span>
  );
  return (
    <li className={styles.row} data-product-row-id={productId} data-forecast-row={forecast ? "" : undefined}>
      <button
        type="button"
        className={styles.rowBtn}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        data-row-header
        data-upcoming={future ? "" : undefined}
        data-forecast={forecast ? "" : undefined}
      >
        <span className={styles.rowImg} aria-hidden="true">
          <ProductTile productId={productId} size="carousel" thumb />
        </span>
        <span className={styles.rowTop}>
          <RetailerBadge productId={productId} size="xs" />
        </span>
        <span className={styles.rowCtrl} data-row-chevron aria-hidden="true">
          <Icon name="chevron-down" size={16} className={styles.rowChevron} />
        </span>
        <span className={styles.rowInfo}>
          {brand && <span className={styles.rowBrand}>{brand}</span>}
          <span className={styles.rowName}>{product.name}</span>
        </span>
        <span className={styles.rowFoot}>
          <span className={styles.rowMeta}>
            <span className={styles.rowPack}>{product.packSize}</span>
            {forecast && (
              <span className={styles.rowWhen}>
                <span className={styles.rowWeek}>Naslednji teden</span> {formatPeriod(forecast.from, forecast.to)}
              </span>
            )}
            {reason && <span className={styles.rowNote}>{reason}</span>}
            {regular}
            {forecast && (
              <span className={styles.rowTag} data-demo-forecast>
                {DEMO_FORECAST_LABEL}
              </span>
            )}
          </span>
          <span className={styles.rowPrices} data-price-strip={future ? "" : undefined}>
            <span className={styles.priceCol}>
              {nowLabel && <span className={styles.priceLabel}>{nowLabel}</span>}
              <PricePill cents={offer.priceCents} tone="now" size="md" srPrefix={future ? "Zdaj" : undefined} />
            </span>
            {upcoming && (
              <span className={styles.priceCol} data-upcoming-price>
                <span className={`${styles.priceLabel} ${styles.priceLabelUpcoming}`}>
                  <ClockIcon />
                  Od {formatShortDate(upcoming.validFrom)}
                </span>
                <PricePill cents={upcoming.priceCents} tone="upcoming" size="md" srPrefix={`Od ${formatShortDate(upcoming.validFrom)}`} />
              </span>
            )}
            {forecast && <span className="sr-only">{`Cena za naslednji teden še ni znana. Trenutna cena ${formatPrice(offer.priceCents)}.`}</span>}
          </span>
        </span>
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
