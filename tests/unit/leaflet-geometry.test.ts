import { describe, expect, it } from "vitest";
import {
  centerOnRect,
  clamp,
  clampView,
  fitContain,
  fitToWidth,
  initialView,
  isTap,
  pinchView,
  rescaleOnResize,
  swipeDirection,
  toContent,
  zoomAround,
} from "@/components/leaflet/geometry";

const viewport = { width: 390, height: 400 };
const content = fitToWidth(390, { width: 1400, height: 1900 }); // 390 x ~529

describe("leaflet geometry", () => {
  it("clamp handles inverted bounds", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(3, 10, 0)).toBe(5);
  });

  it("fits to width keeping aspect ratio", () => {
    expect(content.width).toBe(390);
    expect(content.height).toBeCloseTo(529.29, 1);
    expect(fitToWidth(0, { width: 10, height: 10 })).toEqual({ width: 0, height: 0 });
  });

  it("initial view is fit-to-width and top aligned when the page is taller", () => {
    expect(initialView(viewport, content)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("centers vertically when the page is shorter than the viewport", () => {
    const v = initialView({ width: 390, height: 800 }, content);
    expect(v.y).toBeCloseTo((800 - content.height) / 2, 5);
  });

  it("clampView never lets the page leave the viewport", () => {
    const v = clampView({ scale: 2, x: 500, y: 500 }, viewport, content);
    expect(v).toEqual({ scale: 2, x: 0, y: 0 });
    const w = clampView({ scale: 2, x: -5000, y: -5000 }, viewport, content);
    expect(w.x).toBeCloseTo(390 - 780, 5);
    expect(w.y).toBeCloseTo(400 - content.height * 2, 5);
    // horizontal axis at scale 1 is locked
    expect(clampView({ scale: 1, x: -100, y: 0 }, viewport, content).x).toBe(0);
  });

  it("clamps scale to limits", () => {
    expect(clampView({ scale: 10, x: 0, y: 0 }, viewport, content).scale).toBe(4);
    expect(clampView({ scale: 0.2, x: 0, y: 0 }, viewport, content).scale).toBe(1);
    expect(clampView({ scale: Number.NaN, x: 0, y: 0 }, viewport, content).scale).toBe(1);
  });

  it("zoomAround keeps the anchor content point fixed", () => {
    const start = { scale: 1, x: 0, y: 0 };
    const anchor = { x: 200, y: 150 };
    const before = toContent(anchor, start);
    const v = zoomAround(start, 2.5, anchor, viewport, content);
    const after = toContent(anchor, v);
    expect(v.scale).toBe(2.5);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it("zoomAround back to 1 recentres via clamp", () => {
    const v = zoomAround({ scale: 2.5, x: -300, y: -200 }, 1, { x: 100, y: 100 }, viewport, content);
    expect(v.scale).toBe(1);
    expect(v.x).toBe(0);
    expect(v.y).toBeLessThanOrEqual(0);
    expect(v.y).toBeGreaterThanOrEqual(400 - content.height);
  });

  it("pinchView scales by finger distance ratio around the midpoint", () => {
    const start = { scale: 1, x: 0, y: 0 };
    const mid = { x: 195, y: 200 };
    const v = pinchView(start, mid, 100, mid, 200, viewport, content);
    expect(v.scale).toBe(2);
    const p = toContent(mid, v);
    expect(p.x).toBeCloseTo(195, 5);
    expect(p.y).toBeCloseTo(200, 5);
  });

  it("centerOnRect makes the target visible", () => {
    const rect = { x: 0.665, y: 0.737, width: 0.335, height: 0.232 };
    const v = centerOnRect(rect, 1, viewport, content);
    const top = rect.y * content.height * v.scale + v.y;
    const bottom = (rect.y + rect.height) * content.height * v.scale + v.y;
    expect(top).toBeGreaterThanOrEqual(0);
    expect(bottom).toBeLessThanOrEqual(viewport.height + 0.001);
  });

  it("tap detection rejects drags, long presses and multi-touch", () => {
    expect(isTap(2, 120, false)).toBe(true);
    expect(isTap(12, 120, false)).toBe(false);
    expect(isTap(2, 800, false)).toBe(false);
    expect(isTap(0, 100, true)).toBe(false);
  });

  it("swipe direction needs a mostly horizontal, long or fast drag", () => {
    expect(swipeDirection(-120, 10, 400, 390)).toBe("next");
    expect(swipeDirection(120, 10, 400, 390)).toBe("prev");
    expect(swipeDirection(-40, 5, 200, 390)).toBe("next");
    expect(swipeDirection(-40, 5, 600, 390)).toBeNull();
    expect(swipeDirection(-100, 120, 200, 390)).toBeNull();
  });

  it("rescaleOnResize keeps the view valid for the new size", () => {
    const newContent = fitToWidth(800, { width: 1400, height: 1900 });
    const v = rescaleOnResize({ scale: 2, x: -100, y: -100 }, content, newContent, { width: 800, height: 300 });
    expect(v.scale).toBe(2);
    expect(v.x).toBeCloseTo(-100 * (800 / 390), 5);
  });
});

describe("leaflet contain fit", () => {
  it("fitContain shows the whole page as large as possible (no vertical scrolling at scale 1)", () => {
    const img = { width: 1400, height: 1900 };
    const w = fitContain({ width: 390, height: 700 }, img); // width-limited
    expect(w.width).toBeCloseTo(390);
    expect(w.height).toBeCloseTo(529.29, 1);
    const h = fitContain({ width: 390, height: 450 }, img); // height-limited
    expect(h.height).toBeCloseTo(450);
    expect(h.width).toBeCloseTo((450 * 1400) / 1900);
    expect(fitContain({ width: 0, height: 10 }, img)).toEqual({ width: 0, height: 0 });
    const v = initialView({ width: 390, height: 450 }, h);
    expect(v.scale).toBe(1);
    expect(v.y).toBeCloseTo(0);
    expect(v.x).toBeCloseTo((390 - h.width) / 2);
  });
});
