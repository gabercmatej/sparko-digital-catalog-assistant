"""Shared facts and helpers of the V3.1 indexing pipeline (six catalogs of 21. / 28. 10. 2026).

Pipeline (see docs/DATA.md, "V3.1"):
  1. inspect_page.py <catalogId> <page>        text lines, price clusters, images and cells of one PDF page (normalized
                                                coordinates) + a grid render for visual checks; --crop for a zoomed crop
  2. scripts/catalog/v3/offers/<catalogId>.json  hand-verified offer specs (one file per catalog, see OFFER_SPEC below)
  3. build_offers.py <catalogId> [--dry]         validates the specs against the PDF (text layer + geometry), renders
                                                packshots, writes .tmp/v3/build/<catalogId>.json, overlays and a sheet
  4. combine.py                                  merges the six partial builds into src/data/catalog.json (version 3)

Validity is decided per OFFER: offer override (printed on the offer) > page rule below > general catalog validity.
IMPORTANT: the printed footnotes name PRINTED page numbers (»strani označene s št. 22–27«), which differ from PDF page
numbers. PAGE_RULES below are keyed by PDF page number and were mapped through the printed page labels
(PRINTED_LABELS, read from the page corners of the text layer) - each rule quotes its evidence.
"""
from __future__ import annotations

import pathlib
import re
import unicodedata

import pymupdf

ROOT = pathlib.Path(__file__).resolve().parents[3]
TMP = ROOT / ".tmp" / "v3"
OFFERS_DIR = pathlib.Path(__file__).resolve().parent / "offers"
PRODUCTS_DIR = ROOT / "public" / "products"

# id -> facts. `suffix` is appended to product ids (stable, carries the catalog context).
CATALOGS: dict[str, dict] = {
    "spar-4426": {"pdf": "261028-1-Katalog_4426.pdf", "category": "spar", "suffix": "4426",
                  "from": "2026-10-28", "to": "2026-11-03",
                  "evidence": "naslovnica: »44/26 PONUDBA KATALOGA VELJA OD SREDE 28.10.2026«; opomba v katalogu: »Cene izdelkov v katalogu veljajo od srede 28. 10. … najkasneje do torka 3. 11. 2026, cene izdelkov na strani označeni s št. 22–27 pa veljajo do torka 10. 11. 2026«"},
    "interspar-1526": {"pdf": "261021-2-Katalog_INTERSPAR_1526.pdf", "category": "interspar", "suffix": "1526",
                       "from": "2026-10-21", "to": "2026-10-27",
                       "evidence": "str. 2: »Ponudba izdelkov v katalogu velja od srede 21. 10. … najkasneje do torka, 27. 10. 2026, ponudba na straneh 3-7 pa velja do torka, 3. 11. 2026«"},
    "spar-online-4426": {"pdf": "261028-3-SPAR_online_katalog_4426.pdf", "category": "spar-online", "suffix": "online4426",
                         "from": "2026-10-28", "to": "2026-11-10",
                         "evidence": "str. 1: »Ponudba ONLINE AKCIJA velja od 28. 10. do 10. 11. 2026 oz. do prodaje akcijskih zalog.«",
                         "availability": "Samo v spletni trgovini SPAR Online."},
    "despar-koper-1626": {"pdf": "261021-3-Katalog_DESPAR_plant_KOPER_1626.pdf", "category": "despar", "suffix": "despar1626",
                          "from": "2026-10-21", "to": "2026-11-03",
                          "evidence": "str. 1: »PONUDBA VELJA SAMO V TRGOVINI DESPAR KOPER OD SREDE 21. 10. DO TORKA 3. 11. 2026.«",
                          "availability": "Samo v trgovini DESPAR Koper."},
    "mega-spar-0826": {"pdf": "261028-2-Katalog_MEGA_SPAR_prihranki_0826.pdf", "category": "spar", "suffix": "mega0826",
                       "from": "2026-10-28", "to": "2026-11-10",
                       "evidence": "str. 1: »OD SREDE 28. 10. DO TORKA 10. 11. 2026«; »PONUDBA IZDELKOV IZ KATALOGA VELJA V TIPU TRGOVIN, OZNAČENEM PRI POSAMIČNEM IZDELKU.«"},
    "spar-4326": {"pdf": "261021-1-Katalog_4326.pdf", "category": "spar", "suffix": "4326",
                  "from": "2026-10-21", "to": "2026-10-27",
                  "evidence": "naslovnica: »43/26 PONUDBA KATALOGA VELJA OD SREDE 21.10.2026«; str. 2: »Cene izdelkov v katalogu veljajo od srede 21. 10. … najkasneje do torka 27. 10. 2026, cene izdelkov na strani označeni s št. 3 in 23 pa veljajo do torka 3. 11. 2026«"},
}

