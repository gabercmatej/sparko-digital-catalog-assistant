"use client";
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { CatalogPage } from "@/lib/types";
import type { HighlightEvent } from "@/lib/store/store";
import {
  centerOnRect,
  clampView,
  distance,
  DOUBLE_TAP_SCALE,
  fitContain,
  initialView,
  isTap,
  midpoint,
  pinchView,
  rescaleOnResize,
  swipeDirection,
  TAP_MAX_MOVE,
  zoomAround,
  type NormalizedRect,
  type Point,
  type Size,
  type View,
} from "./geometry";
import styles from "./PageViewer.module.css";

/** Zoom controls exposed to the parent toolbar (so no floating buttons cover the page). */
export type ViewerControls = { zoomIn: () => void; zoomOut: () => void; reset: () => void };

export type OverlayItem = {
  placementId: string;
  productId: string;
  bbox: NormalizedRect;
  label: string;
  saved: boolean;
};

type Gesture = {
  pointers: Map<number, Point>;
  start: Point;
  startTime: number;
  startView: View;
  moved: number;
  multi: boolean;
  mode: "none" | "pan" | "swipe" | "pinch";
  pinch: { mid: Point; dist: number; view: View } | null;
  downPlacement: string | null;
  swipeDx: number;
};

const FOCUS_PULSE: Keyframe[] = [
  { opacity: 0, offset: 0 },
  { opacity: 1, offset: 0.125 },
  { opacity: 0.35, offset: 0.25 },
  { opacity: 1, offset: 0.375 },
  { opacity: 1, offset: 0.72 },
  { opacity: 0, offset: 1 },
];

/**
 * First view of a page: the whole page fitted (contain). At scale 1 the page is fully visible, so
 * the target and saved products are always in view; kept generic in case the fit changes.
 */
