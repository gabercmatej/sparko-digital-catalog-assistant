"""Render pages, thumbnails and cover for the two v2 catalogs (SPAR 41/26, INTERSPAR 14/26).

Run: python scripts/catalog/render_pages_v2.py
Writes public/catalog/<catalogId>/{pages,thumbs}/page-XX.webp, cover.webp (720 px wide, q80)
and copies the source PDF to public/catalog/<catalogId>/katalog.pdf.
Also writes .tmp/pages-<catalogId>.json.
"""
import io
import json
import pathlib
import shutil

import pymupdf
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
CATALOGS = {
    "spar-4126": "261007-1-Katalog_4126.pdf",
    "interspar-1426": "261007-2-Katalog_INTERSPAR_1426.pdf",
}
PAGE_W = 1400
THUMB_W = 240
COVER_W = 720


def render(catalog_id: str, pdf_name: str):
    base = ROOT / "public" / "catalog" / catalog_id
    (base / "pages").mkdir(parents=True, exist_ok=True)
    (base / "thumbs").mkdir(parents=True, exist_ok=True)
    (ROOT / ".tmp").mkdir(exist_ok=True)
    shutil.copyfile(ROOT / pdf_name, base / "katalog.pdf")
    doc = pymupdf.open(ROOT / pdf_name)
    out = []
    for i, page in enumerate(doc):
        zoom = (PAGE_W * 2) / page.rect.width
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
        img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        h = round(img.height * PAGE_W / img.width)
        full = img.resize((PAGE_W, h), Image.LANCZOS)
        full.save(base / "pages" / f"page-{i + 1:02d}.webp", "WEBP", quality=78, method=6)
        th = round(img.height * THUMB_W / img.width)
        img.resize((THUMB_W, th), Image.LANCZOS).save(base / "thumbs" / f"page-{i + 1:02d}.webp", "WEBP", quality=72, method=6)
        if i == 0:
            ch = round(img.height * COVER_W / img.width)
            img.resize((COVER_W, ch), Image.LANCZOS).save(base / "cover.webp", "WEBP", quality=80, method=6)
            out_cover = {"width": COVER_W, "height": ch}
        out.append({"index": i, "width": PAGE_W, "height": h, "thumbWidth": THUMB_W, "thumbHeight": th})
        print(catalog_id, i + 1, PAGE_W, h, flush=True)
    (ROOT / ".tmp" / f"pages-{catalog_id}.json").write_text(json.dumps({"cover": out_cover, "pages": out}), encoding="utf-8")


if __name__ == "__main__":
    for cid, name in CATALOGS.items():
        render(cid, name)
