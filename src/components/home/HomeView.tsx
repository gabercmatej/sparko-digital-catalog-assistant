"use client";
import { useCallback, useId, useReducer, useRef, useState } from "react";
import { getProduct } from "@/lib/catalog";
import { ProductSheet } from "../collection/ProductSheet";
import { NearestStoreCard } from "../chat/demo/NearestStoreCard";
import { ProductCard } from "../product/ProductCard";
import { ProductMiniCard } from "../product/ProductMiniCard";
import { Icon, type IconName } from "../ui/Icon";
import { CatalogCards } from "./CatalogCards";
import { CategorySheet } from "./CategorySheet";
import { ItemPanel } from "./ItemPanel";
import { homeReducer, initialHomeState, railItems, railTitle, topItems, type CategoryKey, type TopMode } from "./homeState";
import styles from "./HomeView.module.css";

const SEGMENTS: { mode: TopMode; label: string; icon: IconName }[] = [
  { mode: "catalogs", label: "Katalogi", icon: "leaflet" },
  { mode: "products", label: "Izdelki", icon: "list" },
];

/**
 * `/domov`: three fixed zones. TOP (one bounded box shared by the catalog covers and the product list,
 * plus the segmented control), MIDDLE (SPARko mascot + four actions) and BOTTOM (product rail).
 * Content changes never change any zone's size, so the middle and bottom never move.
 * What the list and the rail show is derived from one `homeReducer` state (see homeState.ts).
 */
export function HomeView() {
  const [state, dispatch] = useReducer(homeReducer, initialHomeState);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const topRef = useRef<HTMLElement>(null);
  const uid = useId();
  const tabId = (mode: TopMode) => `${uid}-tab-${mode}`;
  const panelId = `${uid}-panel`;

  const rail = railItems(state);
  const sheetProduct = sheetId ? getProduct(sheetId) : undefined;
  const closeSheet = useCallback(() => setSheetId(null), []);
  const closeStore = useCallback(() => setStoreOpen(false), []);
  const closeCategories = useCallback(() => setCategoriesOpen(false), []);
  const products = state.topMode === "products";

  const setMode = (mode: TopMode) => dispatch({ type: "setTopMode", mode });
  const pickCategory = (category: CategoryKey) => {
    setCategoriesOpen(false);
    dispatch({ type: "selectCategory", category });
  };

  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next: TopMode = state.topMode === "catalogs" ? "products" : "catalogs";
    setMode(next);
    document.getElementById(tabId(next))?.focus();
  };

  const viewAll = () => {
    dispatch({ type: "viewAll" });
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" }));
  };

  return (
    <div className={`page-scroll ${styles.home}`}>
      <div className={styles.column}>
        <section ref={topRef} className={styles.top} aria-label="Katalogi in izdelki">
          {/* One box, one height, for both modes. */}
          <div id={panelId} role="tabpanel" aria-labelledby={tabId(state.topMode)} className={styles.topBox}>
            {products ? (
              <ItemPanel state={state} ids={topItems(state)} onCategory={pickCategory} onSelect={setSheetId} />
            ) : (
              <div className={styles.fade}>
                <CatalogCards />
              </div>
            )}
          </div>

          <div className={styles.segments} role="tablist" aria-label="Prikaz" onKeyDown={onTabKey}>
            {SEGMENTS.map((s) => {
              const selected = state.topMode === s.mode;
              return (
                <button
                  key={s.mode}
                  id={tabId(s.mode)}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={panelId}
                  tabIndex={selected ? 0 : -1}
                  className={styles.segment}
                  onClick={() => setMode(s.mode)}
                >
                  <Icon name={s.icon} size={18} strokeWidth={2} />
                  {s.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className={styles.sparko} aria-label="Vprašaj Sparka">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.mascot} src="/brand/sparko-mascot.webp" width={72} height={72} alt="" decoding="async" />
          <div className={styles.actions}>
            <ActionButton icon="percent" label="Kaj je najbolj znižano" pressed={products && state.activeDiscovery === "discounts"} onClick={() => dispatch({ type: "discover", discovery: "discounts" })} />
            <ActionButton icon="list" label="Poglej izdelke po kategoriji" pressed={products && state.activeDiscovery === "category"} haspopup onClick={() => setCategoriesOpen(true)} />
            <ActionButton icon="star" label="Kaj je novega v katalogu" pressed={products && state.activeDiscovery === "new"} onClick={() => dispatch({ type: "discover", discovery: "new" })} />
            <ActionButton icon="pin" label="Kje je najbližji SPAR" haspopup onClick={() => setStoreOpen(true)} />
          </div>
        </section>

        <section className={styles.railSection} aria-labelledby={`${uid}-rail`}>
          <div className={styles.railHead}>
            <h2 id={`${uid}-rail`} className={styles.railTitle}>
              {railTitle(state)}
            </h2>
            <button type="button" className={styles.viewAll} onClick={viewAll}>
              Poglej vse
              <Icon name="arrow-right" size={16} strokeWidth={2.2} />
            </button>
          </div>
          <ul className={styles.rail} key={`${railTitle(state)}|${rail.length}|${rail[0]}`} data-testid="home-rail">
            {rail.map((id) => (
              <li key={id} className={styles.railItem}>
                <ProductMiniCard rail productId={id} onSelect={() => setSheetId(id)} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <ProductSheet open={!!sheetProduct} onClose={closeSheet} label={sheetProduct ? `${sheetProduct.name}, ${sheetProduct.packSize}` : ""}>
        {sheetProduct && <ProductCard productId={sheetProduct.id} headingLevel={2} />}
      </ProductSheet>
      <ProductSheet open={storeOpen} onClose={closeStore} label="Najbližji SPAR">
        <NearestStoreCard />
      </ProductSheet>
      <CategorySheet open={categoriesOpen} onClose={closeCategories} selected={products && state.activeDiscovery === "category" ? state.activeCategory : null} onPick={pickCategory} />
    </div>
  );
}

function ActionButton({ icon, label, pressed, haspopup, onClick }: { icon: IconName; label: string; pressed?: boolean; haspopup?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={styles.action} aria-pressed={pressed} aria-haspopup={haspopup ? "dialog" : undefined} onClick={onClick}>
      <span className={styles.actionIcon}>
        <Icon name={icon} size={20} strokeWidth={2.2} />
      </span>
      <span className={styles.actionLabel}>{label}</span>
      <Icon name="chevron-right" size={18} className={styles.chevron} />
    </button>
  );
}
