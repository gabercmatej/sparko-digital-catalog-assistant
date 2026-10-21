"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { catalogs, DEMO_LABEL, formatPrice, getOffer, getPrimaryOffer, getProduct, placements, PRICE_UNIT_LABEL, RETAILER_LABEL, retailerOf } from "@/lib/catalog";
import { getRecommendations, type Recommendation } from "@/lib/recommendations";
import { removeProduct, saveProduct, showToast, useStore } from "@/lib/store/store";
import type { SavedItem } from "@/lib/types";
import { ProductCard } from "../product/ProductCard";
import { ProductMiniCard } from "../product/ProductMiniCard";
import { Icon } from "../ui/Icon";
import { PageHeader } from "../shell/Header";
import { leafletQuery, pagesWithProducts } from "../leaflet/pages";
import { collectionTotals } from "@/lib/savings";
import { CollectionSummary } from "./CollectionSummary";
import { ListMenu } from "./ListMenu";
import { ProductSheet } from "./ProductSheet";
import { SavedRow } from "./SavedRow";
import styles from "./CollectionView.module.css";

const FLASH_MS = 2200;
const ITEM_PREFIX = "izdelek-";

type Tab = "moji" | "priporocila";
const EXPANDED_LIMIT = 18;
const RAIL_COUNT = 8;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Saved items, newest first (ties by id), skipping products no longer in the catalog data. */
function sortSaved(items: SavedItem[]): SavedItem[] {
  return [...items].filter((i) => getProduct(i.productId)).sort((a, b) => b.savedAt - a.savedAt || a.productId.localeCompare(b.productId));
}

/** Leaflet link at the first page (first catalog that has one) holding a saved product; /letak when none. */
function firstSavedLeafletHref(productIds: string[]): string {
  for (const c of catalogs) {
    const pages = pagesWithProducts(
      productIds,
      placements.filter((pl) => pl.catalogId === c.id),
      (offerId) => getOffer(offerId)?.productId,
    );
    if (pages.length) return `/letak${leafletQuery(pages[0], { catalogId: c.id })}`;
  }
  return "/letak";
}

/** Plain-text list for sharing: "Ime, pakiranje – cena (SPAR/INTERSPAR)". */
function shareText(items: SavedItem[]): string {
  const lines = items.flatMap((it) => {
    const p = getProduct(it.productId);
    const o = getPrimaryOffer(it.productId);
    const r = retailerOf(it.productId);
    if (!p || !o) return [];
    const unit = PRICE_UNIT_LABEL[o.priceUnit];
    return [`${p.name}, ${p.packSize} – ${formatPrice(o.priceCents)}${unit ? " " + unit : ""}${r ? ` (${RETAILER_LABEL[r]})` : ""}`];
  });
  return ["Moj katalog (Sparko)", ...lines.map((l) => `• ${l}`)].join("\n");
}

