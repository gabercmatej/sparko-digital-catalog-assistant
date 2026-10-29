"""Inspect one PDF page for indexing (V3.1). Read-only on the PDF; writes only under .tmp/v3/.

  python scripts/catalog/v3/inspect_page.py <catalogId> <page>             text, price clusters, images, cells + grid PNG
  python scripts/catalog/v3/inspect_page.py <catalogId> <page> --draft     + draft offer specs (heuristic, MUST be checked)
  python scripts/catalog/v3/inspect_page.py <catalogId> <page> --crop x0,y0,x1,y1   zoomed crop PNG with a 0.01 grid

All coordinates are normalized to the page (0..1, origin top-left), the same space as offer `box` / `image.crop`.
"""
from __future__ import annotations

import json
import re
import sys

import pymupdf
from PIL import Image, ImageDraw, ImageFont

from common import CATALOGS, PAGE_RULES, PRINTED_LABELS, TMP, centre, norm_rect, open_doc, page_lines, validity_for

sys.stdout.reconfigure(encoding="utf-8")

PRICE_LINE = re.compile(r"^-?\d{1,3}$")


def price_spans(page):
    """Big-euro + small-cents price prints: [(Rect, cents, euro_size)]."""
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            sp = [s for s in l["spans"] if s["text"].strip()]
            for a, c in zip(sp, sp[1:]):
                ta, tc = a["text"].strip(), c["text"].strip()
                if re.fullmatch(r"\d{1,3}", ta) and re.fullmatch(r"\d{2}", tc) and a["size"] > c["size"] * 1.25 and a["size"] >= 9:
                    out.append((pymupdf.Rect(a["bbox"]) | pymupdf.Rect(c["bbox"]), int(ta) * 100 + int(tc), a["size"]))
    return out


def images(cid, page):
    out = []
    for i in page.get_image_info(xrefs=True):
        if not i["xref"]:
            continue
        r = pymupdf.Rect(i["bbox"]) & page.rect
        if r.is_empty or r.width * r.height < 400:
            continue
        out.append((i["xref"], r, i["width"], i["height"]))
    return out


def cells(page):
    out = []
    W, H = page.rect.width, page.rect.height
    for d in page.get_drawings():
        r = d["rect"] & page.rect
        f = d.get("fill")
        if f and r.width > 50 and r.height > 50 and r.width < W * 0.98 and r.height < H * 0.9:
            out.append((r, tuple(round(c * 255) for c in f)))
    return out


def grid_png(cid, n, page, step=0.05):
    TMP.mkdir(parents=True, exist_ok=True)
    (TMP / "grid").mkdir(exist_ok=True)
    pix = page.get_pixmap(dpi=150, alpha=False)
    im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    dr = ImageDraw.Draw(im)
    W, H = im.size
    k = 0
    v = 0.0
    while v <= 1.0001:
        x, y = int(v * W), int(v * H)
        col = (255, 0, 255) if k % 2 == 0 else (0, 170, 255)
        dr.line([(x, 0), (x, H)], fill=col, width=1)
        dr.line([(0, y), (W, y)], fill=col, width=1)
        if k % 2 == 0:
            dr.text((x + 2, 2), f"{v:.2f}", fill=col)
            dr.text((2, y + 2), f"{v:.2f}", fill=col)
        v += step
        k += 1
    path = TMP / "grid" / f"{cid}-p{n:02d}.png"
    im.save(path)
    return path


