"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { catalog, formatPrice, getOffer, getPage, getPlacementsForProduct, getPlacementsOnPage, getProduct, placements as allPlacements } from "@/lib/catalog";
import { useStore } from "@/lib/store/store";
import { ProductCard } from "../product/ProductCard";
import { Icon } from "../ui/Icon";
import { PageViewer, type OverlayItem, type ViewerControls } from "./PageViewer";
import { PagePicker } from "./PagePicker";
import { Sheet } from "./Sheet";
import { adjacentPage, allPageIndexes, leafletQuery, nearestPage, pagesWithProducts, parsePageParam } from "./pages";
import styles from "./LeafletView.module.css";

const EMAIL_PLACEHOLDER = "Pošiljanje PDF-ja na e-pošto bo na voljo v prihodnji različici.";

type Nav = { page: number; token: number; target: string | null };

const productIdForOffer = (offerId: string) => getOffer(offerId)?.productId;

function pageLabelFor(index: number): string {
  const p = getPage(index);
  const base = `PDF-stran ${index + 1}`;
  return p?.printedPageLabel ? `${base} (tiskana stran ${p.printedPageLabel})` : base;
}

/** Resolve the initial page/target from the URL. `pendingMine` = wait for hydration to pick the first saved page. */
function initialFromParams(sp: URLSearchParams): { nav: Nav; pendingMine: boolean; mine: boolean } {
  const pageCount = catalog.pageCount;
  const stran = parsePageParam(sp.get("stran"), pageCount);
  const izdelek = sp.get("izdelek");
  const mine = sp.get("moji") === "1";
  const targetPlacements = izdelek && getProduct(izdelek) ? getPlacementsForProduct(izdelek) : [];
  let page = stran;
  if (page === null && targetPlacements.length) page = targetPlacements[0].pdfPageIndex;
  const pendingMine = page === null && mine;
  if (page === null) page = [...catalog.pages].sort((a, b) => a.pdfPageIndex - b.pdfPageIndex)[0]?.pdfPageIndex ?? 0;
  const target = izdelek && targetPlacements.some((pl) => pl.pdfPageIndex === page) ? izdelek : null;
  return { nav: { page, token: 0, target }, pendingMine, mine };
}

/**
 * Interactive SPAR leaflet: swipe left/right through the original pages, each fitted whole into the
 * available area (no vertical scrolling). One compact toolbar: "Moj katalog" page filter, page picker,
 * PDF actions. Saved products get a green overlay; tapping a product box opens its card.
 */
