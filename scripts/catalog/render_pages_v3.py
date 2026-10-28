"""Render pages, thumbnails and cover for the V3 browse catalogs (the six leaflets on Home).

Run: python scripts/catalog/render_pages_v3.py [catalogId ...]
Source PDFs are in the project root (not deployed, see .vercelignore). Writes
public/catalog/<catalogId>/{pages,thumbs}/page-XX.webp (1400 / 240 px wide), cover.webp (page 1, 720 px wide)
and a copy of the PDF as public/catalog/<catalogId>/katalog.pdf, then prints the measured
sizes to .tmp/pages-<catalogId>.json. The editorial facts (title, validity, order) live in
scripts/catalog/leaflets.py, which builds src/data/leaflets.json from these measurements.
"""
import io
import json
import pathlib
import shutil
import sys

import pymupdf
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from leaflets import LEAFLETS  # noqa: E402

PAGE_W = 1400
THUMB_W = 240
COVER_W = 720


def render(catalog_id: str, pdf_name: str):
    base = ROOT / "public" / "catalog" / catalog_id
    for sub in ("pages", "thumbs"):
        (base / sub).mkdir(parents=True, exist_ok=True)
        for old in (base / sub).glob("page-*.webp"):
            old.unlink()
    (ROOT / ".tmp").mkdir(exist_ok=True)
    shutil.copyfile(ROOT / pdf_name, base / "katalog.pdf")
    doc = pymupdf.open(ROOT / pdf_name)
    out = []
    cover = None
    for i, page in enumerate(doc):
        zoom = (PAGE_W * 2) / page.rect.width
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
        img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        h = round(img.height * PAGE_W / img.width)
        img.resize((PAGE_W, h), Image.LANCZOS).save(base / "pages" / f"page-{i + 1:02d}.webp", "WEBP", quality=78, method=6)
        th = round(img.height * THUMB_W / img.width)
        img.resize((THUMB_W, th), Image.LANCZOS).save(base / "thumbs" / f"page-{i + 1:02d}.webp", "WEBP", quality=72, method=6)
        if i == 0:
            ch = round(img.height * COVER_W / img.width)
            img.resize((COVER_W, ch), Image.LANCZOS).save(base / "cover.webp", "WEBP", quality=80, method=6)
            cover = {"width": COVER_W, "height": ch}
        out.append({"index": i, "width": PAGE_W, "height": h, "thumbWidth": THUMB_W, "thumbHeight": th})
        print(catalog_id, i + 1, PAGE_W, h, flush=True)
    (ROOT / ".tmp" / f"pages-{catalog_id}.json").write_text(json.dumps({"cover": cover, "pages": out}), encoding="utf-8")


if __name__ == "__main__":
    wanted = set(sys.argv[1:])
    for leaflet in LEAFLETS:
        if not wanted or leaflet["id"] in wanted:
            render(leaflet["id"], leaflet["sourceFile"])
