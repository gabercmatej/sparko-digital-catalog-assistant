"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { catalogHref, formatPeriod, homeLeaflets, leafletShortTitle } from "@/lib/catalog";
import { CatalogBadge } from "../leaflet/CatalogBadge";
import { Icon } from "../ui/Icon";
import styles from "./CatalogCarousel.module.css";

/**
 * Top zone, "Katalogi" mode: every Home leaflet (src/data/leaflets.json, Home order) as a cover card in ONE
 * horizontal, scroll-snapped row inside the same fixed-height box the two cards used to fill. Phones show
 * about 1.5 cards (the next one visibly cut off), wider boxes about 2.3; a slim progress bar sits below the
 * row and pointer devices get previous / next buttons. Only the small cover images load here, never a PDF.
 */
export function CatalogCarousel() {
  const trackRef = useRef<HTMLUListElement>(null);
  const [state, setState] = useState({ start: true, end: false, progress: 0, visible: 1 });

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const progress = max > 0 ? Math.min(1, Math.max(0, el.scrollLeft / max)) : 0;
    setState({ start: el.scrollLeft <= 2, end: el.scrollLeft >= max - 2, progress, visible: el.scrollWidth > 0 ? el.clientWidth / el.scrollWidth : 1 });
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [measure]);

  /** One card (plus gap) left or right; scroll snapping settles it on a card edge. */
  const step = (dir: 1 | -1) => {
    const el = trackRef.current;
    const card = el?.querySelector<HTMLElement>("li");
    if (!el || !card) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * (card.offsetWidth + gap), behavior: reduced ? "auto" : "smooth" });
  };

  const thumbW = Math.max(0.12, Math.min(1, state.visible));

  return (
    <div className={styles.carousel} data-testid="catalog-carousel">
      <ul ref={trackRef} className={styles.track} aria-label={`Katalogi (${homeLeaflets.length})`}>
        {homeLeaflets.map((c, i) => {
          const period = formatPeriod(c.validFrom, c.validTo);
          const ar = { "--cover-ar": String(c.cover.width / c.cover.height) } as CSSProperties;
          return (
            <li key={c.id} className={styles.slide} style={ar}>
              <Link
                href={catalogHref(c.id)}
                className={`${styles.card} ${styles[c.category]}`}
                data-catalog-card={c.id}
                data-category={c.category}
                aria-label={`Odpri ${c.title}, ${period}`}
                draggable={false}
              >
                <span className={styles.head}>
                  <span className={styles.brand}>
                    <CatalogBadge category={c.category} size="xs" />
                  </span>
                  <span className={styles.title} data-catalog-title>
                    {leafletShortTitle(c)}
                  </span>
                </span>
                <span className={styles.coverWrap} data-catalog-cover>
                  {/* eslint-disable-next-line @next/next/no-img-element -- pre-rendered 720 px cover */}
                  <img
                    className={styles.cover}
                    src={c.cover.src}
                    width={c.cover.width}
                    height={c.cover.height}
                    alt=""
                    decoding="async"
                    loading={i < 2 ? "eager" : "lazy"}
                    draggable={false}
                  />
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

      <div className={styles.progress} aria-hidden="true" data-testid="catalog-progress">
        <span className={styles.progressThumb} style={{ width: `${thumbW * 100}%`, left: `${state.progress * (1 - thumbW) * 100}%` }} />
      </div>

      <button type="button" className={`${styles.arrow} ${styles.prev}`} onClick={() => step(-1)} disabled={state.start} aria-label="Prejšnji katalogi" data-testid="catalog-prev">
        <Icon name="chevron-left" size={20} strokeWidth={2.4} />
      </button>
      <button type="button" className={`${styles.arrow} ${styles.next}`} onClick={() => step(1)} disabled={state.end} aria-label="Naslednji katalogi" data-testid="catalog-next">
        <Icon name="chevron-right" size={20} strokeWidth={2.4} />
      </button>
    </div>
  );
}
