"use client";
import { useEffect, useRef } from "react";
import { getPage } from "@/lib/catalog";
import { Icon } from "../ui/Icon";
import styles from "./PagePicker.module.css";

/** Thumbnail grid of pages (lazy-loaded); pages with saved products carry a check marker. */
export function PagePicker({ pages, current, savedPages, onPick }: { pages: number[]; current: number; savedPages: number[]; onPick: (pageIndex: number) => void }) {
  const saved = new Set(savedPages);
  const gridRef = useRef<HTMLUListElement>(null);
  // Scroll the current page into the middle of the sheet once on open.
  useEffect(() => {
    const grid = gridRef.current;
    const scroller = grid?.parentElement;
    const cur = grid?.querySelector<HTMLElement>("[data-current]");
    if (!grid || !scroller || !cur) return;
    const delta = cur.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTop += delta - scroller.clientHeight / 2 + cur.offsetHeight / 2;
  }, []);
  return (
    <ul className={styles.grid} ref={gridRef}>
      {pages.map((idx) => {
        const p = getPage(idx);
        const isCurrent = idx === current;
        const hasSaved = saved.has(idx);
        return (
          <li key={idx}>
            <button
              type="button"
              className={styles.item}
              data-current={isCurrent || undefined}
              aria-current={isCurrent ? "page" : undefined}
              aria-label={`PDF-stran ${idx + 1}${p?.printedPageLabel ? `, tiskana stran ${p.printedPageLabel}` : ""}${hasSaved ? ", vsebuje izdelke iz Mojega kataloga" : ""}${p ? "" : ", ni na voljo"}`}
              onClick={() => onPick(idx)}
              data-autofocus={isCurrent || undefined}
            >
              <span className={styles.thumb}>
                {p ? (
                  // eslint-disable-next-line @next/next/no-img-element -- small pre-rendered thumbnail
                  <img src={p.thumb.src} width={p.thumb.width} height={p.thumb.height} alt="" loading="lazy" decoding="async" draggable={false} />
                ) : (
                  <span className={styles.na}>ni na voljo</span>
                )}
                {hasSaved && (
                  <span className={styles.mark} aria-hidden="true">
                    <Icon name="check" size={13} strokeWidth={2.8} />
                  </span>
                )}
              </span>
              <span className={styles.num}>
                {idx + 1}
                {p?.printedPageLabel && p.printedPageLabel !== String(idx + 1) && <span className={styles.printed}> · {p.printedPageLabel}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
