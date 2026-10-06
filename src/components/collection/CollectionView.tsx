"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEMO_LABEL, getOffer, getProduct, placements } from "@/lib/catalog";
import { categoryLabel, getRecommendations, type Recommendation } from "@/lib/recommendations";
import { removeProduct, saveProduct, useStore } from "@/lib/store/store";
import type { SavedItem } from "@/lib/types";
import { ProductCard } from "../product/ProductCard";
import { ProductTile } from "../product/ProductTile";
import { Icon } from "../ui/Icon";
import { leafletQuery, pagesWithProducts } from "../leaflet/pages";
import { ProductSheet } from "./ProductSheet";
import styles from "./CollectionView.module.css";

const GROUP_THRESHOLD = 6;
const FLASH_MS = 2200;
const ITEM_PREFIX = "izdelek-";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Saved items, newest first; grouped by primary category (groups ordered by their newest item) when many. */
function groupSaved(items: SavedItem[]): { key: string; label: string | null; items: SavedItem[] }[] {
  const sorted = [...items].filter((i) => getProduct(i.productId)).sort((a, b) => b.savedAt - a.savedAt || a.productId.localeCompare(b.productId));
  if (sorted.length <= GROUP_THRESHOLD) return [{ key: "all", label: null, items: sorted }];
  const groups = new Map<string, SavedItem[]>();
  for (const it of sorted) {
    const cat = getProduct(it.productId)!.categories[0] ?? "drugo";
    const list = groups.get(cat) ?? [];
    list.push(it);
    groups.set(cat, list);
  }
  return [...groups.entries()].map(([cat, list]) => {
    const label = categoryLabel(cat);
    return { key: cat, label: label.charAt(0).toLocaleUpperCase("sl") + label.slice(1), items: list };
  });
}

