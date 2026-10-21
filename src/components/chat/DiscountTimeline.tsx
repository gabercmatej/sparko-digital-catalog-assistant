"use client";
import { formatDate, formatPeriod, getCatalog, getOffer, getPrimaryOffer, getProduct } from "@/lib/catalog";
import { DEMO_FORECAST_LABEL, forecastFor } from "@/lib/demoForecast";
import { upcomingItem, upcomingPeriod } from "@/lib/futurePromos";
import { Icon } from "../ui/Icon";
import { ProductRow } from "./ProductsBlock";
import chat from "./Chat.module.css";
import styles from "./DiscountTimeline.module.css";

/** Validity of the catalogs the given offers belong to: one period, or the span when they differ. */
function currentPeriod(offerIds: string[]): string | null {
  const catalogs = Array.from(new Set(offerIds.map((id) => getOffer(id)?.catalogId)))
    .map((id) => (id ? getCatalog(id) : undefined))
    .filter((c): c is NonNullable<typeof c> => !!c);
  if (!catalogs.length) return null;
  const from = catalogs.map((c) => c.validFrom).sort()[0];
  const to = catalogs.map((c) => c.validTo).sort().reverse()[0];
  return formatPeriod(from, to);
}

/**
 * The "discount_timeline" block: "Znižano ta teden" (verified current offers, green) and
 * "Znižano naslednji teden" (upcoming demo promos, soft blue). Upcoming rows are either structured demo
 * promos (current price red, upcoming price blue) or DEMO forecast rows (`forecastProductIds`: period only,
 * no future price, tagged "Demo napoved"). Either section is omitted when empty.
 */
export function DiscountTimeline({
  currentOfferIds,
  upcomingPromoIds,
  forecastProductIds = [],
}: {
  currentOfferIds: string[];
  upcomingPromoIds: string[];
  forecastProductIds?: string[];
}) {
  const current = currentOfferIds
    .map((id) => {
      const offer = getOffer(id);
      return offer && getProduct(offer.productId) ? offer : null;
    })
    .filter((o): o is NonNullable<typeof o> => !!o);
  const upcoming = upcomingPromoIds.map((id) => upcomingItem(id)).filter((x): x is NonNullable<typeof x> => !!x);
  const forecast = forecastProductIds.map((id) => forecastFor(id)).filter((x): x is NonNullable<typeof x> => !!x);
  if (!current.length && !upcoming.length && !forecast.length) return null;
  const period = currentPeriod(current.map((o) => o.id));
  const nextPeriod = upcoming.length
    ? formatPeriod(upcomingPeriod.from, upcomingPeriod.to)
    : forecast[0]
      ? formatPeriod(forecast[0].period.from, forecast[0].period.to)
      : "";

  return (
    <div className={styles.timeline} data-discount-timeline>
      {current.length > 0 && (
        <section className={`${styles.section} ${styles.current}`} data-timeline-section="current" aria-label="Znižano ta teden">
          <header className={styles.head}>
            <CalendarIcon />
            <h4 className={styles.title}>Znižano ta teden</h4>
            {period && <span className={styles.period}>{period}</span>}
          </header>
          <ul className={`${chat.rows} ${styles.list}`}>
            {current.map((o) => (
              <ProductRow key={o.id} productId={o.productId} offerId={o.id} />
            ))}
          </ul>
        </section>
      )}
      {(upcoming.length > 0 || forecast.length > 0) && (
        <section className={`${styles.section} ${styles.upcoming}`} data-timeline-section="upcoming" aria-label="Znižano naslednji teden">
          <header className={styles.head}>
            <CalendarIcon />
            <h4 className={styles.title}>Znižano naslednji teden</h4>
            <span className={styles.period}>{nextPeriod}</span>
          </header>
          {upcoming.length > 0 && (
            <p className={styles.note}>
              <Icon name="info" size={15} strokeWidth={2.2} />
              <span>To so prihodnje akcije. Cene veljajo od {formatDate(upcomingPeriod.from)}.</span>
            </p>
          )}
          {forecast.length > 0 && (
            <p className={styles.note} data-forecast-note>
              <Icon name="info" size={15} strokeWidth={2.2} />
              <span>{DEMO_FORECAST_LABEL}: za izdelke brez cene je znano le obdobje akcije, cena za naslednji teden še ni znana.</span>
            </p>
          )}
          <ul className={`${chat.rows} ${styles.list}`}>
            {upcoming.map(({ promo, currentOffer }) => (
              <ProductRow key={promo.id} productId={promo.productId} offerId={currentOffer.id} upcoming={promo} />
            ))}
            {forecast
              .filter((f) => !f.promo)
              .map(({ productId, period: p }) => (
                <ForecastRow key={`fc-${productId}`} productId={productId} period={p} />
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** A DEMO MOCK forecast row: the shared ProductRow with the period + "Demo napoved" tag and no future price. */
function ForecastRow({ productId, period }: { productId: string; period: { from: string; to: string } }) {
  const offer = getPrimaryOffer(productId);
  if (!offer) return null;
  return <ProductRow productId={productId} offerId={offer.id} forecast={period} />;
}

/** Calendar glyph of the section titles (decorative; the heading carries the meaning). */
function CalendarIcon() {
  return (
    <svg className={styles.icon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}
