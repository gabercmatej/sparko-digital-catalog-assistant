import { formatDate, formatPeriod, getCatalog, getOffer, getProduct } from "@/lib/catalog";
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
 * "Znižano naslednji teden" (upcoming demo promos, soft blue, showing the current price in red and
 * the upcoming price in blue). Either section is omitted when empty.
 */
export function DiscountTimeline({ currentOfferIds, upcomingPromoIds }: { currentOfferIds: string[]; upcomingPromoIds: string[] }) {
  const current = currentOfferIds
    .map((id) => {
      const offer = getOffer(id);
      return offer && getProduct(offer.productId) ? offer : null;
    })
    .filter((o): o is NonNullable<typeof o> => !!o);
  const upcoming = upcomingPromoIds.map((id) => upcomingItem(id)).filter((x): x is NonNullable<typeof x> => !!x);
  if (!current.length && !upcoming.length) return null;
  const period = currentPeriod(current.map((o) => o.id));

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
      {upcoming.length > 0 && (
        <section className={`${styles.section} ${styles.upcoming}`} data-timeline-section="upcoming" aria-label="Znižano naslednji teden">
          <header className={styles.head}>
            <CalendarIcon />
            <h4 className={styles.title}>Znižano naslednji teden</h4>
            <span className={styles.period}>{formatPeriod(upcomingPeriod.from, upcomingPeriod.to)}</span>
          </header>
          <p className={styles.note}>
            <Icon name="info" size={15} strokeWidth={2.2} />
            <span>To so prihodnje akcije. Cene veljajo od {formatDate(upcomingPeriod.from)}.</span>
          </p>
          <ul className={`${chat.rows} ${styles.list}`}>
            {upcoming.map(({ promo, currentOffer }) => (
              <ProductRow key={promo.id} productId={promo.productId} offerId={currentOffer.id} upcoming={promo} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
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
