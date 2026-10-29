"""Build one catalog's verified offers from scripts/catalog/v3/offers/<catalogId>.json (V3.1).

  python scripts/catalog/v3/build_offers.py <catalogId> [--dry] [--pages=1-22 [--preview]]

--dry   validate the specs and cross-check them against the PDF text layer only (fast; nothing written)
(full)  + packshots public/products/<productId>.webp, .tmp/v3/build/<catalogId>.json (partial catalog data),
          .tmp/v3/overlay/<catalogId>-pNN.png (offer boxes on the page) and .tmp/v3/sheet-<catalogId>-N.png (packshots)

Spec file:
{
  "catalogId": "spar-4426", "checkedOn": "2026-10-28",
  "pages": { "<pdf page>": { "theme": "Sveža izbira" | null, "offersOnPage": <int, every priced offer printed on the page>,
                             "notes": null | "…" } },              # one entry per PDF page (coverage report)
  "offers": [ OFFER, … ],
  "excluded": [ { "page": 5, "text": "<what is printed>", "reason": "<why no verified offer>" } ]
}
OFFER (facts exactly as printed; null when not printed - never inferred):
{
  "key": "nutella-1kg",                       # unique in the file; productId = "<key>-<catalog suffix>"
  "page": 16,                                 # PDF page number (1-based)
  "anchor": "SUHE SLIVE",                     # distinctive text of the printed NAME line (must be in the box's text layer)
  "name": "Suhe slive brez koščic", "brand": "SPAR" | null, "line": "S-BUDGET" | null, "descriptor": "brez konzervansov" | null,
  "pack": "200 g", "qty": [200, "g"] | null,  # qty unit: g kg ml l kos (multi-packs: total, e.g. "2 × 140 g" -> [280, "g"])
  "categories": ["sadje", "prigrizki"],       # vocabulary in common.CATEGORIES; first = primary (not a meal tag)
  "aliases": ["slive", "suhe slive"],         # lowercase Slovenian search words (inflections welcome)
  "price": 299, "priceUnit": "pack",          # cents; priceUnit pack | kg | 100g | kos  (»cena za kg« -> kg)
  "priceKind": "loyalty_price",               # catalog_price | loyalty_price (SPAR plus) | coupon_price
  "regular": 379 | null, "discount": 21 | null, "pc": "PC 2,65" | null,
  "spPlus": true, "coupon": false, "conditionNote": null | "ob nakupu 2 kosov",
  "unitPrice": null | {"cents": 1495, "per": "kg"},   # ONLY when a €/kg or €/l price is printed
  "validity": null | {"from": "2026-10-29", "to": "2026-10-30", "evidence": "str. 44: »PONUDBA VELJA 29. IN 30. 10. 2026.«"},
  "availability": null | "Samo v trgovinah INTERSPAR",  # printed store-type / location restriction of THIS offer
  "printed": "SUHE SLIVE BREZ KOŠČIC brez konzervansov, 200 g CENEJE 21% redna cena 3,79 PC 2,65 s SPAR plus kartico 2,99",
  "box": [0.0, 0.746, 0.332, 0.968],          # normalized offer block on the page (drawn cell / the printed block)
  "image": {"xrefs": [861]} | {"crop": [x0, y0, x1, y1]} | {"plain": [x0, y0, x1, y1]},
  "isNew": false,                             # true ONLY for a printed NOVO badge on this offer
  "textCheck": true,                          # false only for pages without a usable text layer (reason in notes)
  "notes": null | "…"
}
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import sys

import numpy as np
import pymupdf
from PIL import Image, ImageDraw, ImageFilter

from common import (CATALOGS, CATEGORIES, MEAL_TAGS, OFFERS_DIR, PAGE_RULES, PRICE_KINDS, PRICE_UNITS, PRINTED_LABELS, PRODUCTS_DIR,
                    QTY_UNITS, ROOT, TMP, centre, denorm, fmt, open_doc, page_lines, slugify, strip_diacritics, text_in, validity_for)

sys.stdout.reconfigure(encoding="utf-8")
IMAGE_CODE_VERSION = "3.1"


class SpecError(Exception):
    pass


# ----------------------------------------------------------------------------- validation
def check_spec(cid: str, spec: dict, page_count: int) -> list[str]:
    errs = []
    k = spec.get("key", "?")
    req = ["key", "page", "name", "pack", "categories", "price", "box", "image", "printed"]
    for f in req:
        if spec.get(f) in (None, "", []):
            errs.append(f"{k}: missing {f}")
    if errs:
        return errs
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", spec["key"]):
        errs.append(f"{k}: key must be kebab-case ascii")
    if not (1 <= spec["page"] <= page_count):
        errs.append(f"{k}: page {spec['page']} outside 1..{page_count}")
    x0, y0, x1, y1 = spec["box"]
    if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
        errs.append(f"{k}: box out of range {spec['box']}")
    elif (x1 - x0) * (y1 - y0) > 0.6 or (x1 - x0) < 0.03 or (y1 - y0) < 0.02:
        errs.append(f"{k}: implausible box size {spec['box']}")
    cats = spec["categories"]
    bad = [c for c in cats if c not in CATEGORIES]
    if bad:
        errs.append(f"{k}: unknown categories {bad}")
    if cats and cats[0] in MEAL_TAGS:
        errs.append(f"{k}: primary category must not be a meal tag ({cats[0]})")
    if not isinstance(spec["price"], int) or spec["price"] <= 0 or spec["price"] > 500000:
        errs.append(f"{k}: bad price {spec['price']}")
    reg, disc = spec.get("regular"), spec.get("discount")
    if reg is not None and (not isinstance(reg, int) or reg <= spec["price"]):
        errs.append(f"{k}: regular {reg} must be an int above the price {spec['price']}")
    if disc is not None and not (isinstance(disc, int) and 1 <= disc <= 90):
        errs.append(f"{k}: bad discount {disc}")
    if reg and disc:
        calc = round((reg - spec["price"]) / reg * 100)
        if abs(calc - disc) > 3:
            errs.append(f"{k}: printed discount {disc}% far from (regular-price)/regular = {calc}% - check the facts")
    if spec.get("priceUnit", "pack") not in PRICE_UNITS:
        errs.append(f"{k}: bad priceUnit")
    if spec.get("priceKind") is not None and spec["priceKind"] not in PRICE_KINDS:
        errs.append(f"{k}: bad priceKind")
    q = spec.get("qty")
    if q is not None and (len(q) != 2 or q[1] not in QTY_UNITS or not (isinstance(q[0], (int, float)) and q[0] > 0)):
        errs.append(f"{k}: bad qty {q}")
    up = spec.get("unitPrice")
    if up is not None and (up.get("per") not in ("kg", "l") or not isinstance(up.get("cents"), int)):
        errs.append(f"{k}: bad unitPrice {up}")
    v = spec.get("validity")
    if v is not None:
        for f in ("from", "to"):
            if v.get(f) and not re.fullmatch(r"2026-\d\d-\d\d", v[f]):
                errs.append(f"{k}: bad validity.{f}")
        if not v.get("evidence"):
            errs.append(f"{k}: validity override needs printed evidence")
        if v.get("from") and v.get("to") and v["from"] > v["to"]:
            errs.append(f"{k}: validity from > to")
    img = spec["image"]
    if not any(m in img for m in ("xrefs", "crop", "plain")):
        errs.append(f"{k}: image needs xrefs / crop / plain")
    if spec.get("isNew") and "NOVO" not in spec["printed"].upper():
        errs.append(f"{k}: isNew requires a printed NOVO (put it in `printed`)")
    return errs


def norm_text(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace(" ", " ")).strip().upper()


def text_check(page, spec) -> list[str]:
    """The typed facts must be printed inside the box (PDF text layer)."""
    if spec.get("textCheck") is False:
        return []
    blob = norm_text(text_in(page, denorm(spec["box"], page), pad=3))
    flat = blob.replace(" | ", " ")
    miss = []
    def printed(c: int) -> bool:
        # "2 99" (big euros + small cents), "2,99", and whole-euro prints "159,-" / "159,–"
        forms = [f"{c // 100} {c % 100:02d}", fmt(c)]
        if c % 100 == 0:
            forms += [f"{c // 100},-", f"{c // 100},–", f"{c // 100}, -", f"{c // 100} ,-", f"{c // 100},—"]
        return any(f in flat for f in forms)

    p = spec["price"]
    if not printed(p):
        miss.append(f"price {fmt(p)}")
    if spec.get("regular"):
        r = spec["regular"]
        if not printed(r):
            miss.append(f"regular {fmt(r)}")
    if spec.get("discount"):
        if not re.search(rf"(^|[^\d]){spec['discount']} ?%", flat):
            miss.append(f"discount {spec['discount']}%")
    if spec.get("pc") and norm_text(spec["pc"]) not in flat:
        miss.append(spec["pc"])
    if spec.get("anchor") and norm_text(spec["anchor"]) not in flat:
        miss.append(f"anchor »{spec['anchor']}«")
    if not spec.get("anchor"):
        miss.append("anchor (required with textCheck)")
    return [f"{spec['key']}: not in box text: {', '.join(miss)}  || box text: {blob[:300]}"] if miss else []


# ----------------------------------------------------------------------------- images (ported from build_catalog_v2.py)
_smooth: dict[tuple[str, int], float] = {}


def smoothness(doc, cid, xref) -> float:
    key = (cid, xref)
    if key not in _smooth:
        try:
            pix = pymupdf.Pixmap(doc, xref)
            if pix.colorspace and pix.colorspace.n == 4:
                pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
            if pix.alpha:
                pix = pymupdf.Pixmap(pix, 0)
            if pix.n not in (1, 3):
                pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
            a = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n).astype(float).mean(2)
            _smooth[key] = float(np.abs(np.diff(a, axis=1)).mean() + np.abs(np.diff(a, axis=0)).mean()) if a.size > 4 else 0.0
        except Exception:
            _smooth[key] = 0.0
    return _smooth[key]


def dominant(pixels: np.ndarray):
    q = (pixels // 8).reshape(-1, 3)
    vals, inv, counts = np.unique(q, axis=0, return_inverse=True, return_counts=True)
    k = counts.argmax()
    return tuple(int(v) for v in pixels.reshape(-1, 3)[inv.ravel() == k].mean(0)), counts[k] / len(q)


def flood_transparent(img: Image.Image, bgs, tol=24):
    a = np.asarray(img.convert("RGB")).astype(int)
    near = np.zeros(a.shape[:2], bool)
    for bg in bgs:
        near |= np.sqrt(((a - np.array(bg)) ** 2).sum(2)) < tol
    cand = Image.fromarray(np.where(near, 255, 0).astype(np.uint8)).copy()
    w, h = cand.size
    px = cand.load()
    border = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    for xy in border:
        if px[xy] == 255:
            ImageDraw.floodfill(cand, xy, 128)
    bgmask = np.asarray(cand) == 128
    alpha = np.where(bgmask, 0, 255).astype(np.uint8)
    blurred = np.asarray(Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(0.8)))
    al = Image.fromarray(np.minimum(blurred, alpha).astype(np.uint8), "L")
    rgba = img.convert("RGB").copy()
    rgba.putalpha(al)
    return rgba


def trim_resize(img: Image.Image, max_side=400):
    if img.mode == "RGBA":
        bb = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
        if bb:
            img = img.crop(bb)
    img.thumbnail((max_side, max_side), Image.LANCZOS)
    return img


def make_image(cid, spec):
    pdf = CATALOGS[cid]["pdf"]
    n = spec["page"]
    img = spec["image"]
    if "crop" in img or "plain" in img:
        doc = open_doc(cid)
        page = doc[n - 1]
        rect = denorm(img.get("crop") or img.get("plain"), page)
        dpi = min(500, max(150, int(72 * 900 / max(rect.width, rect.height))))
        pix = page.get_pixmap(clip=rect, dpi=dpi, alpha=False)
        im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        if "plain" in img:
            im = flood_transparent(im, [(255, 255, 255)], tol=14)
            return trim_resize(im), (f"Clip render of PDF page {n} of {pdf} at {dpi} dpi (rectangle {img['plain']}); white page background "
                                     f"flood-filled from the edges to transparency.")
        return trim_resize(im), f"Rectangular crop of PDF page {n} of {pdf} at {dpi} dpi (rectangle {img['crop']}), background kept."
    # xrefs: render the packshot images only (other images, text and vector badges in the area removed), bg flood-filled
    doc = open_doc(cid)
    pg = doc[n - 1]
    box = denorm(spec["box"], pg)
    wanted = set(img["xrefs"])
    infos = [i for i in pg.get_image_info(xrefs=True) if i["xref"]]
    shots = [i for i in infos if i["xref"] in wanted]
    if not shots:
        raise SpecError(f"{spec['key']}: image xrefs {sorted(wanted)} not on page {n}")
    clip = pymupdf.Rect()
    for i in shots:
        clip |= pymupdf.Rect(i["bbox"])
    clip = (clip + (-2, -2, 2, 2)) & (box + (-2, -2, 2, 2)) & pg.rect
    if clip.is_empty:
        raise SpecError(f"{spec['key']}: image xrefs lie outside the box")
    for i in infos:
        x = i["xref"]
        if pymupdf.Rect(i["bbox"]).intersects(clip) and x not in wanted:
            try:
                pg.delete_image(x)
            except Exception:
                pass
    pg.add_redact_annot(clip + (-1, -1, 1, 1), fill=False)
    pg.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED,
                        text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    dpi = min(600, max(150, int(72 * 900 / max(clip.width, clip.height))))
    pix = pg.get_pixmap(clip=clip, dpi=dpi, alpha=False)
    im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
    arr = np.asarray(im).astype(int)
    bgs = [(255, 255, 255)]
    sc = dpi / 72
    for i in shots:
        r = pymupdf.Rect(i["bbox"]) & clip
        x0, y0 = int((r.x0 - clip.x0) * sc) + 2, int((r.y0 - clip.y0) * sc) + 2
        x1, y1 = int((r.x1 - clip.x0) * sc) - 3, int((r.y1 - clip.y0) * sc) - 3
        if x1 - x0 < 10 or y1 - y0 < 10:
            continue
        band = np.concatenate([arr[y0:y0 + 3, x0:x1].reshape(-1, 3), arr[y1 - 3:y1, x0:x1].reshape(-1, 3),
                               arr[y0:y1, x0:x0 + 3].reshape(-1, 3), arr[y0:y1, x1 - 3:x1].reshape(-1, 3)])
        col, share = dominant(band)
        if share > 0.25 and min(col) > 150:
            bgs.append(col)
    im = flood_transparent(im, bgs)
    xs = ", ".join(str(i["xref"]) for i in shots)
    return trim_resize(im), (f"Clip render of the packshot on PDF page {n} of {pdf} at {dpi} dpi (embedded image xref {xs}); other images, "
                             f"text and vector badges in the area removed, background flood-filled from the edges to transparency.")


def cached_image(cid, spec):
    key = hashlib.sha1((json.dumps({k: spec[k] for k in ("page", "box", "image")}, sort_keys=True) + cid + IMAGE_CODE_VERSION).encode()).hexdigest()
    cdir = TMP / "imgcache"
    cdir.mkdir(parents=True, exist_ok=True)
    stem = f"{cid}--{spec['key']}"
    meta, fimg = cdir / f"{stem}.json", cdir / f"{stem}.png"
    if meta.exists() and fimg.exists():
        m = json.loads(meta.read_text(encoding="utf-8"))
        if m["key"] == key:
            return Image.open(fimg).convert("RGBA" if m["rgba"] else "RGB"), m["prov"]
    img, prov = make_image(cid, spec)
    img.save(fimg)
    meta.write_text(json.dumps({"key": key, "prov": prov, "rgba": img.mode == "RGBA"}, ensure_ascii=False), encoding="utf-8")
    return img, prov


# ----------------------------------------------------------------------------- records
def expand_aliases(aliases, name, brand):
    out = []
    for a in list(aliases) + [name.lower()] + ([f"{brand.lower()} {name.lower()}"] if brand else []):
        for v in (a.lower().strip(), strip_diacritics(a.lower().strip())):
            if v and v not in out:
                out.append(v)
    return out


def records(cid, spec, img, prov, checked_on, theme):
    c = CATALOGS[cid]
    pid = f"{spec['key']}-{c['suffix']}"
    spplus = bool(spec.get("spPlus", spec.get("priceKind") == "loyalty_price"))
    coupon = bool(spec.get("coupon", spec.get("priceKind") == "coupon_price"))
    kind = spec.get("priceKind") or ("coupon_price" if coupon else "loyalty_price" if spplus else "catalog_price")
    notes = []
    if spplus:
        notes.append("Velja s SPAR plus kartico")
    if spec.get("pc"):
        notes.append(f"natisnjeno tudi »{spec['pc']}«")
    if spec.get("conditionNote"):
        notes.append(spec["conditionNote"])
    availability = [a for a in (c.get("availability"), spec.get("availability")) if a]
    q = spec.get("qty")
    product = {
        "id": pid,
        # same brand + same key + same pack = the same article in another catalog (dedup in search, saved-item mapping)
        "identityKey": spec.get("identityKey") or "--".join([slugify(spec.get("brand") or "x"), spec["key"], slugify(spec["pack"])]),
        "name": spec["name"], "brand": spec.get("brand"), "line": spec.get("line"), "descriptor": spec.get("descriptor"),
        "packSize": spec["pack"], "quantity": {"amount": q[0], "unit": q[1]} if q else None,
        "categories": spec["categories"], "aliases": expand_aliases(spec.get("aliases", []), spec["name"], spec.get("brand")),
        "image": {"src": f"/products/{pid}.webp", "width": img.width, "height": img.height, "provenance": prov},
        "theme": theme, "editorialRank": 0,
        "isNew": bool(spec.get("isNew")), "newSource": "printed_badge" if spec.get("isNew") else None,
    }
    offer = {
        "id": f"offer-{pid}", "productId": pid, "catalogId": cid,
        "priceCents": spec["price"], "priceUnit": spec.get("priceUnit", "pack"), "priceKind": kind,
        "regularPriceCents": spec.get("regular"), "discountPercent": spec.get("discount"),
        "unitPrice": spec.get("unitPrice"),
        "conditions": {"spPlusRequired": spplus, "couponRequired": coupon, "note": "; ".join(notes) or None},
        "validity": validity_for(cid, spec["page"], spec.get("validity")),
        "availability": {"restricted": bool(availability), "note": " ".join(availability) or None},
        "sourceQuote": spec["printed"],
        "verification": {"status": spec.get("verification", "verified"), "checkedOn": checked_on,
                         "method": (f"Visual check of PDF page {spec['page']} of {c['pdf']} (rendered page + zoomed crop of the offer block)"
                                    + (", cross-checked with the PDF text layer" if spec.get("textCheck", True) else ", page has no usable text layer")),
                         "notes": spec.get("notes")},
    }
    bx = spec["box"]
    placement = {"id": f"pl-{pid}-p{spec['page']:02d}", "offerId": offer["id"], "catalogId": cid,
                 "pdfPageIndex": spec["page"] - 1, "pdfPageNumber": spec["page"],
                 "printedPageLabel": PRINTED_LABELS[cid].get(spec["page"]),
                 "bbox": {"x": round(bx[0], 4), "y": round(bx[1], 4), "width": round(bx[2] - bx[0], 4), "height": round(bx[3] - bx[1], 4)}}
    return product, offer, placement


# ----------------------------------------------------------------------------- main
def main():
    cid = sys.argv[1]
    dry = "--dry" in sys.argv
    if cid not in CATALOGS:
        raise SystemExit(f"unknown catalog {cid}")
    # one file per catalog, or several parts (<catalogId>.json, <catalogId>.<part>.json) indexed in parallel
    files = sorted(OFFERS_DIR.glob(f"{cid}.json")) + sorted(OFFERS_DIR.glob(f"{cid}.*.json"))
    if not files:
        raise SystemExit(f"no offer specs for {cid} in {OFFERS_DIR}")
    data = {"catalogId": cid, "checkedOn": None, "pages": {}, "offers": [], "excluded": []}
    for f in files:
        part = json.loads(f.read_text(encoding="utf-8"))
        assert part["catalogId"] == cid, f
        data["checkedOn"] = data["checkedOn"] or part.get("checkedOn")
        dup_pages = set(data["pages"]) & set(part.get("pages", {}))
        assert not dup_pages, f"{f.name}: pages also covered by another part: {sorted(dup_pages)}"
        data["pages"].update(part.get("pages", {}))
        data["offers"] += part.get("offers", [])
        data["excluded"] += part.get("excluded", [])
    only = [a for a in sys.argv[2:] if a.startswith("--pages=")]
    if only:  # validate a page range only (parallel parts): --pages=1-22
        lo, hi = (int(x) for x in only[0].split("=")[1].split("-"))
        data["offers"] = [o for o in data["offers"] if lo <= o.get("page", 0) <= hi]
        data["excluded"] = [e for e in data["excluded"] if lo <= e.get("page", 0) <= hi]
        data["pages"] = {k: v for k, v in data["pages"].items() if lo <= int(k) <= hi}
        dry = "--preview" not in sys.argv  # --preview: packshots, overlays and a sheet for this range, no build json
    doc = open_doc(cid)
    specs = data["offers"]
    errors: list[str] = []
    keys = [s.get("key") for s in specs]
    dup = {k for k in keys if keys.count(k) > 1}
    if dup:
        errors.append(f"duplicate keys: {sorted(dup)}")
    for s in specs:
        errors += check_spec(cid, s, doc.page_count)
    if not errors:
        for s in specs:
            errors += text_check(doc[s["page"] - 1], s)
    rng = range(lo, hi + 1) if only else range(1, doc.page_count + 1)
    missing_pages = [n for n in rng if str(n) not in data.get("pages", {})]
    if missing_pages:
        errors.append(f"pages without a coverage entry: {missing_pages}")
    per_page: dict[int, int] = {}
    for s in specs:
        per_page[s["page"]] = per_page.get(s["page"], 0) + 1
    excl_page: dict[int, int] = {}
    for e in data.get("excluded", []):
        excl_page[e["page"]] = excl_page.get(e["page"], 0) + 1
    for n_str, pg in data.get("pages", {}).items():
        n = int(n_str)
        expect = pg.get("offersOnPage")
        if expect is not None and expect != per_page.get(n, 0) + excl_page.get(n, 0):
            errors.append(f"page {n}: offersOnPage={expect} but indexed {per_page.get(n, 0)} + excluded {excl_page.get(n, 0)}")
    for e in errors:
        print("  !!", e)
    print(f"{cid}: {len(specs)} offers, {len(data.get('excluded', []))} excluded, {len(errors)} problem(s)")
    if dry or errors:
        if errors:
            raise SystemExit(1)
        return
    PRODUCTS_DIR.mkdir(parents=True, exist_ok=True)
    (TMP / "build").mkdir(parents=True, exist_ok=True)
    (TMP / "overlay").mkdir(parents=True, exist_ok=True)
    products, offers, placements, sheet = [], [], [], []
    for s in specs:
        img, prov = cached_image(cid, s)
        p, o, pl = records(cid, s, img, prov, data.get("checkedOn", "2026-10-28"), data["pages"].get(str(s["page"]), {}).get("theme"))
        img.save(PRODUCTS_DIR / f"{p['id']}.webp", "WEBP", quality=84, method=6)
        products.append(p)
        offers.append(o)
        placements.append(pl)
        sheet.append((p["id"], img))
    pages = {int(k): v for k, v in data["pages"].items()}
    out = {"catalogId": cid, "checkedOn": data.get("checkedOn"), "pages": {str(k): pages[k] for k in sorted(pages)},
           "products": products, "offers": offers, "placements": placements, "excluded": data.get("excluded", [])}
    if not only:
        tmp = TMP / "build" / f"{cid}.json.tmp"
        tmp.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp, TMP / "build" / f"{cid}.json")
    # overlays: offer boxes (magenta) + image source rectangles (cyan)
    by_page: dict[int, list] = {}
    for s in specs:
        by_page.setdefault(s["page"], []).append(s)
    for n, ss in by_page.items():
        im = Image.open(ROOT / "public" / "catalog" / cid / "pages" / f"page-{n:02d}.webp").convert("RGB")
        dr = ImageDraw.Draw(im)
        W, H = im.size
        for s in ss:
            x0, y0, x1, y1 = s["box"]
            dr.rectangle([x0 * W, y0 * H, x1 * W, y1 * H], outline=(255, 0, 255), width=5)
            r = s["image"].get("crop") or s["image"].get("plain")
            if r:
                dr.rectangle([r[0] * W, r[1] * H, r[2] * W, r[3] * H], outline=(0, 200, 255), width=3)
            label = f"{s['key']} {fmt(s['price'])}"
            dr.rectangle([x0 * W + 5, y0 * H + 5, x0 * W + 9 + 6 * len(label), y0 * H + 19], fill=(255, 0, 255))
            dr.text((x0 * W + 7, y0 * H + 6), label, fill="white")
        im.save(TMP / "overlay" / f"{cid}-p{n:02d}.png")
    cw, ch, cols = 230, 250, 6
    for start in range(0, len(sheet), 36):
        part = sheet[start:start + 36]
        rows = (len(part) + cols - 1) // cols
        sh = Image.new("RGB", (cols * cw, rows * ch), "white")
        for k, (pid, img) in enumerate(part):
            tile = Image.new("RGB", (cw, ch), (236, 238, 236) if (k // cols) % 2 else (255, 255, 255))
            im = img.convert("RGBA").copy()
            im.thumbnail((cw - 16, ch - 40))
            tile.paste(im, ((cw - im.width) // 2, 28 + (ch - 40 - im.height) // 2), im)
            ImageDraw.Draw(tile).text((4, 4), pid[:36], fill="black")
            sh.paste(tile, ((k % cols) * cw, (k // cols) * ch))
        tag = f"-pages{only[0].split('=')[1]}" if only else ""
        sh.save(TMP / f"sheet-{cid}{tag}-{start // 36 + 1}.png")
    print(f"built {cid}: {len(products)} products -> .tmp/v3/build/{cid}.json; overlays .tmp/v3/overlay/{cid}-pNN.png; sheets .tmp/v3/sheet-{cid}-N.png")


if __name__ == "__main__":
    main()
