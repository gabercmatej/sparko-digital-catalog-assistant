"""Dev helper: print normalized text lines, drawn grid cells and image boxes of one PDF page.
Usage: python scripts/catalog/probe_page.py <spar|interspar> <page> [grep]"""
import sys, pathlib, pymupdf
ROOT = pathlib.Path(__file__).resolve().parents[2]
F = {"spar": "261007-1-Katalog_4126.pdf", "interspar": "261007-2-Katalog_INTERSPAR_1426.pdf"}
d = pymupdf.open(ROOT / F[sys.argv[1]])
p = d[int(sys.argv[2]) - 1]
g = sys.argv[3] if len(sys.argv) > 3 else None
W, H = p.rect.width, p.rect.height
n = lambda r: f"{r[0]/W:.3f},{r[1]/H:.3f},{r[2]/W:.3f},{r[3]/H:.3f}"
print("CELLS")
for dr in p.get_drawings():
    r = dr["rect"] & p.rect; f = dr.get("fill")
    if f and r.width > 60 and r.height > 60 and r.width < W * .99 and sum(f) > .3:
        print(" ", n(r), tuple(round(c * 255) for c in f))
print("TEXT")
for b in p.get_text("dict")["blocks"]:
    for l in b.get("lines", []):
        t = " ".join(s["text"] for s in l["spans"]).strip()
        if t and (not g or g in t):
            print(" ", n(l["bbox"]), t)
print("IMAGES")
for i in p.get_image_info(xrefs=True):
    r = i["bbox"]
    if i["xref"] and i["width"] * i["height"] >= 8000:
        print(" ", i["xref"], n(r), i["width"], i["height"])
