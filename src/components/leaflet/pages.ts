/**
 * Pure page-navigation helpers for the leaflet (no React, unit-tested).
 * Internally pages are addressed by 0-based pdfPageIndex; URLs use the 1-based pdfPageNumber.
 */
import type { Placement } from "@/lib/types";

/** Parses the `stran` search param (1-based PDF page number) into a 0-based index, or null. */
export function parsePageParam(value: string | null | undefined, pageCount: number): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || String(n) !== value.trim()) return null;
  if (n < 1 || n > pageCount) return null;
  return n - 1;
}

export function allPageIndexes(pageCount: number): number[] {
  return Array.from({ length: Math.max(0, pageCount) }, (_, i) => i);
}

/**
 * Sorted unique page indexes that contain at least one placement of a saved product.
 * `productIdForOffer` maps a placement's offer to its product.
 */
export function pagesWithProducts(productIds: Iterable<string>, placements: Placement[], productIdForOffer: (offerId: string) => string | undefined): number[] {
  const wanted = new Set(productIds);
  if (wanted.size === 0) return [];
  const pages = new Set<number>();
  for (const pl of placements) {
    const pid = productIdForOffer(pl.offerId);
    if (pid && wanted.has(pid)) pages.add(pl.pdfPageIndex);
  }
  return [...pages].sort((a, b) => a - b);
}

/**
 * Next/previous page in `visible` (sorted) relative to `current`. Works even when `current`
 * itself is not in the list (e.g. the last saved product on a filtered page was removed).
 */
export function adjacentPage(current: number, visible: number[], dir: 1 | -1): number | null {
  if (dir === 1) {
    for (const p of visible) if (p > current) return p;
    return null;
  }
  for (let i = visible.length - 1; i >= 0; i--) if (visible[i] < current) return visible[i];
  return null;
}

/** The page in `visible` closest to `current` (ties prefer the later page), or null if empty. */
export function nearestPage(current: number, visible: number[]): number | null {
  let best: number | null = null;
  for (const p of visible) {
    if (best === null || Math.abs(p - current) < Math.abs(best - current) || (Math.abs(p - current) === Math.abs(best - current) && p > best)) best = p;
  }
  return best;
}

/** Search string for the leaflet URL. */
export function leafletQuery(pageIndex: number, opts: { productId?: string | null; mine?: boolean } = {}): string {
  const params = new URLSearchParams();
  params.set("stran", String(pageIndex + 1));
  if (opts.productId) params.set("izdelek", opts.productId);
  if (opts.mine) params.set("moji", "1");
  return `?${params.toString()}`;
}
