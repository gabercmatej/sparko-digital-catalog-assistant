"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { activeProducts } from "@/lib/activeCatalog";
import { ProductMiniCard } from "../product/ProductMiniCard";
import { Icon } from "../ui/Icon";
import styles from "./ProductCarousel.module.css";

/** Horizontally scrollable carousel of all catalog products (editorial order), built from the same ProductMiniCard as the home rail. */
export function ProductCarousel({ onSelect }: { onSelect: (productId: string) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(false);

  const update = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update]);

  const next = () => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: Math.max(120, el.clientWidth * 0.75), behavior: "smooth" });
  };

  return (
    <section className={styles.wrap} aria-label="Izdelki iz kataloga">
      <div className={styles.trackWrap} data-at-end={atEnd || undefined}>
        <div ref={trackRef} className={styles.track} onScroll={update} role="list" aria-label="Izdelki iz kataloga">
          {activeProducts().map((p) => (
            <div role="listitem" key={p.id} className={styles.item}>
              <ProductMiniCard productId={p.id} rail onSelect={() => onSelect(p.id)} ariaLabelPrefix="Pokaži" />
            </div>
          ))}
        </div>
        {!atEnd && (
          <button type="button" className={styles.next} onClick={next} aria-label="Naslednji izdelki" tabIndex={-1}>
            <Icon name="chevron-right" size={20} strokeWidth={2} />
          </button>
        )}
      </div>
    </section>
  );
}