export function LeafletView() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const store = useStore();
  const qs = sp.toString();

  const [init] = useState(() => initialFromParams(new URLSearchParams(qs)));
  const [nav, setNav] = useState<Nav>(init.nav);
  const [pendingMine, setPendingMine] = useState(init.pendingMine);
  const [filterOn, setFilterOn] = useState(init.mine);
  const [filterNotice, setFilterNotice] = useState<string | null>(null);
  const [lastQs, setLastQs] = useState(qs);
  const [issued, setIssued] = useState<string[]>([]);
  const [sheet, setSheet] = useState<{ productId: string; offerId: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  // Zoom level reported by the viewer, tagged with the navigation token it belongs to.
  const [zoom, setZoom] = useState({ token: 0, scale: 1 });
  const viewerRef = useRef<ViewerControls>(null);

  // Handled highlight nonces live here (survive per-page remounts of the viewer). The nonce that
  // was already in the store when the leaflet opened is covered by the page-open pulse.
  const handledNonces = useRef<Set<number>>(new Set(store.highlight ? [store.highlight.nonce] : []));
  const claimNonce = useCallback((n: number) => {
    if (handledNonces.current.has(n)) return false;
    handledNonces.current.add(n);
    return true;
  }, []);

  const savedIds = useMemo(() => store.saved.map((s) => s.productId), [store.saved]);
  const savedSet = useMemo(() => new Set(savedIds), [savedIds]);
  const savedPages = useMemo(() => pagesWithProducts(savedIds, allPlacements, productIdForOffer), [savedIds]);
  const hydrated = store.hydrated;

  // ---------------------------------------------------------------- render-time state adjustments

  // moji=1 without a page: once saved state is known, start at the first page with saved products.
  if (pendingMine && hydrated) {
    setPendingMine(false);
    if (savedPages.length) setNav((n) => ({ page: savedPages[0], token: n.token + 1, target: null }));
  }

  // Filter on but nothing saved any more (e.g. the last item was removed on a filtered page):
  // stay on the page, switch the filter off and explain.
  if (hydrated && filterOn && savedPages.length === 0) {
    setFilterOn(false);
    setFilterNotice("Moj katalog je prazen, zato filter ni več vklopljen. Prikazane so vse strani.");
  }

  // External URL change (not one we issued) → follow it.
  if (qs !== lastQs) {
    setLastQs(qs);
    if (!issued.includes(qs)) {
      const params = new URLSearchParams(qs);
      const p = parsePageParam(params.get("stran"), catalog.pageCount);
      const iz = params.get("izdelek");
      if (p !== null && (p !== nav.page || (iz && iz !== nav.target))) {
        const target = iz && getPlacementsForProduct(iz).some((pl) => pl.pdfPageIndex === p) ? iz : null;
        setNav((n) => ({ page: p, token: n.token + 1, target }));
      }
    }
  }

  const filterActive = filterOn && savedPages.length > 0;
  const visible = filterActive ? savedPages : allPageIndexes(catalog.pageCount);
  const page = getPage(nav.page);
  const prevPage = adjacentPage(nav.page, visible, -1);
  const nextPage = adjacentPage(nav.page, visible, 1);
  const onFilteredPageWithoutSaved = filterActive && !savedPages.includes(nav.page);

  // ---------------------------------------------------------------- navigation

  const replaceUrl = useCallback(
    (pageIndex: number, mine: boolean) => {
      const q = leafletQuery(pageIndex, { mine });
      setIssued((list) => [...list.slice(-19), q.slice(1)]);
      router.replace(`${pathname}${q}`, { scroll: false });
    },
    [router, pathname],
  );

  const goTo = useCallback(
    (pageIndex: number, opts: { mine?: boolean } = {}) => {
      setNav((n) => ({ page: pageIndex, token: n.token + 1, target: null }));
      setFilterNotice(null);
      replaceUrl(pageIndex, opts.mine ?? filterActive);
    },
    [replaceUrl, filterActive],
  );

  const goNext = useCallback(() => {
    if (nextPage !== null) goTo(nextPage);
  }, [nextPage, goTo]);
  const goPrev = useCallback(() => {
    if (prevPage !== null) goTo(prevPage);
  }, [prevPage, goTo]);

  const toggleFilter = () => {
    if (!hydrated || savedPages.length === 0) return;
    const next = !filterOn;
    setFilterOn(next);
    setFilterNotice(null);
    if (next && !savedPages.includes(nav.page)) {
      const target = nearestPage(nav.page, savedPages);
      if (target !== null) {
        goTo(target, { mine: true });
        return;
      }
    }
    replaceUrl(nav.page, next);
  };

  // Keyboard paging (←/→) when no dialog is open and focus is not in a text field.
  const anyModal = sheet !== null || pickerOpen || emailOpen;
  useEffect(() => {
    if (anyModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyModal, goNext, goPrev]);

  // Preload only the neighbouring page images.
  useEffect(() => {
    for (const idx of [prevPage, nextPage]) {
      const p = idx === null ? undefined : getPage(idx);
      if (p) {
        const img = new Image();
        img.decoding = "async";
        img.src = p.image.src;
      }
    }
  }, [prevPage, nextPage]);

  // ---------------------------------------------------------------- page data

  const pagePlacements = useMemo(() => getPlacementsOnPage(nav.page), [nav.page]);
  const items: OverlayItem[] = pagePlacements.flatMap((pl) => {
    const offer = getOffer(pl.offerId);
    const product = offer && getProduct(offer.productId);
    if (!offer || !product) return [];
    const saved = savedSet.has(product.id);
    return [
      {
        placementId: pl.id,
        productId: product.id,
        bbox: pl.bbox,
        saved,
        label: `${product.name}${product.packSize ? `, ${product.packSize}` : ""}, ${formatPrice(offer.priceCents)} – ${saved ? "v Mojem katalogu" : "ni v Mojem katalogu"}. Odpri podrobnosti.`,
      },
    ];
  });

  const openPlacement = useCallback((placementId: string) => {
    const pl = getPlacementsOnPage(nav.page).find((p) => p.id === placementId);
    const offer = pl && getOffer(pl.offerId);
    if (offer) setSheet({ productId: offer.productId, offerId: offer.id });
  }, [nav.page]);


  const onScaleChange = useCallback((scale: number) => setZoom({ token: nav.token, scale }), [nav.token]);
  const zoomScale = zoom.token === nav.token ? zoom.scale : 1;

  const onSwipe = useCallback((dir: "next" | "prev") => (dir === "next" ? goNext() : goPrev()), [goNext, goPrev]);

  const pageLabel = pageLabelFor(nav.page);
  const position = filterActive && savedPages.includes(nav.page) ? `${savedPages.indexOf(nav.page) + 1}/${savedPages.length}` : null;
  const filterDisabled = !hydrated || savedPages.length === 0;

  return (
    <div className={styles.root}>
      <h1 className="sr-only">SPAR letak</h1>
      <div className={styles.toolbar}>
        <button
          type="button"
          role="switch"
          aria-checked={filterActive}
          aria-label="Samo strani z mojimi izdelki"
          aria-describedby={filterDisabled && hydrated ? "leaflet-filter-help" : undefined}
          title={filterDisabled && hydrated ? "Najprej dodaj izdelek v Moj katalog." : "Samo strani z mojimi izdelki"}
          className={styles.switchBtn}
          onClick={toggleFilter}
          disabled={filterDisabled}
          data-testid="filter-toggle"
        >
          <span className={styles.switchTrack} data-on={filterActive || undefined} aria-hidden="true">
            <span className={styles.switchThumb} />
          </span>
          <span className={styles.switchLabel} aria-hidden="true">
            Moje strani
          </span>
        </button>
        {filterDisabled && hydrated && (
          <span id="leaflet-filter-help" className="sr-only">
            Najprej dodaj izdelek v Moj katalog.
          </span>
        )}
        <button type="button" className={styles.pickerBtn} onClick={() => setPickerOpen(true)} aria-haspopup="dialog" aria-label={`${pageLabel} od ${catalog.pageCount}. Izberi stran`}>
          <span className={styles.pageIndicator} aria-live="polite" data-testid="page-indicator">
            {nav.page + 1} / {catalog.pageCount}
            {position && <span className={styles.printed}> · moje {position}</span>}
          </span>
          <Icon name="chevron-down" size={16} />
        </button>
        <div className={styles.tools}>
          <a href={catalog.pdfUrl} target="_blank" rel="noopener" className="icon-btn" aria-label="Izvirni PDF" title="Izvirni PDF">
            <Icon name="external" size={20} />
          </a>
          <button type="button" className="icon-btn" onClick={() => setEmailOpen(true)} aria-haspopup="dialog" aria-label="Pošlji PDF na e-pošto" title="Pošlji PDF na e-pošto">
            <Icon name="mail" size={20} />
          </button>
        </div>
      </div>

      <div className={styles.viewer}>
        {page ? (
          <PageViewer
            key={nav.token}
            page={page}
            pageLabel={pageLabel}
            items={items}
            targetProductId={nav.target}
            hydrated={hydrated}
            highlight={store.highlight}
            claimNonce={claimNonce}
            onOpenPlacement={openPlacement}
            onSwipe={onSwipe}
            canSwipe={{ next: nextPage !== null, prev: prevPage !== null }}
            onScaleChange={onScaleChange}
            ref={viewerRef}
          />
        ) : (
          <div className={styles.missing} role="status">
            <Icon name="leaflet" size={28} />
            <strong>Stran ni na voljo</strong>
            <span>{pageLabel} v tej demo različici še ni pripravljena. Odpri izvirni PDF ali izberi drugo stran.</span>
          </div>
        )}
        {prevPage !== null && (
          <button type="button" className={`${styles.navBtn} ${styles.navPrev}`} onClick={goPrev} aria-label="Prejšnja stran">
            <Icon name="chevron-left" size={22} strokeWidth={2.2} />
          </button>
        )}
        {nextPage !== null && (
          <button type="button" className={`${styles.navBtn} ${styles.navNext}`} onClick={goNext} aria-label="Naslednja stran">
            <Icon name="chevron-right" size={22} strokeWidth={2.2} />
          </button>
        )}
        {zoomScale > 1.01 && (
          <button type="button" className={styles.zoomReset} onClick={() => viewerRef.current?.reset()} aria-label="Pomanjšaj na celo stran">
            <Icon name="zoom-out" size={16} />
            <span>{Math.round(zoomScale * 10) / 10}×</span>
          </button>
        )}
        {(filterNotice || onFilteredPageWithoutSaved) && (
          <p className={styles.notice} role="status">
            {filterNotice ?? "Na tej strani ni več izdelkov iz Mojega kataloga. Puščici vodita na strani z mojimi izdelki."}
          </p>
        )}
      </div>

      <Sheet open={sheet !== null} onClose={() => setSheet(null)} title="Izdelek iz letaka">
        {sheet && <ProductCard productId={sheet.productId} offerId={sheet.offerId} showLeaflet={false} headingLevel={3} />}
      </Sheet>

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title={filterActive ? "Strani z mojimi izdelki" : "Izberi stran"}>
        <PagePicker
          pages={visible}
          current={nav.page}
          savedPages={savedPages}
          onPick={(idx) => {
            setPickerOpen(false);
            if (idx !== nav.page) goTo(idx);
          }}
        />
      </Sheet>

      <Sheet
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        title="Pošlji PDF na e-pošto"
        variant="dialog"
        hideTitle
        footer={
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEmailOpen(false)} data-autofocus>
            Zapri
          </button>
        }
      >
        <p className={styles.dialogText}>{EMAIL_PLACEHOLDER}</p>
      </Sheet>
    </div>
  );
}
