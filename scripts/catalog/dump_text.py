"""Helper: print text lines with normalized bboxes for given 1-based pages (data inspection only)."""
import sys, pathlib, pymupdf
ROOT = pathlib.Path(__file__).resolve().parents[2]
doc = pymupdf.open(ROOT / "260930-1-Katalog_4026.pdf")
for n in map(int, sys.argv[1:]):
    p = doc[n - 1]; W, H = p.rect.width, p.rect.height
    print(f"=== page {n}")
    for b in p.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            t = " ".join(s["text"] for s in l["spans"]).strip()
            if not t: continue
            x0, y0, x1, y1 = l["bbox"]
            print(f"{x0/W:.3f} {y0/H:.3f} {x1/W:.3f} {y1/H:.3f} | {t}")