def crop_png(cid, n, page, box):
    (TMP / "crop").mkdir(parents=True, exist_ok=True)
    x0, y0, x1, y1 = box
    W, H = page.rect.width, page.rect.height
    clip = pymupdf.Rect(x0 * W, y0 * H, x1 * W, y1 * H)
    dpi = min(400, max(120, int(72 * 1100 / max(clip.width, clip.height))))
    pix = page.get_pixmap(clip=clip, dpi=dpi, alpha=False)
    im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    dr = ImageDraw.Draw(im)
    w, h = im.size
    # ticks every 0.01 page units, labels every 0.05
    v = round(x0 - (x0 % 0.01), 2)
    while v <= x1:
        if v >= x0:
            x = int((v - x0) / (x1 - x0) * w)
            major = abs((v * 100) % 5) < 1e-6
            dr.line([(x, 0), (x, 14 if major else 7)], fill=(255, 0, 255), width=2 if major else 1)
            if major:
                dr.text((x + 2, 14), f"{v:.2f}", fill=(255, 0, 255))
        v = round(v + 0.01, 2)
    v = round(y0 - (y0 % 0.01), 2)
    while v <= y1:
        if v >= y0:
            y = int((v - y0) / (y1 - y0) * h)
            major = abs((v * 100) % 5) < 1e-6
            dr.line([(0, y), (14 if major else 7, y)], fill=(255, 0, 255), width=2 if major else 1)
            if major:
                dr.text((16, y + 1), f"{v:.2f}", fill=(255, 0, 255))
        v = round(v + 0.01, 2)
    path = TMP / "crop" / f"{cid}-p{n:02d}-{x0:.2f}-{y0:.2f}-{x1:.2f}-{y1:.2f}.png"
    im.save(path)
    return path


def is_name_line(t: str, size: float) -> bool:
    if not (6.5 <= size <= 11):
        return False
    if re.search(r"redna cena|^PC |s SPAR plus|CENEJE|^-?\d+ ?%|^•|SPAR plus kartic|^\d+ \d\d$", t, re.I):
        return False
    return len(t) > 1


def draft(cid, n, page, lines, prices, imgs, cls):
    """Heuristic draft: one candidate per big price print, paired with the nearest name block above / beside it."""
    W, H = page.rect.width, page.rect.height
    names = [(r, t) for r, t, s in lines if is_name_line(t, s)]
    # group name lines into blocks (vertically adjacent, horizontally overlapping)
    blocks: list[list] = []
    for r, t in sorted(names, key=lambda x: (x[0].y0, x[0].x0)):
        for b in blocks:
            last = b[-1][0]
            if 0 <= r.y0 - last.y1 < max(4, last.height * 0.9) and min(r.x1, last.x1) - max(r.x0, last.x0) > -4:
                b.append((r, t))
                break
        else:
            blocks.append([(r, t)])
    used = set()
    out = []
    small = [(r, t) for r, t, s in lines if s < 7.5]
    for pr, cents, size in sorted(prices, key=lambda p: (p[0].y0, p[0].x0)):
        pc = centre(pr)
        best, bd = None, 1e9
        for k, b in enumerate(blocks):
            br = pymupdf.Rect(b[0][0])
            for r, _ in b:
                br |= r
            # the name block starts left of the price print and not below it (SPAR / INTERSPAR / DESPAR layouts)
            if br.x0 > pr.x0 + 2 or br.y0 > pr.y1:
                continue
            dx = max(0, br.x0 - pc.x, pc.x - br.x1)
            dy = pc.y - br.y1  # positive: name above price
            d = dx * 1.5 + (abs(dy) * (1 if dy >= -10 else 3))
            if k not in used and d < bd:
                best, bd = k, d
        cluster = pymupdf.Rect(pr) + (-0.13 * W, -0.04 * H, 0.06 * W, 0.01 * H)
        near = [t for r, t in small if cluster.contains(centre(r))]
        reg = next((m.group(1) for t in near for m in [re.search(r"redna cena (\d+,\d\d)", t)] if m), None)
        pcp = next((m.group(0) for t in near for m in [re.search(r"PC \d+,\d\d", t)] if m), None)
        pct = next((m.group(1) for r, t, s in lines if cluster.contains(centre(r)) for m in [re.fullmatch(r"-?(\d{1,2}) ?%", t)] if m), None)
        cand = {"page": n, "price": cents, "priceAt": norm_rect(pr, page)}
        if best is not None and bd < 0.35 * W:
            used.add(best)
            b = blocks[best]
            br = pymupdf.Rect(b[0][0])
            for r, _ in b:
                br |= r
            cand["nameLines"] = [t for _, t in b]
            cand["anchor"] = b[0][1]
            box = pymupdf.Rect(br) | pr
            cell = [r for r, _ in cls if r.contains(centre(br)) and r.contains(pc) and r.width * r.height < W * H * 0.5]
            if cell:
                box = min(cell, key=lambda r: r.width * r.height)
                cand["boxFrom"] = "drawn cell"
            else:
                for x, ir, _, _ in imgs:
                    ic = centre(ir)
                    if box.x0 - 0.05 * W < ic.x < box.x1 + 0.05 * W and box.y0 - 0.3 * H < ic.y < box.y1 and ir.width < 0.6 * W:
                        box |= ir
                cand["boxFrom"] = "union(name, price, images) - CHECK"
            cand["box"] = list(norm_rect(box & page.rect, page))
            cand["imagesInBox"] = [x for x, ir, _, _ in imgs if (box + (-2, -2, 2, 2)).contains(centre(ir))]
        if reg:
            e, c = reg.split(",")
            cand["regular"] = int(e) * 100 + int(c)
        if pct:
            cand["discount"] = int(pct)
        if pcp:
            cand["pc"] = pcp
        out.append(cand)
    return out