function startView(vp: Size, content: Size, items: OverlayItem[], targetProductId: string | null): View {
  const target = targetProductId ? items.find((i) => i.productId === targetProductId) : undefined;
  if (target) return centerOnRect(target.bbox, 1, vp, content);
  const base = initialView(vp, content);
  const saved = items.filter((i) => i.saved).sort((a, b) => a.bbox.y - b.bbox.y);
  if (!saved.length) return base;
  const visible = saved.some((i) => (i.bbox.y + i.bbox.height) * content.height + base.y <= vp.height + 1);
  return visible ? base : centerOnRect(saved[0].bbox, 1, vp, content);
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * One leaflet page, fitted whole into the available area (contain), with zoom/pan. A SINGLE transformed stage holds both the page image and
 * the overlay buttons, so they always share the same transform and coordinate space
 * (overlays are positioned in % of the page box). Mounted fresh per page navigation
 * (parent uses `key`), so the "page opened" pulse runs exactly once per navigation.
 */
export function PageViewer({
  page,
  pageLabel,
  items,
  targetProductId,
  hydrated,
  highlight,
  claimNonce,
  onOpenPlacement,
  onSwipe,
  canSwipe,
  onScaleChange,
  ref,
}: {
  page: CatalogPage;
  pageLabel: string;
  items: OverlayItem[];
  /** Product to bring into view and mark (focus outline if unsaved, pulse if saved). */
  targetProductId: string | null;
  hydrated: boolean;
  highlight: HighlightEvent | null;
  /** Returns true the first time a highlight nonce is claimed (handled-nonce memory lives in the parent). */
  claimNonce: (nonce: number) => boolean;
  onOpenPlacement: (placementId: string) => void;
  onSwipe: (dir: "next" | "prev") => void;
  canSwipe: { next: boolean; prev: boolean };
  onScaleChange?: (scale: number) => void;
  ref?: React.Ref<ViewerControls>;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | null>(null);
  const sizeRef = useRef<Size | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const lastTapRef = useRef<{ time: number; point: Point } | null>(null);
  const tapTimerRef = useRef<number | null>(null);
  const animTimerRef = useRef<number | null>(null);
  const navPulseDoneRef = useRef(false);

  const [size, setSize] = useState<Size | null>(null);
  const [imgState, setImgState] = useState<"loading" | "loaded" | "error">("loading");

  // Latest props for native listeners / effects without re-subscribing.
  const latest = useRef({ items, targetProductId, onOpenPlacement, onSwipe, canSwipe, onScaleChange, image: page.image });
  useEffect(() => {
    latest.current = { items, targetProductId, onOpenPlacement, onSwipe, canSwipe, onScaleChange, image: page.image };
  });

  const content = size ? fitContain(size, page.image) : null;

  // The image may finish loading before React attaches onLoad (SSR/cache) — check on mount.
  const imgRef = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete) setImgState(img.naturalWidth > 0 ? "loaded" : "error");
  }, []);

  // ------------------------------------------------------------ transform plumbing

  const apply = useCallback((opts: { animate?: boolean; extraX?: number } = {}) => {
    const stage = stageRef.current;
    const v = viewRef.current;
    if (!stage || !v) return;
    if (animTimerRef.current) window.clearTimeout(animTimerRef.current);
    if (opts.animate && !prefersReducedMotion()) {
      stage.style.transition = "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)";
      animTimerRef.current = window.setTimeout(() => {
        if (stageRef.current) stageRef.current.style.transition = "";
      }, 240);
    } else {
      stage.style.transition = "";
    }
    const x = v.x + (opts.extraX ?? 0);
    stage.style.transform = `translate3d(${x}px, ${v.y}px, 0) scale(${v.scale})`;
    stage.style.setProperty("--s", String(v.scale));
  }, []);

  const setView = useCallback(
    (next: View, opts: { animate?: boolean; commit?: boolean } = {}) => {
      viewRef.current = next;
      apply({ animate: opts.animate });
      if (opts.commit !== false) latest.current.onScaleChange?.(next.scale);
    },
    [apply],
  );

  const contentSize = useCallback((): Size | null => {
    const vp = sizeRef.current;
    return vp ? fitContain(vp, latest.current.image) : null;
  }, []);

  // Measure viewport; recompute on resize / orientation change.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      const vp = { width: Math.round(r.width * 100) / 100, height: Math.round(r.height * 100) / 100 };
      if (vp.width <= 0 || vp.height <= 0) return;
      const img = latest.current.image;
      const nextContent = fitContain(vp, img);
      const prev = sizeRef.current;
      if (!viewRef.current) {
        viewRef.current = startView(vp, nextContent, latest.current.items, latest.current.targetProductId);
      } else if (prev) {
        viewRef.current = rescaleOnResize(viewRef.current, fitContain(prev, img), nextContent, vp);
      }
      sizeRef.current = vp;
      setSize(vp);
      apply();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [apply]);

  // Re-apply the transform after React updates stage dimensions.
  useLayoutEffect(() => {
    apply();
  }, [size, apply]);

  // ------------------------------------------------------------ pulses

  const focusProduct = useCallback((productId: string) => {
    const stage = stageRef.current;
    if (!stage) return;
    const reduced = prefersReducedMotion();
    stage.querySelectorAll<HTMLElement>(`[data-product-id="${CSS.escape(productId)}"] [data-focus-ring]`).forEach((el) => {
      el.getAnimations().forEach((a) => a.cancel());
      el.animate(reduced ? [{ opacity: 1 }, { opacity: 1, offset: 0.98 }, { opacity: 0 }] : FOCUS_PULSE, {
        duration: reduced ? 4000 : 4800,
        easing: "ease-in-out",
      });
    });
  }, []);

  const pageReady = hydrated && imgState !== "loading" && size !== null;

  // "Relevant page opened": once per navigation (this component is keyed per navigation).
  useEffect(() => {
    if (!pageReady || navPulseDoneRef.current) return;
    navPulseDoneRef.current = true;
    const { items: list, targetProductId: target } = latest.current;
    if (target && list.some((i) => i.productId === target)) focusProduct(target);
  }, [pageReady, focusProduct]);

  // Store highlight events (save from the sheet, etc.) — once per nonce.
  const nonce = highlight?.nonce ?? null;
  useEffect(() => {
    if (!highlight || !pageReady) return;
    if (!claimNonce(highlight.nonce)) return;
    const list = latest.current.items;
    const onPage = list.filter((i) => i.productId === highlight.productId);
    if (!onPage.length) return;
    if (highlight.reason === "navigate") focusProduct(highlight.productId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the nonce only
  }, [nonce, pageReady]);

  // ------------------------------------------------------------ gestures

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const local = (e: { clientX: number; clientY: number }): Point => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const handleTap = (point: Point, placementId: string | null) => {
      const now = performance.now();
      const last = lastTapRef.current;
      if (last && now - last.time < 320 && distance(last.point, point) < 30) {
        // double tap / double click → toggle zoom
        lastTapRef.current = null;
        if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
        const vp = sizeRef.current;
        const c = contentSize();
        const v = viewRef.current;
        if (!vp || !c || !v) return;
        const next = v.scale > 1.05 ? zoomAround(v, 1, point, vp, c) : zoomAround(v, DOUBLE_TAP_SCALE, point, vp, c);
        setView(next, { animate: true });
        return;
      }
      lastTapRef.current = { time: now, point };
      if (placementId) {
        if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
        // short wait so a double tap on a product zooms instead of opening the sheet
        tapTimerRef.current = window.setTimeout(() => {
          tapTimerRef.current = null;
          latest.current.onOpenPlacement(placementId);
        }, 260);
      }
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const v = viewRef.current;
      if (!v) return;
      const p = local(e);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      let g = gestureRef.current;
      if (!g || g.pointers.size === 0) {
        const target = (e.target as Element | null)?.closest?.("[data-placement-id]");
        g = {
          pointers: new Map(),
          start: p,
          startTime: performance.now(),
          startView: v,
          moved: 0,
          multi: false,
          mode: "none",
          pinch: null,
          downPlacement: target?.getAttribute("data-placement-id") ?? null,
          swipeDx: 0,
        };
        gestureRef.current = g;
      }
      g.pointers.set(e.pointerId, p);
      if (g.pointers.size >= 2) {
        const [a, b] = [...g.pointers.values()];
        g.multi = true;
        g.mode = "pinch";
        g.swipeDx = 0;
        g.pinch = { mid: midpoint(a, b), dist: distance(a, b), view: viewRef.current ?? v };
        if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
    };

    const onMove = (e: PointerEvent) => {
      const g = gestureRef.current;
      if (!g || !g.pointers.has(e.pointerId)) return;
      const p = local(e);
      g.pointers.set(e.pointerId, p);
      const vp = sizeRef.current;
      const c = contentSize();
      if (!vp || !c) return;

      if (g.mode === "pinch" && g.pinch && g.pointers.size >= 2) {
        const [a, b] = [...g.pointers.values()];
        setView(pinchView(g.pinch.view, g.pinch.mid, g.pinch.dist, midpoint(a, b), distance(a, b), vp, c), { commit: false });
        return;
      }
      if (g.pointers.size !== 1) return;
      const dx = p.x - g.start.x;
      const dy = p.y - g.start.y;
      g.moved = Math.max(g.moved, Math.hypot(dx, dy));
      if (g.mode === "none") {
        if (g.moved < TAP_MAX_MOVE) return;
        const zoomed = g.startView.scale > 1.01;
        g.mode = !zoomed && Math.abs(dx) > Math.abs(dy) ? "swipe" : "pan";
        if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      if (g.mode === "pan") {
        setView(clampView({ scale: g.startView.scale, x: g.startView.x + dx, y: g.startView.y + dy }, vp, c), { commit: false });
      } else if (g.mode === "swipe") {
        const allowed = dx < 0 ? latest.current.canSwipe.next : latest.current.canSwipe.prev;
        g.swipeDx = allowed ? dx : dx * 0.25; // rubber band when there is no page in that direction
        apply({ extraX: g.swipeDx });
      }
    };

    const onUp = (e: PointerEvent) => {
      const g = gestureRef.current;
      if (!g || !g.pointers.has(e.pointerId)) return;
      const p = local(e);
      g.pointers.delete(e.pointerId);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (g.pointers.size === 1) {
        // pinch → continue as pan with the remaining finger
        const [rest] = [...g.pointers.values()];
        g.mode = "pan";
        g.pinch = null;
        g.start = rest;
        g.startView = viewRef.current ?? g.startView;
        return;
      }
      if (g.pointers.size > 1) return;
      gestureRef.current = null;
      const duration = performance.now() - g.startTime;
      const cancelled = e.type === "pointercancel";

      if (g.mode === "swipe") {
        const dir = cancelled ? null : swipeDirection(p.x - g.start.x, p.y - g.start.y, duration, sizeRef.current?.width ?? 0);
        const allowed = dir === "next" ? latest.current.canSwipe.next : dir === "prev" ? latest.current.canSwipe.prev : false;
        if (dir && allowed) {
          latest.current.onSwipe(dir);
          return;
        }
        apply({ animate: true });
        return;
      }
      if (viewRef.current) latest.current.onScaleChange?.(viewRef.current.scale);
      if (!cancelled && isTap(g.moved, duration, g.multi)) handleTap(p, g.downPlacement);
    };

    const onWheel = (e: WheelEvent) => {
      const vp = sizeRef.current;
      const c = contentSize();
      const v = viewRef.current;
      if (!vp || !c || !v) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vp.height : 1;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * unit * 0.0025);
        setView(zoomAround(v, v.scale * factor, local(e), vp, c));
        return;
      }
      const overflows = c.width * v.scale > vp.width + 0.5 || c.height * v.scale > vp.height + 0.5;
      if (!overflows) return;
      e.preventDefault();
      setView(clampView({ scale: v.scale, x: v.x - e.deltaX * unit, y: v.y - e.deltaY * unit }, vp, c), { commit: false });
    };

    const onCancelClickDrag = (e: DragEvent) => e.preventDefault();

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("dragstart", onCancelClickDrag);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("dragstart", onCancelClickDrag);
      if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
      if (animTimerRef.current) window.clearTimeout(animTimerRef.current);
    };
  }, [apply, contentSize, setView]);

  // ------------------------------------------------------------ zoom buttons

  const zoomBy = useCallback((factor: number) => {
    const vp = sizeRef.current;
    const c = contentSize();
    const v = viewRef.current;
    if (!vp || !c || !v) return;
    setView(zoomAround(v, v.scale * factor, { x: vp.width / 2, y: vp.height / 2 }, vp, c), { animate: true });
  }, [contentSize, setView]);
  const resetZoom = useCallback(() => {
    const vp = sizeRef.current;
    const c = contentSize();
    const v = viewRef.current;
    if (!vp || !c || !v) return;
    // keep the vertical centre roughly where the user was looking
    setView(zoomAround(v, 1, { x: vp.width / 2, y: vp.height / 2 }, vp, c), { animate: true });
  }, [contentSize, setView]);

  useImperativeHandle(ref, () => ({ zoomIn: () => zoomBy(1.5), zoomOut: () => zoomBy(1 / 1.5), reset: resetZoom }), [zoomBy, resetZoom]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomBy(1.5);
    } else if (e.key === "-") {
      e.preventDefault();
      zoomBy(1 / 1.5);
    } else if (e.key === "0") {
      e.preventDefault();
      resetZoom();
    } else if (["ArrowUp", "ArrowDown"].includes(e.key) || ((viewRef.current?.scale ?? 1) > 1.01 && ["ArrowLeft", "ArrowRight"].includes(e.key))) {
      const vp = sizeRef.current;
      const c = contentSize();
      const v = viewRef.current;
      if (!vp || !c || !v) return;
      e.preventDefault();
      e.stopPropagation();
      const step = 60;
      const dx = e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0;
      const dy = e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0;
      setView(clampView({ scale: v.scale, x: v.x + dx, y: v.y + dy }, vp, c), { animate: true });
    }
  };

  return (
    <div className={styles.wrap}>
      <div
        ref={viewportRef}
        className={styles.viewport}
        tabIndex={0}
        role="region"
        aria-roledescription="stran letaka"
        aria-label={`${pageLabel}. Povečaj z dvojnim dotikom ali tipkama + in −.`}
        onKeyDown={onKeyDown}
      >
        <div
          ref={stageRef}
          className={styles.stage}
          data-testid="leaflet-stage"
          style={content ? { width: content.width, height: content.height } : { width: "100%", visibility: "hidden" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- pre-rendered page image; transformed together with overlays */}
          <img
            ref={imgRef}
            src={page.image.src}
            width={page.image.width}
            height={page.image.height}
            alt={`${pageLabel} originalnega SPAR letaka`}
            className={styles.pageImg}
            draggable={false}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            onLoad={() => setImgState("loaded")}
            onError={() => setImgState("error")}
          />
          <div className={styles.overlays}>
            {items.map((it) => {
              const isTarget = it.productId === targetProductId;
              return (
                <button
                  key={it.placementId}
                  type="button"
                  className={`${styles.hit} ${it.saved ? styles.saved : ""} ${isTarget && !it.saved ? styles.target : ""}`}
                  style={{
                    left: `${it.bbox.x * 100}%`,
                    top: `${it.bbox.y * 100}%`,
                    width: `${it.bbox.width * 100}%`,
                    height: `${it.bbox.height * 100}%`,
                  }}
                  data-placement-id={it.placementId}
                  data-product-id={it.productId}
                  data-saved={it.saved || undefined}
                  aria-label={it.label}
                  aria-haspopup="dialog"
                  onClick={(e) => {
                    // Pointer taps are detected by the gesture handler (so drags never count as taps);
                    // keyboard activation (detail 0) opens directly.
                    if (e.detail === 0) onOpenPlacement(it.placementId);
                  }}
                >
                  <span className={styles.focusRing} data-focus-ring aria-hidden="true" />
                  {it.saved && (
                    <>
                      <span className={styles.pulse} data-pulse aria-hidden="true" />
                      <span className={styles.badge} aria-hidden="true">
                        ✓ V Mojem katalogu
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        {imgState === "loading" && <div className={styles.loading} aria-hidden="true" />}
        {imgState === "error" && (
          <div className={styles.error} role="status">
            Slike strani ni bilo mogoče naložiti.
          </div>
        )}
      </div>
    </div>
  );
}
