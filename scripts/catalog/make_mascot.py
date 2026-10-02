"""Cut the Sparko mascot out of assets/references/reference-2.png (red banner) -> public/brand/sparko-mascot.webp.

Method: region growing from the image border over the smooth red background (a pixel joins when it is
reddish and differs from its already-background neighbour by < STEP), which stops at the character's dark
outlines; enclosed background pockets are added via explicit seeds; only the largest foreground component
is kept; alpha is feathered inward by ~1 px; result is upscaled modestly with LANCZOS.
The character itself is not redrawn or altered.
Run: python scripts/catalog/make_mascot.py
"""
import collections, pathlib, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "assets" / "references" / "reference-2.png"
OUT = ROOT / "public" / "brand" / "sparko-mascot.webp"
CROP = (0, 0, 250, 229)      # mascot area (text/logo on the right excluded)
STEP = 16                    # max colour step between neighbouring background pixels
POCKET_SEEDS = [(110, 23), (120, 25)] + [tuple(map(int, s.split(","))) for s in sys.argv[1:]]  # enclosed bg pocket inside the handle


def reddish(p):
    r, g, b = p
    return r > 120 and r - g > 70 and r - b > 60


def main():
    im = Image.open(SRC).convert("RGB").crop(CROP)
    a = np.asarray(im).astype(int)
    h, w, _ = a.shape
    bg = np.zeros((h, w), bool)
    q = collections.deque()
    seeds = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    seeds += POCKET_SEEDS
    for x, y in seeds:
        if reddish(a[y, x]) and not bg[y, x]:
            bg[y, x] = True; q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not bg[ny, nx]:
                p = a[ny, nx]
                if reddish(p) and np.abs(p - a[y, x]).max() < STEP:
                    bg[ny, nx] = True; q.append((nx, ny))
    fg = ~bg
    # keep the largest connected foreground component (drops loose sparkle strokes / specks)
    lab = np.zeros((h, w), int); best, best_n, cur = 0, 0, 0
    for sy in range(h):
        for sx in range(w):
            if fg[sy, sx] and not lab[sy, sx]:
                cur += 1; n = 0; lab[sy, sx] = cur; q.append((sx, sy))
                while q:
                    x, y = q.popleft(); n += 1
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and fg[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = cur; q.append((nx, ny))
                if n > best_n: best, best_n = cur, n
    fg = lab == best
    alpha = np.where(fg, 255, 0).astype(np.uint8)
    blurred = np.asarray(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.7)))
    alpha = np.minimum(alpha, blurred).astype(np.uint8)
    rgba = im.copy(); rgba.putalpha(Image.fromarray(alpha).copy())
    rgba = rgba.crop(rgba.getchannel("A").point(lambda v: 255 if v > 10 else 0).getbbox())
    target_h = 360
    rgba = rgba.resize((round(rgba.width * target_h / rgba.height), target_h), Image.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(OUT, "WEBP", quality=90, method=6)
    # review composites
    tmp = ROOT / ".tmp"; tmp.mkdir(exist_ok=True)
    sheet = Image.new("RGB", (rgba.width * 3, rgba.height), "white")
    for i, col in enumerate([(255, 255, 255), (241, 242, 241), (30, 30, 30)]):
        t = Image.new("RGBA", rgba.size, col + (255,)); t.alpha_composite(rgba); sheet.paste(t.convert("RGB"), (i * rgba.width, 0))
    sheet.save(tmp / "mascot-check.png")
    # show remaining reddish non-bg areas (candidate pockets)
    print("size", rgba.size, "fg px", int(fg.sum()))


if __name__ == "__main__":
    main()
