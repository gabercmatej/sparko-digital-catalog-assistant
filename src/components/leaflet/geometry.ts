/**
 * Pure geometry helpers for the leaflet viewer (no DOM, unit-tested).
 *
 * Model: a "stage" element of size `content` (the page at fit-to-width, scale 1)
 * is rendered inside a clipping viewport of size `viewport` with
 * `transform: translate(x, y) scale(scale)` and `transform-origin: 0 0`.
 * The page image and every overlay live inside the stage, so they share one
 * coordinate space. Normalized bboxes (0..1) map to stage % directly.
 */

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type View = { scale: number; x: number; y: number };
export type NormalizedRect = { x: number; y: number; width: number; height: number };

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
export const DOUBLE_TAP_SCALE = 2.5;

export function clamp(value: number, min: number, max: number): number {
  if (min > max) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}

export function clampScale(scale: number, min = MIN_SCALE, max = MAX_SCALE): number {
  if (!Number.isFinite(scale)) return min;
  return clamp(scale, min, max);
}

/** Size of the stage when the page is fitted to the viewport width. */
export function fitToWidth(viewportWidth: number, image: Size): Size {
  if (viewportWidth <= 0 || image.width <= 0 || image.height <= 0) return { width: 0, height: 0 };
  return { width: viewportWidth, height: (viewportWidth * image.height) / image.width };
}

/**
 * Keeps the page on screen: along an axis where the scaled page is smaller than the
 * viewport it is centered; otherwise its edges may not move inside the viewport.
 */
export function clampView(view: View, viewport: Size, content: Size, min = MIN_SCALE, max = MAX_SCALE): View {
  const scale = clampScale(view.scale, min, max);
  const cw = content.width * scale;
  const ch = content.height * scale;
  const x = cw <= viewport.width ? (viewport.width - cw) / 2 : clamp(view.x, viewport.width - cw, 0);
  const y = ch <= viewport.height ? (viewport.height - ch) / 2 : clamp(view.y, viewport.height - ch, 0);
  return { scale, x, y };
}

/** Content (stage) coordinates of a viewport point. */
export function toContent(point: Point, view: View): Point {
  return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale };
}

/**
 * New view after zooming to `nextScale` so that the content point currently under
 * `anchor` (viewport coordinates) stays under it. Result is clamped.
 */
export function zoomAround(view: View, nextScale: number, anchor: Point, viewport: Size, content: Size, min = MIN_SCALE, max = MAX_SCALE): View {
  const scale = clampScale(nextScale, min, max);
  const p = toContent(anchor, view);
  return clampView({ scale, x: anchor.x - p.x * scale, y: anchor.y - p.y * scale }, viewport, content, min, max);
}

/**
 * Pinch update: `start` is the view when the second finger went down, `startMid`/`startDist`
 * the midpoint/distance then; the content point under the start midpoint follows the
 * current midpoint (so two-finger panning works too).
 */
export function pinchView(
  start: View,
  startMid: Point,
  startDist: number,
  mid: Point,
  dist: number,
  viewport: Size,
  content: Size,
  min = MIN_SCALE,
  max = MAX_SCALE,
): View {
  const ratio = startDist > 0 ? dist / startDist : 1;
  const scale = clampScale(start.scale * ratio, min, max);
  const p = toContent(startMid, start);
  return clampView({ scale, x: mid.x - p.x * scale, y: mid.y - p.y * scale }, viewport, content, min, max);
}

/** View at `scale` that centers the normalized rect in the viewport as far as clamping allows. */
export function centerOnRect(rect: NormalizedRect, scale: number, viewport: Size, content: Size, min = MIN_SCALE, max = MAX_SCALE): View {
  const s = clampScale(scale, min, max);
  const cx = (rect.x + rect.width / 2) * content.width * s;
  const cy = (rect.y + rect.height / 2) * content.height * s;
  return clampView({ scale: s, x: viewport.width / 2 - cx, y: viewport.height / 2 - cy }, viewport, content, min, max);
}

/** Initial fit-to-width view: scale 1, page top aligned (or centered if it fits). */
export function initialView(viewport: Size, content: Size): View {
  return clampView({ scale: 1, x: 0, y: 0 }, viewport, content);
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export const TAP_MAX_MOVE = 8; // CSS px
export const TAP_MAX_MS = 500;

/** A pointer sequence counts as a tap only if it stayed put, was short and never became multi-touch. */
export function isTap(moved: number, durationMs: number, multiTouch: boolean): boolean {
  return !multiTouch && moved < TAP_MAX_MOVE && durationMs < TAP_MAX_MS;
}

export type SwipeResult = "next" | "prev" | null;

/** Decide a page swipe from a horizontal drag (only used at fit-to-width). */
export function swipeDirection(dx: number, dy: number, durationMs: number, viewportWidth: number): SwipeResult {
  if (Math.abs(dx) < 1.2 * Math.abs(dy)) return null;
  const far = Math.abs(dx) > Math.max(60, viewportWidth * 0.22);
  const flick = Math.abs(dx) > 35 && durationMs < 300;
  if (!far && !flick) return null;
  return dx < 0 ? "next" : "prev";
}

/** Rescales a view's translation when the viewport width changes (keeps the same content point at the origin). */
export function rescaleOnResize(view: View, oldContent: Size, newContent: Size, viewport: Size): View {
  const r = oldContent.width > 0 ? newContent.width / oldContent.width : 1;
  return clampView({ scale: view.scale, x: view.x * r, y: view.y * r }, viewport, newContent);
}
