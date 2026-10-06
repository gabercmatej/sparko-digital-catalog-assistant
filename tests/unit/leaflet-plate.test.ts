import { describe, expect, it } from "vitest";
import { ringColor } from "@/components/leaflet/plate";

/** w×h RGBA image filled with `bg`, with `fg` rectangles [x0,x1)×[y0,y1). */
function image(w: number, h: number, bg: number[], rects: [number[], number, number, number, number][]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const hit = rects.find(([, x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
      data.set([...(hit ? hit[0] : bg), 255], (y * w + x) * 4);
    }
  return data;
}
const BOX = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };

describe("ringColor (background revealed around a shrinking saved box)", () => {
  it("returns the card background just inside the box edge, not the packshot in the middle or the gutter outside", () => {
    const data = image(100, 100, [255, 255, 255], [
      [[0, 120, 60], 20, 20, 80, 80], // green card = the box
      [[230, 10, 20], 35, 35, 65, 65], // red packshot in the middle
    ]);
    expect(ringColor(data, 100, 100, BOX)).toBe("rgb(0 120 60)");
  });

  it("takes the dominant colour when part of the ring crosses something else", () => {
    const data = image(100, 100, [0, 120, 60], [[[255, 255, 255], 0, 0, 100, 24]]);
    expect(ringColor(data, 100, 100, BOX)).toBe("rgb(0 120 60)");
  });

  it("handles boxes at the page edge and degenerate boxes", () => {
    const data = image(50, 50, [240, 240, 240], []);
    expect(ringColor(data, 50, 50, { x: 0, y: 0, width: 1, height: 1 })).toBe("rgb(240 240 240)");
    expect(ringColor(data, 50, 50, { x: 0.5, y: 0.5, width: 0.04, height: 0.04 })).toBeNull();
  });
});