export function CollectionView() {
  const store = useStore();
  const { hydrated, saved } = store;
  const [tab, setTab] = useState<Tab>("moji");
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const flashTimer = useRef<number | undefined>(undefined);
  const uid = useId();
  const tabId = (t: Tab) => `${uid}-tab-${t}`;
  const panelId = `${uid}-panel`;

  const savedKey = saved.map((s) => s.productId).join("|");
  const items = useMemo(() => sortSaved(saved), [saved]);
  const count = items.length;
  const freshRecs: Recommendation[] = useMemo(() => {
    const ids = savedKey ? savedKey.split("|") : [];
    return getRecommendations(ids, { limit: EXPANDED_LIMIT, fillEditorial: true });
  }, [savedKey]);
  // The expanded view freezes its list so a just-added item stays visible (with its check) until you leave.
  const [frozenRecs, setFrozenRecs] = useState<Recommendation[] | null>(null);
  const allRecs = tab === "priporocila" && frozenRecs ? frozenRecs : freshRecs;
  const recs = tab === "priporocila" ? allRecs : allRecs.slice(0, RAIL_COUNT);
  const totals = useMemo(() => collectionTotals(savedKey ? savedKey.split("|") : []), [savedKey]);
  const goTab = useCallback(
    (next: Tab) => {
      setFrozenRecs(next === "priporocila" ? freshRecs : null);
      setTab(next);
    },
    [freshRecs],
  );
  const personalised = count > 0;

  // The removal mode only makes sense with something to remove.
  const editing = editMode && count > 0;
  if (editMode && hydrated && count === 0) setEditMode(false);

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
      if (h.startsWith(ITEM_PREFIX)) {
        goTab("moji");
        flash(h.slice(ITEM_PREFIX.length));
      }
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [hydrated, flash, goTab]);

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
      goTab("moji");
      flash(id);
    }
  };

  const addRecommendation = (productId: string) => {
    if (saveProduct(productId) === "saved" && tab === "moji") flash(productId, { scroll: false });
  };

  const leafletHref = useMemo(() => firstSavedLeafletHref(savedKey ? savedKey.split("|") : []), [savedKey]);

  const share = async () => {
    if (count === 0) return;
    const text = shareText(items);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Moj katalog", text });
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return; // user closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("Seznam je kopiran v odložišče.");
    } catch {
      showToast("Seznama ni bilo mogoče deliti.");
    }
  };

  // Empties the list in one step; the toast offers to bring everything back.
  const clearAll = () => {
    const snapshot = [...saved];
    if (snapshot.length === 0) return;
    for (const it of snapshot) removeProduct(it.productId, { toast: false });
    showToast("Seznam je izpraznjen.", {
      label: "Razveljavi",
      run: () => {
        for (const it of snapshot) saveProduct(it.productId, { toast: false, savedAt: it.savedAt });
      },
    });
  };

  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next: Tab = tab === "moji" ? "priporocila" : "moji";
    goTab(next);
    document.getElementById(tabId(next))?.focus();
  };

  const recTitle = personalised ? "Priporočila zate iz kataloga" : "Ideje iz kataloga";
  const infoText = personalised ? "Glede na tvoj izbor. Dodaš jih sam, ko ti ustrezajo." : "Uredniški izbor, ki ni prilagojen tebi.";

  return (
    <div className={styles.root}>
      <PageHeader title="Moj katalog">
        {editing ? (
          <button type="button" className={styles.doneBtn} onClick={() => setEditMode(false)}>
            Končano
          </button>
        ) : (
          <button type="button" className="icon-btn" onClick={() => setEditMode(true)} disabled={!hydrated || count === 0} aria-label="Odstrani izdelke">
            <Icon name="trash" size={22} />
          </button>
        )}
        {/* While removing, "Končano" is the only header action (keeps the centred title clear on narrow phones). */}
        {!editing && (
          <ListMenu
            disabled={!hydrated || count === 0}
            items={[
              { label: "Deli seznam", icon: "share", onSelect: share },
              { label: "Izprazni seznam", icon: "trash", danger: true, onSelect: clearAll },
            ]}
          />
        )}
      </PageHeader>

      <div className={styles.tabs} role="tablist" aria-label="Moj katalog" onKeyDown={onTabKey}>
        <button type="button" role="tab" id={tabId("moji")} aria-selected={tab === "moji"} aria-controls={panelId} tabIndex={tab === "moji" ? 0 : -1} className={styles.tab} onClick={() => goTab("moji")}>
          Moji izdelki{hydrated ? ` (${count})` : ""}
        </button>
        <button type="button" role="tab" id={tabId("priporocila")} aria-selected={tab === "priporocila"} aria-controls={panelId} tabIndex={tab === "priporocila" ? 0 : -1} className={styles.tab} onClick={() => goTab("priporocila")}>
          Priporočila zate
        </button>
      </div>

      <div className={`page-scroll ${styles.scroll}`}>
        <div className={styles.body} role="tabpanel" id={panelId} aria-labelledby={tabId(tab)}>
          {!hydrated ? (
            <div className={styles.loading} aria-busy="true" />
          ) : tab === "moji" ? (
            <>
              {count > 0 && (
                <div className={`page-pad ${styles.actions}`}>
                  <Link href={leafletHref} className={`btn btn-secondary ${styles.action}`}>
                    <Icon name="leaflet" size={19} />
                    Pokaži na letaku
                  </Link>
                  <button type="button" className={`btn btn-secondary ${styles.action}`} onClick={share}>
                    <Icon name="share" size={19} />
                    Deli seznam
                  </button>
                </div>
              )}

              <section className={`page-pad ${styles.listArea}`} aria-label="Moji izdelki">
                {count === 0 ? (
                  <div className={styles.empty}>
                    <span className={styles.emptyIcon} aria-hidden="true">
                      <Icon name="list" size={26} />
                    </span>
                    <p className={styles.emptyTitle}>Tvoj katalog je še prazen</p>
                    <p className={styles.emptyText}>Izberi prvi izdelek, Sparko pa ti bo predlagal še nekaj idej.</p>
                    <div className={styles.emptyCtas}>
                      <Link href="/" className="btn btn-primary btn-sm">
                        <Icon name="chat" size={17} />
                        Vprašaj Sparka
                      </Link>
                      <Link href="/domov" className="btn btn-secondary btn-sm">
                        Odpri katalog
                      </Link>
                    </div>
                  </div>
                ) : (
                  <>
                    {editing && <p className={styles.editHint}>Tapni rdeči minus ob izdelku, ki ga želiš odstraniti.</p>}
                    <ul className={styles.rows}>
                      {items.map((it) => (
                        <SavedRow
                          key={it.productId}
                          productId={it.productId}
                          id={ITEM_PREFIX + it.productId}
                          flash={flashId === it.productId}
                          editing={editing}
                          onOpen={() => setSheetId(it.productId)}
                          onRemove={() => removeProduct(it.productId)}
                        />
                      ))}
                    </ul>
                    <p className={`demo-label ${styles.demo}`}>{DEMO_LABEL}</p>
                  </>
                )}
              </section>

              {recs.length > 0 && (
                <section className={`page-pad ${styles.band}`} aria-labelledby={`${uid}-reco`}>
                  <div className={styles.bandHead}>
                    <h2 id={`${uid}-reco`} className={styles.bandTitle}>
                      {recTitle}
                      <button type="button" className={styles.infoBtn} aria-expanded={infoOpen} aria-label="Zakaj ta priporočila?" onClick={() => setInfoOpen((o) => !o)}>
                        <Icon name="info" size={16} />
                      </button>
                    </h2>
                    <button type="button" className={styles.seeAll} onClick={() => goTab("priporocila")} data-see-all>
                      Poglej vse
                      <Icon name="arrow-right" size={16} strokeWidth={2.2} />
                    </button>
                  </div>
                  {infoOpen && <p className={styles.bandNote}>{infoText}</p>}
                  <ul className={styles.rail} data-reco-rail>
                    {recs.map((r) => (
                      <li key={r.productId} className={styles.railItem} data-reco-item data-product-id={r.productId}>
                        <ProductMiniCard productId={r.productId} onSelect={() => setSheetId(r.productId)} onAdd={() => addRecommendation(r.productId)} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : (
            <section className={`page-pad ${styles.band} ${styles.bandFull}`} aria-labelledby={`${uid}-reco-all`}>
              <div className={styles.bandHead}>
                <h2 id={`${uid}-reco-all`} className={styles.bandTitle}>
                  {recTitle}
                </h2>
              </div>
              <p className={styles.bandNote}>{infoText}</p>
              <button type="button" className={styles.backLink} onClick={() => goTab("moji")}>
                <Icon name="arrow-right" size={16} strokeWidth={2.2} />
                Nazaj na Moje izdelke
              </button>
              {recs.length === 0 ? (
                <p className={styles.bandNote}>Za zdaj nimamo novih predlogov.</p>
              ) : (
                <ul className={styles.recGrid} data-reco-expanded>
                  {recs.map((r) => (
                    <li key={r.productId} className={styles.recItem} data-reco-item data-product-id={r.productId} data-editorial={r.editorial || undefined}>
                      <ProductMiniCard productId={r.productId} onSelect={() => setSheetId(r.productId)} onAdd={() => addRecommendation(r.productId)} />
                      {(personalised || !r.editorial) && <p className={styles.reason}>{r.reason}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>

      <CollectionSummary totals={totals} hydrated={hydrated} />

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