def main():
    cid, n = sys.argv[1], int(sys.argv[2])
    doc = open_doc(cid)
    page = doc[n - 1]
    if "--crop" in sys.argv:
        box = [float(v) for v in sys.argv[sys.argv.index("--crop") + 1].split(",")]
        print(crop_png(cid, n, page, box))
        return
    W, H = page.rect.width, page.rect.height
    lines = page_lines(page)
    prices = price_spans(page)
    imgs = images(cid, page)
    cls = cells(page)
    v = validity_for(cid, n)
    print(f"# {cid} PDF page {n}/{doc.page_count}  size {W:.0f}x{H:.0f} pt  printed label: {PRINTED_LABELS[cid].get(n)}")
    print(f"# validity by rule: {v['from']} .. {v['to']} ({'PAGE RULE' if n in PAGE_RULES.get(cid, {}) else 'general'})")
    print(f"# page image (1400 px): public/catalog/{cid}/pages/page-{n:02d}.webp   grid: {grid_png(cid, n, page)}")
    print("## text lines  (x0,y0-x1,y1  [font size]  text)")
    for r, t, s in sorted(lines, key=lambda x: (round(x[0].y0 / H, 2), x[0].x0)):
        if len(t) == 1 and s < 5:
            continue  # curved stamp letters
        a = norm_rect(r, page)
        print(f"{a[0]:.3f},{a[1]:.3f}-{a[2]:.3f},{a[3]:.3f} [{s:.0f}] {t}")
    print("## price prints (big euros + small cents)")
    for r, cents, size in sorted(prices, key=lambda p: (p[0].y0, p[0].x0)):
        a = norm_rect(r, page)
        print(f"{a[0]:.3f},{a[1]:.3f}-{a[2]:.3f},{a[3]:.3f} [{size:.0f}] {cents // 100},{cents % 100:02d}")
    print("## images  (xref  box  native px)")
    for x, r, w, h in imgs:
        a = norm_rect(r, page)
        print(f"xref {x}: {a[0]:.3f},{a[1]:.3f}-{a[2]:.3f},{a[3]:.3f}  {w}x{h}")
    print("## filled cells")
    for r, f in cls:
        a = norm_rect(r, page)
        print(f"{a[0]:.3f},{a[1]:.3f}-{a[2]:.3f},{a[3]:.3f} fill={f}")
    if "--draft" in sys.argv:
        print("## DRAFT offers (heuristic pairing - verify every field visually before using)")
        print(json.dumps(draft(cid, n, page, lines, prices, imgs, cls), ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
