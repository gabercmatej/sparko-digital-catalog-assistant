import type { NormalizedRect } from "./geometry";

/**
 * Background colour of a printed product box: the most common colour (4-bit buckets, then the exact
 * mean of that bucket) on a thin ring `inset` px inside the box edge, where the leaflet prints the
 * card's own background. Painted behind a saved product while it "breathes" to 85%, so the shrunk
 * box reveals that background instead of a ghost of its own printed edges. Sampling inside (not
 * outside) the box keeps white gutters between cards from tinting it. `data` is RGBA, `width`×`height` px.
 */
export function ringColor(data: Uint8ClampedArray, width: number, height: number, bbox: NormalizedRect, inset = 3): string | null {
  const x0 = Math.round(bbox.x * width) + inset;
  const y0 = Math.round(bbox.y * height) + inset;
  const x1 = Math.round((bbox.x + bbox.width) * width) - 1 - inset;
  const y1 = Math.round((bbox.y + bbox.height) * height) - 1 - inset;
  if (x1 < x0 || y1 < y0) return null;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  const add = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const s = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    s.n++;
    s.r += r;
    s.g += g;
    s.b += b;
    buckets.set(key, s);
  };
  for (let x = x0; x <= x1; x++) {
    add(x, y0);
    add(x, y1);
  }
  for (let y = y0 + 1; y < y1; y++) {
    add(x0, y);
    add(x1, y);
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const s of buckets.values()) if (!best || s.n > best.n) best = s;
  if (!best) return null;
  return `rgb(${Math.round(best.r / best.n)} ${Math.round(best.g / best.n)} ${Math.round(best.b / best.n)})`;
}
