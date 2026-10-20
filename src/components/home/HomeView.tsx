"use client";
import { useCallback, useId, useReducer, useRef, useState } from "react";
import { getProduct } from "@/lib/catalog";
import { ProductSheet } from "../collection/ProductSheet";
import { NearestStoreCard } from "../chat/demo/NearestStoreCard";
import { ProductCard } from "../product/ProductCard";
import { ProductMiniCard } from "../product/ProductMiniCard";
import { Icon, type IconName } from "../ui/Icon";
import { CatalogCards } from "./CatalogCards";
import { ItemPanel } from "./ItemPanel";
import { homeReducer, initialHomeState, intentItems, railItems, railTitle, topItems, type HomeAction, type HomeMode } from "./homeState";
import styles from "./HomeView.module.css";

const SEGMENTS: { mode: HomeMode; label: string; icon: IconName }[] = [
  { mode: "katalogi", label: "Katalogi", icon: "leaflet" },
  { mode: "izdelki", label: "Izdelki", icon: "list" },
];

const ACTIONS: { intent: "discounts" | "new" | "categories"; label: string; icon: IconName }[] = [
  { intent: "discounts", label: "Kaj je najbolj znižano", icon: "percent" },
  { intent: "new", label: "Kaj je novega v katalogu", icon: "star" },
  { intent: "categories", label: "Poglej izdelke po kategoriji", icon: "list" },
];

/**
 * `/domov`: top zone (catalog covers or an item list), SPARko action buttons and a product rail.
 * What the list and the rail show is derived from `homeReducer` state (see homeState.ts).
 */
export function HomeView() {
  const [state, dispatch] = useReducer(homeReducer, initialHomeState);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const topRef = useRef<HTMLElement>(null);
  const uid = useId();
  const tabId = (mode: HomeMode) => `${uid}-tab-${mode}`;
  const panelId = `${uid}-panel`;

  const listKey = `${state.intent}|${state.category}`;
  const expanded = expandedKey === listKey;
  const full = intentItems(state);
  const rail = railItems(state);
  const sheetProduct = sheetId ? getProduct(sheetId) : undefined;
  const closeSheet = useCallback(() => setSheetId(null), []);
  const closeStore = useCallback(() => setStoreOpen(false), []);

  const send = (action: HomeAction) => dispatch(action);

  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next: HomeMode = state.mode === "katalogi" ? "izdelki" : "katalogi";
    send({ type: "segment", mode: next });
    document.getElementById(tabId(next))?.focus();
  };

  const viewAll = () => {
    send({ type: "viewAll" });
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" }));
  };

  return (
    <div className={`page-scroll ${styles.home}`}>
      <div className={styles.column}>
        <section ref={topRef} className={styles.top} aria-label="Katalogi in izdelki">
          <div id={panelId} role="tabpanel" aria-labelledby={tabId(state.mode)} className={styles.fade} key={state.mode}>
            {state.mode === "katalogi" ? (
              <CatalogCards />
            ) : (
              <ItemPanel
                state={state}
                ids={expanded ? full : topItems(state)}
                fullCount={full.length}
                expanded={expanded}
                onToggleExpanded={() => setExpandedKey(expanded ? null : listKey)}
                onCategory={(slug) => send({ type: "category", slug })}
                onSelect={setSheetId}
              />
            )}
          </div>

          <div className={styles.segments} role="tablist" aria-label="Prikaz" onKeyDown={onTabKey}>
            {SEGMENTS.map((s) => {
              const selected = state.mode === s.mode;
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
                  onClick={() => send({ type: "segment", mode: s.mode })}
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
            {ACTIONS.map((a) => (
              <button key={a.intent} type="button" className={styles.action} aria-pressed={state.mode === "izdelki" && state.intent === a.intent} onClick={() => send({ type: "intent", intent: a.intent })}>
                <span className={styles.actionIcon}>
                  <Icon name={a.icon} size={20} strokeWidth={2.2} />
                </span>
                <span className={styles.actionLabel}>{a.label}</span>
                <Icon name="chevron-right" size={18} className={styles.chevron} />
              </button>
            ))}
            <button type="button" className={styles.action} aria-haspopup="dialog" onClick={() => setStoreOpen(true)}>
              <span className={styles.actionIcon}>
                <Icon name="pin" size={20} strokeWidth={2.2} />
              </span>
              <span className={styles.actionLabel}>Kje je najbližji SPAR</span>
              <Icon name="chevron-right" size={18} className={styles.chevron} />
            </button>
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
          <ul className={styles.rail} key={`${railTitle(state)}|${rail[0]}`} data-testid="home-rail">
            {rail.map((id) => (
              <li key={id} className={styles.railItem}>
                <ProductMiniCard productId={id} onSelect={() => setSheetId(id)} />
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
    </div>
  );
}
