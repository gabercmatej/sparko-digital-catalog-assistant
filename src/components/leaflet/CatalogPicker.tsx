"use client";
import { formatPeriod, viewerCatalogs } from "@/lib/catalog";
import type { ViewerCatalog } from "@/lib/types";
import { CatalogBadge } from "./CatalogBadge";
import styles from "./CatalogPicker.module.css";

const current = viewerCatalogs.filter((c) => c.homeOrder !== null);
const earlier = viewerCatalogs.filter((c) => c.homeOrder === null);

/** Leaflet switcher: the Home leaflets (Home order), then the earlier catalogs that carry the verified demo products. */
export function CatalogPicker({ current: currentId, onPick }: { current: string; onPick: (catalogId: string) => void }) {
  const row = (c: ViewerCatalog) => {
    const selected = c.id === currentId;
    return (
      <li key={c.id}>
        <button type="button" className={styles.item} aria-current={selected ? "true" : undefined} data-autofocus={selected || undefined} data-picker-catalog={c.id} onClick={() => onPick(c.id)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- small pre-rendered thumbnail of page 1 */}
          <img className={styles.thumb} src={c.pages[0]?.thumb.src ?? c.cover.src} width={c.pages[0]?.thumb.width ?? c.cover.width} height={c.pages[0]?.thumb.height ?? c.cover.height} alt="" loading="lazy" decoding="async" />
          <span className={styles.text}>
            <CatalogBadge category={c.category} size="xs" />
            <span className={styles.title}>{c.title}</span>
            <span className={styles.meta}>
              {formatPeriod(c.validFrom, c.validTo)} · {c.pageCount} {c.pageCount === 1 ? "stran" : "strani"}
            </span>
            {c.interactive && <span className={styles.tag}>Interaktivni izdelki (demo)</span>}
          </span>
        </button>
      </li>
    );
  };
  return (
    <div className={styles.root}>
      <h3 className={styles.heading}>Katalogi</h3>
      <ul className={styles.list}>{current.map(row)}</ul>
      {earlier.length > 0 && (
        <>
          <h3 className={styles.heading}>Prejšnji katalogi s preverjenimi izdelki</h3>
          <ul className={styles.list}>{earlier.map(row)}</ul>
        </>
      )}
    </div>
  );
}
