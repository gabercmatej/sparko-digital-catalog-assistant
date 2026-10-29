"""Single source of the V3 browse catalogs (the six leaflets on Home, spar.si/letak, 28. 10. 2026).

Run after render_pages_v3.py: python scripts/catalog/leaflets.py
Writes scripts/catalog/v3/leaflets.json (page images, cover, Home order), the input of v3/combine.py. Order here = order on Home (change `homeOrder` to reorder).
Facts were read from the PDFs themselves (cover + printed footnote); `validityEvidence` quotes them.
Products / offers come from the V3.1 indexing (scripts/catalog/v3/README.md).
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]

LEAFLETS = [
    {
        "id": "spar-4426",
        "category": "spar",
        "title": "SPAR katalog 44/26",
        "issueLabel": "44/26",
        "sourceFile": "261028-1-Katalog_4426.pdf",
        "validFrom": "2026-10-28",
        "validTo": "2026-11-03",
        "validityNote": "Izdelki na straneh 22–27 do 10. 11. 2026.",
        "validityEvidence": "p. 9: »Cene izdelkov v katalogu veljajo od srede 28. 10. … najkasneje do torka 3. 11. 2026, cene izdelkov na strani označeni s št. 22–27 pa veljajo do torka 10. 11. 2026«",
    },
    {
        "id": "interspar-1526",
        "category": "interspar",
        "title": "INTERSPAR katalog 15/26",
        "issueLabel": "15/26",
        "sourceFile": "261021-2-Katalog_INTERSPAR_1526.pdf",
        "validFrom": "2026-10-21",
        "validTo": "2026-10-27",
        "validityNote": "Ponudba na straneh 3–7 do 3. 11. 2026.",
        "validityEvidence": "p. 2: »Ponudba izdelkov v katalogu velja od srede 21. 10. … najkasneje do torka, 27. 10. 2026, ponudba na straneh 3-7 pa velja do torka, 3. 11. 2026«",
    },
    {
        "id": "spar-online-4426",
        "category": "spar-online",
        "title": "SPAR Online katalog 44/26",
        "issueLabel": "44/26",
        "sourceFile": "261028-3-SPAR_online_katalog_4426.pdf",
        "validFrom": "2026-10-28",
        "validTo": "2026-11-10",
        "validityNote": "Online akcija, do prodaje akcijskih zalog.",
        "validityEvidence": "p. 1: »Ponudba ONLINE AKCIJA velja od 28. 10. do 10. 11. 2026 oz. do prodaje akcijskih zalog.«",
    },
    {
        "id": "despar-koper-1626",
        "category": "despar",
        "title": "DESPAR Koper katalog 16/26",
        "issueLabel": "16/26",
        "sourceFile": "261021-3-Katalog_DESPAR_plant_KOPER_1626.pdf",
        "validFrom": "2026-10-21",
        "validTo": "2026-11-03",
        "validityNote": "Velja samo v trgovini DESPAR Koper.",
        "validityEvidence": "p. 1: »PONUDBA VELJA SAMO V TRGOVINI DESPAR KOPER OD SREDE 21. 10. DO TORKA 3. 11. 2026.«",
    },
    {
        "id": "mega-spar-0826",
        "category": "spar",
        "title": "MEGA SPAR prihranki 08/26",
        "issueLabel": "08/26",
        "sourceFile": "261028-2-Katalog_MEGA_SPAR_prihranki_0826.pdf",
        "validFrom": "2026-10-28",
        "validTo": "2026-11-10",
        "validityNote": "Velja v tipu trgovin, označenem pri izdelku.",
        "validityEvidence": "p. 1: »OD SREDE 28. 10. DO TORKA 10. 11. 2026«; p. 2: »… najkasneje do torka 10. 11. 2026, razen označenih izdelkov«",
    },
    {
        "id": "spar-4326",
        "category": "spar",
        "title": "SPAR katalog 43/26",
        "issueLabel": "43/26",
        "sourceFile": "261021-1-Katalog_4326.pdf",
        "validFrom": "2026-10-21",
        "validTo": "2026-10-27",
        "validityNote": "Izdelki na straneh 3 in 23 do 3. 11. 2026.",
        "validityEvidence": "p. 2: »Cene izdelkov v katalogu veljajo od srede 21. 10. … najkasneje do torka 27. 10. 2026, cene izdelkov na strani označeni s št. 3 in 23 pa veljajo do torka 3. 11. 2026«",
    },
]


def build():
    out = []
    for order, lf in enumerate(LEAFLETS, start=1):
        cid = lf["id"]
        measured = json.loads((ROOT / ".tmp" / f"pages-{cid}.json").read_text(encoding="utf-8"))
        pages = [
            {
                "pdfPageIndex": p["index"],
                "pdfPageNumber": p["index"] + 1,
                "printedPageLabel": None,
                "image": {"src": f"/catalog/{cid}/pages/page-{p['index'] + 1:02d}.webp", "width": p["width"], "height": p["height"]},
                "thumb": {"src": f"/catalog/{cid}/thumbs/page-{p['index'] + 1:02d}.webp", "width": p["thumbWidth"], "height": p["thumbHeight"]},
                "theme": None,
            }
            for p in measured["pages"]
        ]
        out.append(
            {
                **{k: lf[k] for k in ("id", "category", "title", "issueLabel", "validFrom", "validTo", "validityNote", "validityEvidence", "sourceFile")},
                "homeOrder": order,
                "pdfUrl": f"/catalog/{cid}/katalog.pdf",
                "pageCount": len(pages),
                "cover": {"src": f"/catalog/{cid}/cover.webp", **measured["cover"]},
                "pages": pages,
            }
        )
    target = ROOT / "scripts" / "catalog" / "v3" / "leaflets.json"  # layout manifest, merged into src/data/catalog.json by v3/combine.py
    target.write_text(json.dumps({"version": 1, "leaflets": out}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {target} ({len(out)} leaflets, {sum(x['pageCount'] for x in out)} pages)")


if __name__ == "__main__":
    build()
