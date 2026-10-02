"""Extract the genuine SPAR horizontal logo as vector SVG from the footer of PDF page 5.

The footer shows "SPAR (tree)  INTERSPAR (tree)". We keep only the vector paths that lie
inside the SPAR logo rectangle and write them as a minimal SVG (no clip paths, no raster).
Run: python scripts/catalog/extract_logo.py
"""
import pathlib
import pymupdf

ROOT = pathlib.Path(__file__).resolve().parents[2]
PDF = ROOT / "260930-1-Katalog_4026.pdf"
OUT = ROOT / "public" / "brand" / "spar-logo.svg"
PAGE_INDEX = 4
# SPAR logo area (PDF points); INTERSPAR starts at x~481.3
AREA = pymupdf.Rect(429.0, 785.5, 481.2, 796.0)


def color(c):
    return "#%02x%02x%02x" % tuple(round(v * 255) for v in c)


def main():
    doc = pymupdf.open(PDF)
    page = doc[PAGE_INDEX]
    paths = []
    for d in page.get_drawings():
        r = d["rect"]
        if not AREA.contains(r) or d.get("fill") is None:
            continue
        fill = color(d["fill"])
        segs = []
        cur = None
        for it in d["items"]:
            op = it[0]
            if op == "l":
                p1, p2 = it[1], it[2]
                if cur is None or abs(cur.x - p1.x) > 1e-3 or abs(cur.y - p1.y) > 1e-3:
                    segs.append(f"M{p1.x:.3f} {p1.y:.3f}")
                segs.append(f"L{p2.x:.3f} {p2.y:.3f}")
                cur = p2
            elif op == "c":
                p1, c1, c2, p2 = it[1], it[2], it[3], it[4]
                if cur is None or abs(cur.x - p1.x) > 1e-3 or abs(cur.y - p1.y) > 1e-3:
                    segs.append(f"M{p1.x:.3f} {p1.y:.3f}")
                segs.append(f"C{c1.x:.3f} {c1.y:.3f} {c2.x:.3f} {c2.y:.3f} {p2.x:.3f} {p2.y:.3f}")
                cur = p2
            elif op == "re":
                q = it[1]
                segs.append(f"M{q.x0:.3f} {q.y0:.3f}H{q.x1:.3f}V{q.y1:.3f}H{q.x0:.3f}Z")
                cur = None
            elif op == "qu":
                q = it[1]
                segs.append(
                    f"M{q.ul.x:.3f} {q.ul.y:.3f}L{q.ur.x:.3f} {q.ur.y:.3f}L{q.lr.x:.3f} {q.lr.y:.3f}L{q.ll.x:.3f} {q.ll.y:.3f}Z"
                )
                cur = None
        if d.get("closePath"):
            segs.append("Z")
        rule = ' fill-rule="evenodd"' if d.get("even_odd") else ""
        paths.append((r, fill, "".join(segs), rule))
    # drop the white background rectangle(s) that span the whole logo
    bg = [p for p in paths if p[1] == "#ffffff" and p[0].width > 40]
    paths = [p for p in paths if p not in bg]
    bb = pymupdf.Rect()
    for r, *_ in paths:
        bb |= r
    pad = 0.12
    vb = (bb.x0 - pad, bb.y0 - pad, bb.width + 2 * pad, bb.height + 2 * pad)
    body = "\n".join(f'  <path fill="{f}"{rule} d="{dd}"/>' for _, f, dd, rule in paths)
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]:.3f} {vb[1]:.3f} {vb[2]:.3f} {vb[3]:.3f}" '
        f'role="img" aria-label="SPAR">\n  <title>SPAR</title>\n{body}\n</svg>\n'
    )
    OUT.write_text(svg, encoding="utf-8")
    print("paths", len(paths), "viewBox", vb, "aspect", vb[2] / vb[3])


if __name__ == "__main__":
    main()
