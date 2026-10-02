"""Helper for curation: locate candidate product blocks in the PDF and dump evidence.

For each (page, anchor) the script finds the text line containing the anchor, the smallest
filled cell rectangle around it, all text inside that cell and the embedded images whose
centre lies in the cell. Writes .tmp/candidates.json and a crop per candidate
(.tmp/crops/<key>.png, 200 dpi) for VISUAL verification. Data in catalog.json is entered by
hand after looking at those crops; this script never writes catalog.json.

Run: python scripts/catalog/inspect_candidates.py
"""
import json, pathlib, sys
import pymupdf

ROOT = pathlib.Path(__file__).resolve().parents[2]
doc = pymupdf.open(ROOT / "260930-1-Katalog_4026.pdf")
OUT = ROOT / ".tmp"
(OUT / "crops").mkdir(parents=True, exist_ok=True)

CANDIDATES = [
    (1, "MASLO"), (1, "KISLO ZELJE"), (4, "BELI LEPLJIVI"),
    (5, "LAHKA SKUTA"), (5, "POMMES FRITES"), (5, "POSEBNA SALAMA"), (5, "SVINJSKI ZREZKI"),
    (6, "BIO RUKOLA"),
    (8, "BOROVNICE"), (8, "AVOKADO"), (8, "JABOLKA GALA"), (8, "BIO LIMONE"), (8, "HOKAIDO"),
    (9, "SLOVENSKI KROMPIR"), (9, "ŠAMPINJONI"), (9, "HRUŠKE ABATE"), (9, "SVEŽE ZELJE"), (9, "SOLATE FRIŠNO"),
    (10, "KRUH ZA SENDVIČE"), (10, "JAGODE"), (10, "BELO GROZDJE"), (10, "KIVI"),
    (11, "KORUZA"), (11, "MLETO MEŠANO"), (11, "MINI FILE"), (11, "TORTILJE"),
    (12, "PIŠČANČJI FILE"), (12, "MLETI FILE"), (12, "GOVEJI ZREZKI"),
    (13, "PARTY"), (14, "SONČNIČNO"), (16, "KAJZERICE"),
    (18, "TRAJNO MLEKO"), (18, "ZA KUHO"), (18, "NAVADNI"), (18, "KEFIR"),
    (19, "DEBELA JAJCA"), (19, "v rezinah"), (19, "MLEČNI NAMAZ"),
    (20, "MOKA MANITOBA"), (20, "GRAN RUOTE"), (20, "PARADIŽNIKOVA"), (20, "TUNINA"),
    (21, "KAKAV NESQUIK"), (23, "MLETA"),
]


def cells(page):
    out = []
    for d in page.get_drawings():
        r = d["rect"] & page.rect
        f = d.get("fill")
        if f and r.width > 60 and r.height > 60 and r.width < page.rect.width * 0.99 and sum(f) > 0.3:
            out.append(r)
    return out


def main(filter_key=None):
    res = []
    for pn, anchor in CANDIDATES:
        key = f"p{pn:02d}-{anchor.lower().replace(' ', '-')}"
        if filter_key and filter_key not in key:
            continue
        page = doc[pn - 1]
        W, H = page.rect.width, page.rect.height
        lines = []
        for b in page.get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                t = " ".join(s["text"] for s in l["spans"]).strip()
                if t:
                    lines.append((pymupdf.Rect(l["bbox"]), t))
        hits = [r for r, t in lines if anchor in t]
        if not hits:
            print("NO ANCHOR", key); continue
        hit = hits[0]
        c = hit.tl + (hit.br - hit.tl) * 0.5
        cand = [r for r in cells(page) if r.contains(c)]
        cell = min(cand, key=lambda r: r.width * r.height) if cand else None
        texts = [t for r, t in lines if cell and cell.contains(r.tl + (r.br - r.tl) * 0.5)] if cell else []
        imgs = []
        for info in page.get_image_info(xrefs=True):
            ib = pymupdf.Rect(info["bbox"])
            if cell and cell.contains(ib.tl + (ib.br - ib.tl) * 0.5) and info["xref"]:
                imgs.append({"xref": info["xref"], "bbox": [round(v, 1) for v in ib], "w": info["width"], "h": info["height"]})
        entry = {"key": key, "page": pn, "anchorBox": [round(v, 1) for v in hit],
                 "cell": [round(cell.x0 / W, 4), round(cell.y0 / H, 4), round(cell.width / W, 4), round(cell.height / H, 4)] if cell else None,
                 "texts": texts, "images": imgs}
        res.append(entry)
        clip = cell if cell else pymupdf.Rect(hit.x0 - 80, hit.y0 - 120, hit.x1 + 80, hit.y1 + 40) & page.rect
        page.get_pixmap(clip=clip, dpi=200).save(OUT / "crops" / f"{key}.png")
        print(json.dumps(entry, ensure_ascii=False))
    if not filter_key:
        (OUT / "candidates.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