export function CollectionView() {
  const store = useStore();
  const { hydrated, saved } = store;
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);

  const savedKey = saved.map((s) => s.productId).join("|");
  const groups = useMemo(() => groupSaved(saved), [saved]);
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  const recs: Recommendation[] = useMemo(() => {
    const ids = savedKey ? savedKey.split("|") : [];
    return getRecommendations(ids, { fillEditorial: true });
  }, [savedKey]);
  const personalised = count > 0;

  const flash = useCallback((productId: string, opts: { scroll?: boolean } = {}) => {
    window.clearTimeout(flashTimer.current);
    setFlashId(null);
    window.requestAnimationFrame(() => {
      const el = document.getElementById(ITEM_PREFIX + productId);
      if (!el) return;
      if (opts.scroll !== false) el.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      setFlashId(productId);
      flashTimer.current = window.setTimeout(() => setFlashId(null), FLASH_MS);
    });
  }, []);

  // Deep link: /moj-katalog#izdelek-<id> → scroll to the item and highlight it briefly.
  useEffect(() => {
    if (!hydrated) return;
    const fromHash = () => {
      const h = decodeURIComponent(window.location.hash.slice(1));
      if (h.startsWith(ITEM_PREFIX)) flash(h.slice(ITEM_PREFIX.length));
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [hydrated, flash]);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const sheetProduct = sheetId ? getProduct(sheetId) : undefined;
  const closeSheet = useCallback(() => setSheetId(null), []);

  // "✓ V Mojem katalogu" inside the sheet links to this page's own item: close and highlight instead.
  const onSheetClickCapture = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest?.("a");
    const href = a?.getAttribute("href") ?? "";
    const idx = href.indexOf(`#${ITEM_PREFIX}`);
    if (a && href.startsWith("/moj-katalog") && idx >= 0) {
      e.preventDefault();
      const id = decodeURIComponent(href.slice(idx + 1 + ITEM_PREFIX.length));
      setSheetId(null);
      flash(id);
    }
  };

  // Open the full leaflet (the "Moje strani" filter stays off; the user switches it on) at the first page
  // that holds a saved product, so the golden highlight is in view straight away.
  const firstSavedPage = useMemo(
    () => pagesWithProducts(savedKey ? savedKey.split("|") : [], placements, (offerId) => getOffer(offerId)?.productId)[0],
    [savedKey],
  );
  const leafletHref = firstSavedPage === undefined ? "/letak" : `/letak${leafletQuery(firstSavedPage)}`;

  return (
    <div className={styles.root}>
      <div className={`page-scroll ${styles.scroll}`}>
        <header className={`page-pad ${styles.header}`}>
          <h1 className={styles.title}>Moj katalog</h1>
          <p className={styles.subtitle}>Tvoj izbor. Ideje zate.</p>
          <span className={`demo-label ${styles.demo}`}>{DEMO_LABEL}</span>
        </header>

        {!hydrated ? (
          <div className={styles.loading} aria-busy="true" />
        ) : (
          <>
            <section className={`page-pad ${styles.section}`} aria-labelledby="tvoji-izdelki">
              <h2 id="tvoji-izdelki" className={styles.h2}>
                Tvoji izdelki <span className={styles.dot}>·</span> <span className={styles.count}>{count}</span>
              </h2>

              {count === 0 ? (
                <div className={styles.empty}>
                  <p>Izberi prvi izdelek. Sparko ti bo nato predlagal še nekaj idej.</p>
                  <Link href="/" className="btn btn-primary">
                    <Icon name="chat" size={18} />
                    Vprašaj Sparka
                  </Link>
                </div>
              ) : (
                groups.map((g) => (
                  <div key={g.key} className={styles.group}>
                    {g.label && <h3 className={styles.h3}>{g.label}</h3>}
                    <ul className={styles.grid}>
                      {g.items.map((it) => {
                        const p = getProduct(it.productId)!;
                        return (
                          <li key={it.productId} id={ITEM_PREFIX + it.productId} className={styles.item} data-flash={flashId === it.productId || undefined}>
                            <div className={styles.tileWrap}>
                              <ProductTile productId={it.productId} size="grid" onSelect={() => setSheetId(it.productId)} />
                            </div>
                            <div className={styles.itemRow}>
                              <button type="button" className={`btn btn-ghost btn-sm ${styles.remove}`} onClick={() => removeProduct(it.productId)}>
                                Odstrani<span className="sr-only">: {p.name}</span>
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </section>

            {recs.length > 0 && (
              <section className={`page-pad ${styles.recoBand}`} aria-labelledby="priporoceno">
                <h2 id="priporoceno" className={styles.h2}>
                  {personalised ? "Priporočeno zate" : "Ideje iz demo kataloga"}
                </h2>
                <p className={styles.sectionNote}>
                  {personalised ? "Glede na tvoj izbor. Dodaš jih sam, ko ti ustrezajo." : "Uredniški izbor, ki ni prilagojen tebi."}
                </p>
                <ul className={styles.grid}>
                  {recs.map((r) => {
                    const p = getProduct(r.productId)!;
                    return (
                      <li key={r.productId} className={styles.recoItem} data-editorial={r.editorial || undefined}>
                        <ProductTile productId={r.productId} size="grid" onSelect={() => setSheetId(r.productId)} />
                        {(personalised || !r.editorial) && <p className={styles.reason}>{r.reason}</p>}
                        <button
                          type="button"
                          className={`btn btn-secondary btn-sm btn-block ${styles.add}`}
                          onClick={() => {
                            if (saveProduct(r.productId) === "saved") flash(r.productId, { scroll: false });
                          }}
                        >
                          <span className={styles.addLabel}>
                            <Icon name="plus" size={15} strokeWidth={2.4} className={styles.addIcon} />
                            Dodaj v Moj katalog<span className="sr-only">: {p.name}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      <div className={styles.dock}>
        <Link href={leafletHref} className={`btn btn-primary btn-block ${styles.leafletBtn}`}>
          <Icon name="leaflet" size={20} />
          <span>Odpri SPAR letak</span>
          <Icon name="arrow-right" size={18} />
        </Link>
      </div>

      <ProductSheet open={!!sheetProduct} onClose={closeSheet} label={sheetProduct ? `${sheetProduct.name}, ${sheetProduct.packSize}` : ""}>
        {sheetProduct && (
          <div onClickCapture={onSheetClickCapture}>
            <ProductCard productId={sheetProduct.id} headingLevel={2} />
          </div>
        )}
      </ProductSheet>
    </div>
  );
}
