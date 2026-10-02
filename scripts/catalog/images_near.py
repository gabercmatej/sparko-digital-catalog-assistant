"""Helper: list + export embedded images intersecting a region (normalized x0 y0 x1 y1) of a page."""
import sys, pathlib, pymupdf
from PIL import Image, ImageDraw
ROOT = pathlib.Path(__file__).resolve().parents[2]
doc = pymupdf.open(ROOT / "260930-1-Katalog_4026.pdf")


def export(xref, path):
    info = doc.extract_image(xref)
    pix = pymupdf.Pixmap(doc, xref)
    if info.get("smask"):
        pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, info["smask"]))
    if pix.colorspace and pix.colorspace.n == 4:
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    pix.save(path)


if __name__ == "__main__":
    pn = int(sys.argv[1]); x0, y0, x1, y1 = map(float, sys.argv[2:6]); tag = sys.argv[6]
    p = doc[pn - 1]; W, H = p.rect.width, p.rect.height
    R = pymupdf.Rect(x0 * W, y0 * H, x1 * W, y1 * H)
    tiles = []
    for info in p.get_image_info(xrefs=True):
        b = pymupdf.Rect(info["bbox"])
        if info["xref"] and b.intersects(R) and info["width"] * info["height"] > 8000:
            print(info["xref"], [round(v / W if i % 2 == 0 else v / H, 3) for i, v in enumerate(b)], info["width"], info["height"])
            f = ROOT / ".tmp" / f"x{info['xref']}.png"; export(info["xref"], f)
            im = Image.open(f).convert("RGBA"); im.thumbnail((240, 240))
            t = Image.new("RGBA", (240, 260), (255, 0, 255, 255)); t.alpha_composite(im, (0, 20))
            ImageDraw.Draw(t).text((2, 2), str(info["xref"]), fill="black"); tiles.append(t)
    sh = Image.new("RGB", (240 * max(1, min(6, len(tiles))), 260 * ((len(tiles) + 5) // 6 or 1)), "gray")
    for i, t in enumerate(tiles): sh.paste(t.convert("RGB"), ((i % 6) * 240, (i // 6) * 260))
    sh.save(ROOT / ".tmp" / f"near-{tag}.png")