# PDF page number -> printed page label (corner numbers of the text layer; pages without a printed number are absent).
PRINTED_LABELS: dict[str, dict[int, str]] = {
    "spar-4426": {1: "1", 2: "2", 3: "3", 8: "5", 9: "6", 10: "7", 16: "8", 18: "9", 20: "10", 21: "11", 22: "12", 24: "13", 25: "14",
                  26: "15", 27: "16", 28: "17", 31: "19", 32: "20", 33: "21", 34: "22", 35: "23", 36: "24", 37: "25", 38: "26",
                  39: "27", 44: "28"},
    "interspar-1526": {2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7"},
    "spar-online-4426": {},
    "despar-koper-1626": {2: "2", 3: "3"},
    "mega-spar-0826": {2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7"},
    "spar-4326": {2: "2", 3: "3", 4: "4", 8: "6", 14: "8", 15: "9", 16: "10", 20: "11", 22: "12", 23: "13", 24: "14", 25: "15",
                  26: "16", 30: "17", 31: "18", 32: "19", 33: "20", 34: "21", 35: "22", 36: "23"},
}

# Page-level exceptions to the general validity, keyed by PDF page number (printed label in the evidence).
PAGE_RULES: dict[str, dict[int, dict]] = {
    "spar-4426": {
        n: {"from": "2026-10-28", "to": "2026-11-10",
            "evidence": f"PDF str. {n} = natisnjena str. {PRINTED_LABELS['spar-4426'][n]}; opomba: »cene izdelkov na strani označeni s št. 22–27 pa veljajo do torka 10. 11. 2026«"}
        for n in range(34, 40)
    },
    "interspar-1526": {
        n: {"from": "2026-10-21", "to": "2026-11-03",
            "evidence": f"PDF str. {n} = natisnjena str. {n}; str. 2: »ponudba na straneh 3-7 pa velja do torka, 3. 11. 2026«"}
        for n in range(3, 8)
    },
    "spar-4326": {
        n: {"from": "2026-10-21", "to": "2026-11-03",
            "evidence": f"PDF str. {n} = natisnjena str. {PRINTED_LABELS['spar-4326'][n]}; str. 2: »cene izdelkov na strani označeni s št. 3 in 23 pa veljajo do torka 3. 11. 2026«; glava strani: »DO TORKA 3. 11.«"}
        for n in (3, 36)
    },
}

# Category vocabulary (first = primary). Keep in sync with CATEGORY_LABELS in src/lib/recommendations.ts.
CATEGORIES = {
    # food
    "mlecni-izdelki", "sir", "jogurti", "meso", "perutnina", "mesni-izdelki", "ribe", "sadje", "zelenjava", "pekovsko", "kruh",
    "osnovna-zivila", "testenine", "omake", "zacimbe", "namazi", "zita", "sladko", "sladkarije", "slascice", "prigrizki", "grickalke",
    "zamrznjeno", "pijace", "sokovi", "voda", "kava", "caj", "alkoholne-pijace", "pivo", "vino", "otroska-hrana",
    # meal tags (secondary only)
    "zajtrk", "kosilo", "vecerja", "malica", "prilogi",
    # non-food
    "nega", "higiena", "cistila", "gospodinjstvo", "kuhinja", "dom", "tekstil", "otroci", "hisni-ljubljencki", "vrt", "drugo",
}
MEAL_TAGS = {"zajtrk", "kosilo", "vecerja", "malica", "prilogi"}

PRICE_UNITS = {"pack", "kg", "100g", "kos"}
PRICE_KINDS = {"catalog_price", "loyalty_price", "coupon_price"}
QTY_UNITS = {"g", "kg", "ml", "l", "kos"}


def open_doc(cid: str) -> pymupdf.Document:
    return pymupdf.open(ROOT / CATALOGS[cid]["pdf"])


def strip_diacritics(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def slugify(s: str) -> str:
    s = strip_diacritics(s.lower())
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def fmt(c: int) -> str:
    return f"{c // 100},{c % 100:02d}"


def page_lines(page: pymupdf.Page):
    """[(Rect, text, max_font_size)] for every text line of the page."""
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            spans = [s for s in l["spans"] if s["text"].strip()]
            t = " ".join(s["text"].strip() for s in spans).strip()
            if t:
                out.append((pymupdf.Rect(l["bbox"]), t, max(s["size"] for s in spans)))
    return out


def norm_rect(r: pymupdf.Rect, page: pymupdf.Page) -> tuple[float, float, float, float]:
    W, H = page.rect.width, page.rect.height
    return (round(r.x0 / W, 4), round(r.y0 / H, 4), round(r.x1 / W, 4), round(r.y1 / H, 4))


def denorm(box, page: pymupdf.Page) -> pymupdf.Rect:
    W, H = page.rect.width, page.rect.height
    x0, y0, x1, y1 = box
    return pymupdf.Rect(x0 * W, y0 * H, x1 * W, y1 * H)


def centre(r: pymupdf.Rect) -> pymupdf.Point:
    return pymupdf.Point((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)


def text_in(page: pymupdf.Page, rect: pymupdf.Rect, pad: float = 2.0) -> str:
    """All text lines whose centre lies inside rect (grown by pad points), joined; spaces collapsed."""
    grown = pymupdf.Rect(rect) + (-pad, -pad, pad, pad)
    return " | ".join(t for r, t, _ in page_lines(page) if grown.contains(centre(r)))


def validity_for(cid: str, page: int, override: dict | None = None) -> dict:
    """Offer validity: override (printed on the offer) > page rule > general catalog validity."""
    c = CATALOGS[cid]
    if override and (override.get("from") or override.get("to")):
        return {"status": "explicit", "from": override.get("from") or c["from"], "to": override.get("to") or c["to"],
                "evidence": override["evidence"]}
    rule = PAGE_RULES.get(cid, {}).get(page)
    if rule:
        return {"status": "explicit", "from": rule["from"], "to": rule["to"], "evidence": rule["evidence"]}
    return {"status": "catalog_default", "from": c["from"], "to": c["to"],
            "evidence": f"Splošna veljavnost kataloga – {c['evidence']}"}
