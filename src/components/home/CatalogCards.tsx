import Link from "next/link";
import { catalogHref, catalogs, formatPeriod } from "@/lib/catalog";
import { Icon } from "../ui/Icon";
import { RetailerBadge } from "../product/RetailerBadge";
import styles from "./CatalogCards.module.css";

/**
 * Top zone, "Katalogi" mode: one cover card per catalog (SPAR green, INTERSPAR red), always side by side.
 * Each card is a single link to that catalog's leaflet: header row (retailer label + "Aktualni katalog"),
 * the complete cover centred, the validity period (from catalog data, one line) and the white "Odpri
 * katalog" pill. The card has an explicit height (--cat-h from HomeView) and sizes the cover from it.
 */
export function CatalogCards() {
  return (
    <ul className={styles.cards}>
      {catalogs.map((c) => {
        const period = formatPeriod(c.validFrom, c.validTo);
        return (
          <li key={c.id}>
            <Link href={catalogHref(c.id)} className={`${styles.card} ${styles[c.retailer]}`} data-catalog-card={c.id} aria-label={`Odpri katalog ${c.title}, ${period}`}>
              <span className={styles.head}>
                <span className={styles.brand}>
                  <RetailerBadge retailer={c.retailer} size="sm" />
                </span>
                <span className={styles.title}>Aktualni katalog</span>
              </span>
              <span className={styles.coverWrap} data-catalog-cover>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.cover} src={c.cover.src} width={c.cover.width} height={c.cover.height} alt="" decoding="async" draggable={false} />
              </span>
              <span className={styles.dates} data-catalog-dates>
                {period}
              </span>
              <span className={styles.cta} aria-hidden="true">
                Odpri katalog
                <Icon name="arrow-right" size={15} strokeWidth={2.4} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
