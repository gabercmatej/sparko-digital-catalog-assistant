"""Render all PDF pages to WebP page images (1400 px wide) and thumbnails (240 px wide).

Run: python scripts/catalog/render_pages.py
Writes public/catalog/pages/page-XX.webp, public/catalog/thumbs/page-XX.webp and
prints a JSON list of {index, width, height, thumbWidth, thumbHeight} to .tmp/pages.json.
"""
import io
import json
import pathlib
import pymupdf
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
PDF = ROOT / "260930-1-Katalog_4026.pdf"
PAGES = ROOT / "public" / "catalog" / "pages"
THUMBS = ROOT / "public" / "catalog" / "thumbs"
PAGE_W = 1400
THUMB_W = 240


def main():
    PAGES.mkdir(parents=True, exist_ok=True)
    THUMBS.mkdir(parents=True, exist_ok=True)
    (ROOT / ".tmp").mkdir(exist_ok=True)
    doc = pymupdf.open(PDF)
    out = []
    for i, page in enumerate(doc):
        # render at ~2x target then downsample with LANCZOS for crisp text
        zoom = (PAGE_W * 2) / page.rect.width
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
        img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        h = round(img.height * PAGE_W / img.width)
        full = img.resize((PAGE_W, h), Image.LANCZOS)
        full.save(PAGES / f"page-{i + 1:02d}.webp", "WEBP", quality=78, method=6)
        th = round(img.height * THUMB_W / img.width)
        thumb = img.resize((THUMB_W, th), Image.LANCZOS)
        thumb.save(THUMBS / f"page-{i + 1:02d}.webp", "WEBP", quality=72, method=6)
        out.append({"index": i, "width": PAGE_W, "height": h, "thumbWidth": THUMB_W, "thumbHeight": th})
        print(i + 1, PAGE_W, h, THUMB_W, th, flush=True)
    (ROOT / ".tmp" / "pages.json").write_text(json.dumps(out), encoding="utf-8")


if __name__ == "__main__":
    main()
