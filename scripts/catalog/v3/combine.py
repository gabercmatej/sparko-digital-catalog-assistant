"""Merge the six partial catalog builds (.tmp/v3/build/<catalogId>.json, see build_offers.py) into the app data (V3.1).

  python scripts/catalog/v3/combine.py            (after build_offers.py <catalogId> for every catalog)

Writes (atomically):
  src/data/catalog.json          version 3, what the app imports: the six catalogs (Home order, page rules, printed
                                 page labels, themes), products, offers, placements and recipes. Lean: long audit texts
                                 are not shipped to the browser.
  src/data/catalog-sources.json  the audit trail per record: packshot provenance, the printed source quote, validity
                                 evidence, verification method / notes, excluded offers and per-page coverage
                                 (read by scripts/validate-data.ts and the tests, never by the app).
  docs/INDEXING-REPORT.md        coverage report per catalog / page.
The earlier product-data catalogs (SPAR 41/26, INTERSPAR 14/26) live in src/data/historical.json and are never current.
"""
from __future__ import annotations

import json
import os
import sys
from collections import Counter, defaultdict

from common import CATALOGS, PAGE_RULES, PRINTED_LABELS, ROOT, TMP

sys.stdout.reconfigure(encoding="utf-8")
LEAFLETS = ROOT / "scripts" / "catalog" / "v3" / "leaflets.json"
RECIPES = ROOT / "scripts" / "catalog" / "v3" / "recipes.json"
REFERENCE_DATE = "2026-10-28"  # "as of" date of the coverage report


def write_atomic(path, data, indent=None):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=indent, separators=None if indent else (",", ":")) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def page_rule_groups(cid):
    """Consecutive PDF pages with the same rule -> [{pdfPages, printedLabels, from, to}]"""
    rules = PAGE_RULES.get(cid, {})
    out = []
    for n in sorted(rules):
        r = rules[n]
        if out and out[-1]["from"] == r["from"] and out[-1]["to"] == r["to"]:
            out[-1]["pdfPages"].append(n)
        else:
            out.append({"pdfPages": [n], "from": r["from"], "to": r["to"]})
    for g in out:
        g["printedLabels"] = [PRINTED_LABELS[cid].get(n) for n in g["pdfPages"]]
    return out


def main():
    leaflets = {l["id"]: l for l in json.loads(LEAFLETS.read_text(encoding="utf-8"))["leaflets"]}
    builds = {}
    for cid in CATALOGS:
        f = TMP / "build" / f"{cid}.json"
        if not f.exists():
            if "--allow-missing" not in sys.argv:  # development only: catalogs without a build get no offers
                raise SystemExit(f"missing build for {cid}: run build_offers.py {cid}")
            print(f"  !! {cid}: no build, combined without offers (--allow-missing)")
            builds[cid] = {"pages": {}, "products": [], "offers": [], "placements": [], "excluded": []}
            continue
        builds[cid] = json.loads(f.read_text(encoding="utf-8"))
    order = sorted(CATALOGS, key=lambda c: leaflets[c]["homeOrder"])

    catalogs, products, offers, placements = [], [], [], []
    sources = {"products": {}, "offers": {}, "excluded": {}, "pages": {}}
    for cid in order:
        lf, b = leaflets[cid], builds[cid]
        pages = []
        for p in lf["pages"]:
            n = p["pdfPageNumber"]
            pages.append({**p, "printedPageLabel": PRINTED_LABELS[cid].get(n), "theme": (b["pages"].get(str(n)) or {}).get("theme")})
        c = CATALOGS[cid]
        catalogs.append({
            "id": cid, "retailer": c["category"], "title": lf["title"], "issueLabel": lf["issueLabel"],
            "publishedDate": lf["validFrom"], "validFrom": lf["validFrom"], "validTo": lf["validTo"],
            "validityNote": lf["validityNote"], "pageRules": page_rule_groups(cid),
            "availability": c.get("availability"), "homeOrder": lf["homeOrder"],
            "sourceFile": lf["sourceFile"], "pdfUrl": lf["pdfUrl"], "pageCount": lf["pageCount"], "cover": lf["cover"], "pages": pages,
        })
        sources["excluded"][cid] = b["excluded"]
        sources["pages"][cid] = b["pages"]
        # editorial order: Home order, then page, then reading order of the block (top-left first)
        pl_by_offer = {pl["offerId"]: pl for pl in b["placements"]}
        for p, o in zip(b["products"], b["offers"]):
            assert o["productId"] == p["id"]
            pl = pl_by_offer[o["id"]]
            sources["products"][p["id"]] = {"imageProvenance": p["image"]["provenance"]}
            sources["offers"][o["id"]] = {"sourceQuote": o["sourceQuote"], "validityEvidence": o["validity"]["evidence"],
                                          "verificationMethod": o["verification"]["method"], "verificationNotes": o["verification"]["notes"]}
            img = {k: p["image"][k] for k in ("src", "width", "height")}
            products.append({**p, "image": img, "_sort": (lf["homeOrder"], pl["pdfPageIndex"], round(pl["bbox"]["y"], 2), pl["bbox"]["x"])})
            offers.append({**{k: v for k, v in o.items() if k not in ("sourceQuote",)},
                           "validity": {k: o["validity"][k] for k in ("status", "from", "to")},
                           "verification": {"status": o["verification"]["status"], "checkedOn": o["verification"]["checkedOn"]}})
        placements += b["placements"]
    products.sort(key=lambda p: p["_sort"])
    for rank, p in enumerate(products, start=1):
        p["editorialRank"] = rank
        del p["_sort"]
    ids = [p["id"] for p in products]
    assert len(ids) == len(set(ids)), "duplicate product ids"

    recipes = []
    if RECIPES.exists():
        offer_ids = {o["id"] for o in offers}
        for r in json.loads(RECIPES.read_text(encoding="utf-8")):
            missing = [i["offerId"] for i in r["ingredients"] if i["offerId"] not in offer_ids]
            if missing:
                print(f"  !! recipe {r['id']} dropped: unknown offers {missing}")
                continue
            recipes.append(r)

    data = {"version": 3, "catalogs": catalogs, "products": products, "offers": offers, "placements": placements, "recipes": recipes}
    write_atomic(ROOT / "src" / "data" / "catalog.json", data)
    write_atomic(ROOT / "src" / "data" / "catalog-sources.json", sources, indent=1)
    report(catalogs, products, offers, placements, sources)
    import future_promos  # DEMO MOCK next-week promos on the new data (never written into catalog.json)
    future_promos.main()
    size = (ROOT / "src" / "data" / "catalog.json").stat().st_size
    print(f"catalog.json: {len(catalogs)} catalogs, {len(products)} products, {len(offers)} offers, {len(placements)} placements, "
          f"{len(recipes)} recipes, {size / 1024:.0f} KB")


