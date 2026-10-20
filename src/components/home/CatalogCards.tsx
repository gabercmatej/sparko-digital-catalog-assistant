import Link from "next/link";
import { catalogHref, catalogs, formatPeriod } from "@/lib/catalog";
import { Icon } from "../ui/Icon";
import { RetailerBadge } from "../product/RetailerBadge";
import styles from "./CatalogCards.module.css";

/**
 * Top zone, "Katalogi" mode: one cover card per catalog (SPAR green, INTERSPAR red). The whole card is
 * a single link to that catalog's leaflet; the "Odpri katalog" pill is its visual call to action.
 */
export function CatalogCards() {
  return (
    <ul className={styles.cards}>
      {catalogs.map((c) => (
        <li key={c.id}>
          <Link href={catalogHref(c.id)} className={`${styles.card} ${styles[c.retailer]}`} data-catalog-card={c.id} aria-label={`Odpri katalog ${c.title}, ${formatPeriod(c.validFrom, c.validTo)}`}>
            <span className={styles.brand}>
              <RetailerBadge retailer={c.retailer} size="md" />
            </span>
            <span className={styles.kicker}>Aktualni katalog</span>
            <span className={styles.period}>{formatPeriod(c.validFrom, c.validTo)}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.cover} src={c.cover.src} width={c.cover.width} height={c.cover.height} alt="" decoding="async" draggable={false} />
            <span className={styles.cta} aria-hidden="true">
              Odpri katalog
              <Icon name="arrow-right" size={15} strokeWidth={2.4} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