def is_current(o, day=REFERENCE_DATE):
    return o["validity"]["from"] <= day <= o["validity"]["to"]


def report(catalogs, products, offers, placements, sources):
    by_cat = defaultdict(list)
    for o in offers:
        by_cat[o["catalogId"]].append(o)
    pl_by_offer = {pl["offerId"]: pl for pl in placements}
    prod = {p["id"]: p for p in products}
    lines = ["# SPARko V3.1 — indexing report", "",
             f"Generated by `scripts/catalog/v3/combine.py`. »Current« = valid on {REFERENCE_DATE} (Europe/Ljubljana) by the offer's own dates.",
             "Every offer was checked visually on the rendered page and cross-checked against the PDF text layer (price, regular price, "
             "printed percentage, PC and the name anchor must be printed inside the offer box) unless noted.", "",
             "| Catalog | Pages | Printed offers | Indexed (verified) | Excluded | Packshots | Highlight boxes | Validity exceptions | Current on 28. 10. |",
             "|---|---|---|---|---|---|---|---|---|"]
    tot = Counter()
    for c in catalogs:
        cid = c["id"]
        os_ = by_cat[cid]
        pages = sources["pages"][cid]
        printed = sum((pg.get("offersOnPage") or 0) for pg in pages.values())
        excl = len(sources["excluded"][cid])
        exc = sum(1 for o in os_ if o["validity"]["status"] == "explicit")
        cur = sum(1 for o in os_ if is_current(o))
        ver = sum(1 for o in os_ if o["verification"]["status"] == "verified")
        boxes = sum(1 for o in os_ if o["id"] in pl_by_offer)
        imgs = sum(1 for o in os_ if prod[o["productId"]]["image"]["src"])
        lines.append(f"| {c['title']} (`{cid}`) | {c['pageCount']} | {printed} | {len(os_)} ({ver}) | {excl} | {imgs} | {boxes} | {exc} | {cur} |")
        tot.update(pages=c["pageCount"], printed=printed, offers=len(os_), verified=ver, excl=excl, imgs=imgs, boxes=boxes, exc=exc, cur=cur)
    lines.append(f"| **Total** | {tot['pages']} | {tot['printed']} | {tot['offers']} ({tot['verified']}) | {tot['excl']} | {tot['imgs']} | {tot['boxes']} | {tot['exc']} | {tot['cur']} |")
    lines += ["", "## Validity rules", ""]
    for c in catalogs:
        rules = "; ".join(f"PDF str. {', '.join(map(str, g['pdfPages']))} (natisnjene {', '.join(x or '–' for x in g['printedLabels'])}): {g['from']} – {g['to']}" for g in c["pageRules"]) or "brez izjem po straneh"
        overrides = Counter((o["validity"]["from"], o["validity"]["to"]) for o in by_cat[c["id"]]
                            if o["validity"]["status"] == "explicit" and not any(pl_by_offer[o["id"]]["pdfPageNumber"] in g["pdfPages"] for g in c["pageRules"]))
        ov = "; ".join(f"{n}× {f} – {t}" for (f, t), n in overrides.items()) or "–"
        lines.append(f"- **{c['title']}**: splošno {c['validFrom']} – {c['validTo']}; izjeme po straneh: {rules}; posebni roki na ponudbah: {ov}."
                     + (f" Omejitev: {c['availability']}" if c.get("availability") else ""))
    lines += ["", "## Coverage per page", ""]
    for c in catalogs:
        cid = c["id"]
        cnt = Counter(pl_by_offer[o["id"]]["pdfPageNumber"] for o in by_cat[cid])
        ex = Counter(e["page"] for e in sources["excluded"][cid])
        cells = []
        for n in range(1, c["pageCount"] + 1):
            pg = sources["pages"][cid].get(str(n), {})
            cells.append(f"{n}: {cnt.get(n, 0)}/{pg.get('offersOnPage', '?')}" + (f" (−{ex[n]})" if ex.get(n) else ""))
        lines.append(f"- **{c['title']}** (indeksirano/natisnjeno, izločeno): " + " · ".join(cells))
    lines += ["", "## Excluded offers", ""]
    for c in catalogs:
        for e in sources["excluded"][c["id"]]:
            lines.append(f"- {c['title']}, PDF str. {e['page']}: {e.get('text', '')} — {e.get('reason', '')}")
    (ROOT / "docs" / "INDEXING-REPORT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
