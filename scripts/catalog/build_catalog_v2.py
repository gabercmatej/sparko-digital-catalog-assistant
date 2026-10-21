"""Build src/data/catalog.json (version 2: SPAR 41/26 + INTERSPAR 14/26), packshots and debug overlays.

Product facts below (name, pack, price, regular price, discount, validity) were entered BY HAND after
visually checking every offer block on pages rendered at 1400 px / 200 dpi crops, and then cross-checked
against the PDF text layer (the script asserts that price / regular price / discount / PC strings are
printed inside the block, see verify_text). The script only derives geometry (placement boxes), packshot
images and page metadata. Nothing is inferred: whatever is not printed is null.

Run (after render_pages_v2.py):  python scripts/catalog/build_catalog_v2.py
Outputs:
  src/data/catalog.json                (written atomically, version 2)
  public/products/<productId>.webp     (packshots, max 400 px long side)
  .tmp/overlay-<catalog>-pXX.png       (placement boxes drawn on page images, for review)
  .tmp/products-sheet.png              (all packshots on white + grey, for review)

`isNew` / `newSource`: "printed_badge" = the block carries a printed NOVO badge (found in the PDF text layer:
2 occurrences in SPAR 41/26, 0 in INTERSPAR 14/26). "demo_editorial" = EXPLICIT DEMO MOCK picked by the
authors (plausibly seasonal / novel items); it is NOT printed in the leaflet.
"""
from __future__ import annotations

import io
import json
import os
import pathlib
import unicodedata

import numpy as np
import pymupdf
from PIL import Image, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[2]
CATALOG_JSON = ROOT / "src" / "data" / "catalog.json"
PRODUCTS_DIR = ROOT / "public" / "products"
TMP = ROOT / ".tmp"
CHECKED_ON = "2026-10-20"
DRY = bool(os.environ.get("SPARKO_DRY"))

CATALOGS = {
    "spar-4126": {
        "retailer": "spar", "pdf": "261007-1-Katalog_4126.pdf", "title": "SPAR katalog 41/26", "issue": "41/26", "suffix": "4126",
    },
    "interspar-1426": {
        "retailer": "interspar", "pdf": "261007-2-Katalog_INTERSPAR_1426.pdf", "title": "INTERSPAR katalog 14/26", "issue": "14/26", "suffix": "1426",
    },
}
DOCS = {cid: pymupdf.open(ROOT / c["pdf"]) for cid, c in CATALOGS.items()}

# ----------------------------------------------------------------------------- pages
PRINTED_LABELS = {
    "spar-4126": {4: "2", 5: "3", 6: "4", 7: "5", 8: "6", 10: "7", 14: "8", 15: "9", 18: "10", 19: "11", 20: "12",
                  23: "15", 24: "16", 25: "17", 26: "18", 27: "19", 28: "20", 29: "21", 30: "22", 31: "23"},
    "interspar-1426": {2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7"},
}
THEMES = {
    "spar-4126": {
        1: "Naslovnica", 2: "Recept", 3: "Recept", 4: "Sveža izbira", 5: "Ribarnica", 6: "Za meso in mesnine", 7: "Za meso in mesnine",
        8: "Kras", 9: "Brez glutena", 10: "Sveže iz pekarne", 11: "Za dober kruh", 12: "Za vitalno življenje", 13: "Zdravo",
        14: "Za poln hladilnik dobrot", 15: "Zamrznjeno", 16: "Mlečno", 17: "Športniki", 18: "Za dobro založeno shrambo",
        19: "Shramba", 20: "Izdelek meseca", 21: "Točke zvestobe", 22: "Sladki trenutki", 23: "Pijača", 24: "Pivo in prigrizki",
        25: "Izbrana ponudba", 26: "Nega in razvajanje", 27: "Čisto in urejeno", 28: "Branje in ustvarjanje", 29: "Adventni koledarji",
        30: "Za udobje", 31: "Za udobje", 32: "Udobje doma", 33: "Izdelki z oznako", 34: "SPAR online", 35: "SPAR online", 36: "Kuponi",
    },
    "interspar-1426": {
        1: "Naslovnica", 2: "Naj zadiši po domači peki", 3: "Naj zadiši po domači peki", 4: "Kuhinjski pomočniki",
        5: "Kuhinjski pomočniki", 6: "Najljubši pomočniki", 7: "Kuhinjski tekstil", 8: "Sveže pečeno",
    },
}

# ----------------------------------------------------------------------------- validity
COVER_S = "naslovnica (str. 1): »41/26 PONUDBA KATALOGA VELJA OD SREDE 7.10.2026«"
FOOT_S = "opomba na str. 4: »Cene izdelkov v katalogu veljajo od srede 7. 10. do razprodaje akcijskih zalog oz. najkasneje do torka 13. 10. 2026«"
COVER_I = "naslovnica (str. 1): »14/26 PONUDBA KATALOGA VELJA OD SREDE 7. 10. 2026«"
FOOT_I = ("opomba na str. 2: »Ponudba izdelkov v katalogu velja od srede 7. 10. do razprodaje akcijskih zalog oz. najkasneje do torka, "
          "13. 10. 2026, ponudba na straneh 4 - 7 pa velja do torka, 20. 10. 2026«")
D_FROM, D_TO = "2026-10-07", "2026-10-13"

# pdf page whose header carries »DO TORKA 13. 10.« for each food page (printed two-page spreads share one header);
# pages marked None have no header/date of their own -> catalog_default from the footnote
SPAR_HEADER = {4: 4, 5: 5, 6: 7, 7: 7, 8: 10, 9: 9, 10: 10, 11: 11, 13: 13, 14: 15, 15: 15, 16: 16, 17: 17, 18: 19, 19: 19,
               22: 22, 23: 23, 24: 24}
INTERSPAR_HEADER = {2: 3, 3: 3, 8: 8}


def validity(cid: str, page: int) -> dict:
    if cid == "spar-4126":
        if page == 20:
            return {"status": "explicit", "from": D_FROM, "to": D_TO,
                    "evidence": f"str. 20: »PONUDBA VELJA OD 7. 10. 2026 DO 13. 10. 2026«; začetek: {COVER_S}"}
        if page == 21:
            return {"status": "explicit", "from": D_FROM, "to": D_TO,
                    "evidence": f"str. 21: »OD SREDE 7. 10. DO TORKA 13. 10. VAM NAKUP KATEREGAKOLI SPODNJEGA IZDELKA PRINAŠA DODATNE TOČKE ZVESTOBE«"}
        hp = SPAR_HEADER.get(page)
        if hp is None:
            return {"status": "catalog_default", "from": D_FROM, "to": D_TO,
                    "evidence": f"Na strani ni posebnega roka; splošna veljavnost kataloga – {COVER_S}; {FOOT_S}."}
        where = f"glava strani {page}" if hp == page else f"skupna glava razpona strani {min(page, hp)}–{max(page, hp)} (na str. {hp})"
        return {"status": "explicit", "from": D_FROM, "to": D_TO, "evidence": f"{where}: »DO TORKA 13. 10.«; začetek: {COVER_S}"}
    hp = INTERSPAR_HEADER.get(page)
    if hp is None:
        return {"status": "catalog_default", "from": D_FROM, "to": D_TO,
                "evidence": f"Na strani ni posebnega roka za živila; splošna veljavnost kataloga – {COVER_I}; {FOOT_I}."}
    if hp == 8:
        ev = "str. 8: »SVEŽE PEČENO DO TORKA 13. 10.«"
    else:
        where = f"glava strani {page}" if hp == page else f"skupna glava razpona strani {min(page, hp)}–{max(page, hp)} (na str. {hp})"
        ev = f"{where}: »DO TORKA 13. 10.«"
    return {"status": "explicit", "from": D_FROM, "to": D_TO, "evidence": f"{ev}; začetek: {COVER_I}"}


# ----------------------------------------------------------------------------- products
# img: ("render", extra_hidden_xrefs) -> render packshot area with shadow layers removed, flood-fill bg
#      ("embedded", xref)            -> embedded image with its soft mask (alpha) / flat bg flood-filled
#      ("cropn", (x0,y0,x1,y1))      -> rectangular crop in NORMALIZED page coords (photo background kept)
# anchor: text found in the product name line -> enclosing drawn cell gives the placement box
# box: manual normalized box (x0, y0, x1, y1) when the block has no drawn cell
P: list[dict] = []


def prod(**kw):
    kw.setdefault("cat", "spar-4126")
    P.append(kw)


def q(pid, page, name, brand, pack, qty, cats, price, regular=None, disc=None, *, anchor=None, box=None, printed=None, pc=None,
      descriptor=None, line=None, unit=None, aliases=(), cat="spar-4126", img=("render", []), **kw):
    """Compact prod() for the FIX 7 additions (scripts/catalog/extra_products_*.py): same facts, printed text rebuilt unless given."""
    spec = dict(id=pid, page=page, name=name, brand=brand, line=line, descriptor=descriptor, pack=pack, qty=qty, cats=cats,
                aliases=list(aliases), printed=printed or f"{name.upper()}{(' ' + descriptor) if descriptor else ''}, {pack}",
                price=price, img=img, cat=cat, **kw)
    if anchor:
        spec["anchor"] = anchor
    if box:
        spec["box"] = box
    if regular:
        spec["regular"], spec["disc"] = regular, disc
    if pc:
        spec["pc"] = pc
    if unit:
        spec["unit"] = unit
    prod(**spec)


S_NOTE = "S-BUDGET diskontna cena; odstotek popusta ni natisnjen."
NATUR = "SPAR Natur*pur"

# ============================================================ SPAR 41/26 – cover (p. 1)
prod(id="nutella-1kg", page=1, anchor="NUTELLA", name="Nutella", brand="Ferrero", line=None, descriptor="lešnikov namaz s kakavom",
     pack="1 kg", qty=(1, "kg"), cats=["sladko", "namazi", "zajtrk"],
     aliases=["nutella", "nutelo", "nutelle", "lešnikov namaz", "čokoladni namaz", "namaz", "ferrero", "ferrero nutella"],
     printed="NUTELLA Ferrero, 1 kg", price=719, regular=959, disc=25, pc="PC 9,59", img=("render", []))
prod(id="belo-grozdje-1kg", page=1, anchor="BELO GROZDJE", name="Belo grozdje", brand=None, line=None, descriptor=None,
     pack="1 kg", qty=(1, "kg"), unit="kg", cats=["sadje", "zajtrk"],
     aliases=["grozdje", "grozdja", "grozdjem", "belo grozdje", "belega grozdja", "namizno grozdje"],
     printed="BELO GROZDJE 1 kg", price=169, regular=249, disc=32, vextra="Cena velja za 1 kg (tehtano sadje).", img=("plain", []))
prod(id="sitarjev-hlebec-750g", page=1, anchor="SITARJEV HLEBEC", name="Sitarjev hlebec", brand=None, line=None, descriptor=None,
     pack="750 g", qty=(750, "g"), unit="kg", cats=["pekovsko", "kruh", "zajtrk"],
     aliases=["hlebec", "hlebca", "kruh", "kruha", "kruhom", "sitarjev hlebec", "sitarjev kruh", "pekovsko", "semenski kruh"],
     printed="SITARJEV HLEBEC 750 g; cena na kg", price=289, regular=358, disc=19,
     vextra="Natisnjeno »750 g; cena na kg«: cena 2,89 € (redna 3,58 €) velja za 1 kg, hlebec je 750 g.", img=("embedded", 8513))

# ============================================================ SPAR – meso (p. 6, 7, 15)
prod(id="piscancje-meso-po-italijansko-800g", page=6, anchor="PIŠČANČJE MESO IK", name="Piščančje meso IK PPR po italijansko",
     brand="Perutnina Ptuj", line="Natur Premium", descriptor="PPR, pakirano", pack="800 g", qty=(800, "g"), cats=["meso", "vecerja"],
     aliases=["perutnina ptuj", "perutnina", "perutnine ptuj", "ptuj", "ptujska perutnina", "piščanec", "piščanca", "piščancu", "piščanci",
              "piščančje", "piščančje meso", "piščančjega mesa", "piščanec po italijansko", "po italijansko", "natur premium", "ppr", "perutnina ptuj piščanec"],
     printed="PIŠČANČJE MESO IK PPR, po italijansko, Natur Premium, pakirano, Perutnina Ptuj, 800 g",
     price=519, regular=699, disc=25, img=("render", []))
prod(id="stajerski-piscanec-1kg", page=6, anchor="ŠTAJERSKI", name="Štajerski piščanec IK",
     brand="Perutnina Ptuj", line="Natur Premium", descriptor="pakirano", pack="1 kg", qty=(1, "kg"), cats=["meso", "vecerja"],
     aliases=["perutnina ptuj", "perutnina", "perutnine ptuj", "ptuj", "ptujska perutnina", "piščanec", "piščanca", "piščancu", "piščanci",
              "štajerski piščanec", "štajerskega piščanca", "cel piščanec", "piščančje", "piščančje meso", "natur premium", "perutnina ptuj piščanec"],
     printed="ŠTAJERSKI PIŠČANEC IK Natur Premium, pakirano, Perutnina Ptuj, 1 kg",
     price=539, regular=719, disc=25, img=("render", []))
prod(id="piscancji-medaljoni-ptuj-750g", page=15, anchor="MEDALJONI", name="Piščančji medaljoni",
     brand="Perutnina Ptuj", line=None, descriptor="zamrznjeno", pack="750 g", qty=(750, "g"), cats=["meso", "zamrznjeno", "vecerja"],
     aliases=["perutnina ptuj", "perutnina", "perutnine ptuj", "ptuj", "ptujska perutnina", "piščančji medaljoni", "medaljoni", "medaljone",
              "piščanec", "piščančje", "piščančje meso", "chicken nuggets", "nuggets", "zamrznjen piščanec", "perutnina ptuj medaljoni"],
     printed="PIŠČANČJI MEDALJONI Perutnina Ptuj, 750 g", price=699, regular=1119, disc=37, pc="PC 6,69",
     vextra="Zamrznjen izdelek (oznaka snežinke); na embalaži piše »Chicken nuggets«.", img=("render", []))
prod(id="piscancji-file-pivka-540g", page=6, anchor="PIŠČANČJI FILE IK", name="Piščančji file IK zrezki",
     brand="Pivka", line=None, descriptor="XXL, pakirano", pack="540 g", qty=(540, "g"), cats=["meso", "vecerja"],
     aliases=["piščančji file", "piščančjega fileja", "file", "fileji", "piščančje prsi", "piščančji zrezki", "piščanec", "piščančje",
              "piščančje meso", "pivka", "pivka file"],
     printed="PIŠČANČJI FILE IK zrezki, pakirano, Pivka, XXL, 540 g, 400 g + 140 g GRATIS", price=569, regular=639, disc=10,
     vextra="Cena velja za XXL pakiranje 540 g (400 g + 140 g GRATIS).", img=("render", []))
prod(id="mleto-meso-ave-1kg", page=6, anchor="MEŠANO MESO", name="Mleto mešano meso",
     brand="Ave", line=None, descriptor="pakirano", pack="1 kg", qty=(1, "kg"), cats=["meso", "vecerja"],
     aliases=["mleto meso", "mletega mesa", "mleto", "mešano meso", "mleto mešano meso", "meso za bolognese", "faširano", "ave"],
     printed="MLETO MEŠANO MESO pakirano, Ave, 1 kg", price=759, regular=949, disc=20, img=("render", []))
prod(id="sb-svinjske-kocke-500g", page=6, anchor="SVINJSKE KOCKE", name="Svinjske kocke",
     brand="S-BUDGET", line="S-BUDGET", descriptor="pakirano", pack="500 g", qty=(500, "g"), cats=["meso", "vecerja"],
     aliases=["svinjske kocke", "svinjskih kock", "kocke", "svinjina", "svinjino", "svinjsko meso", "meso za golaž", "golaž", "sbudget", "s-budget meso"],
     printed="S-BUDGET SVINJSKE KOCKE pakirano, 500 g", price=289, vnote=S_NOTE, img=("render", []))
prod(id="ocvirki-ave-100g", page=7, anchor="OCVIRKI", name="Ocvirki", brand="Ave", line=None,
     descriptor="s piransko soljo, sladko papriko, čebulo ali kajenskim poprom, v lončku", pack="100 g", qty=(100, "g"), cats=["mesni-izdelki", "prigrizki"],
     aliases=["ocvirki", "ocvirke", "ocvirkov", "ocvirk", "ave ocvirki", "maščobni ocvirki"],
     printed="NOVO OCVIRKI s piransko soljo, sladko papriko, čebulo ali kajenskim poprom, v lončku, Ave, 100 g", price=349,
     vextra="Natisnjena oznaka »NOVO« (rdeča značka v bloku).", img=("render", []), new="printed")

# ============================================================ SPAR – mlečni izdelki (p. 14, 15, 16)
prod(id="surovo-maslo-pomurske-250g", page=14, anchor="SUROVO MASLO", name="Slovensko surovo maslo",
     brand="Pomurske mlekarne", line=None, descriptor=None, pack="250 g", qty=(250, "g"), cats=["mlecni-izdelki", "zajtrk"],
     aliases=["maslo", "masla", "maslom", "maslu", "surovo maslo", "slovensko maslo", "putr", "pomurske mlekarne"],
     printed="SLOVENSKO SUROVO MASLO Pomurske mlekarne, 250 g", price=269, regular=449, disc=40, img=("render", []))
prod(id="skyr-mu-2x140g", page=14, anchor="SKYR MU", name="Skyr Mu", brand="Ljubljanske mlekarne", line="Mu",
     descriptor="več okusov", pack="2 × 140 g", qty=(280, "g"), cats=["mlecni-izdelki", "zajtrk"],
     aliases=["skyr", "skyra", "skyru", "skir", "mu skyr", "skyr mu", "proteinski jogurt", "jogurt", "ljubljanske mlekarne"],
     printed="SKYR MU več okusov, Ljubljanske mlekarne, 2 x 140 g", price=129, regular=199, disc=35, img=("render", []), new="demo")
prod(id="alpsko-mleko-1l", page=16, anchor="ALPSKO MLEKO", name="Alpsko mleko", brand="Ljubljanske mlekarne", line=None,
     descriptor="z dodanim vitaminom D in kalcijem, 1,5 % m. m.", pack="1 l", qty=(1, "l"), cats=["mlecni-izdelki", "zajtrk", "pijace"],
     aliases=["mleko", "mleka", "mlekom", "alpsko mleko", "alpskega mleka", "kalcijevo mleko", "ljubljanske mlekarne"],
     printed="ALPSKO MLEKO z dodanim vitaminom D in kalcijem, 1,5 % m. m., Ljubljanske mlekarne, 1 l", price=129, regular=169, disc=23, pc="PC 1,69",
     img=("render", []))
prod(id="jogurt-dukat-1l", page=14, anchor="NAVADNI JOGURT", name="Navadni jogurt", brand="Dukat", line=None,
     descriptor="2,8 % m. m.", pack="1 l", qty=(1, "l"), cats=["mlecni-izdelki", "zajtrk"],
     aliases=["jogurt", "jogurta", "jogurtom", "navadni jogurt", "tekoči jogurt", "dukat", "dukat jogurt"],
     printed="NAVADNI JOGURT 2,8 % m. m., Dukat, 1 l", price=149, regular=199, disc=25, img=("render", []))
prod(id="skuta-mu-cuisine-500g", page=15, anchor="MU CUISINE", name="Skuta Mu Cuisine", brand="Ljubljanske mlekarne", line="Mu",
     descriptor="nepasirana", pack="500 g", qty=(500, "g"), cats=["mlecni-izdelki", "zajtrk"],
     aliases=["skuta", "skute", "skuto", "skuti", "mu skuta", "nepasirana skuta", "cuisine", "ljubljanske mlekarne"],
     printed="SKUTA MU CUISINE nepasirana, Ljubljanske mlekarne, 500 g", price=259, regular=379, disc=31, img=("render", []))

# ============================================================ SPAR – sadje, zelenjava (p. 4, 9)
prod(id="mandarine-1kg", page=4, anchor="MANDARINE", name="Mandarine", brand=None, line=None, descriptor="iz doline reke Neretve",
     pack="1 kg", qty=(1, "kg"), unit="kg", cats=["sadje", "zajtrk"],
     aliases=["mandarine", "mandarin", "mandarinam", "mandarinami", "mandarina", "citrusi", "neretva"],
     printed="MANDARINE iz doline reke Neretve, 1 kg", price=149, regular=199, disc=25, vextra="Cena velja za 1 kg (tehtano sadje).", img=("render", []))
prod(id="jabolka-zlati-delises-1kg", page=4, anchor="JABOLKA ZLATI", name="Slovenska jabolka Zlati delišes", brand=None, line=None,
     descriptor="Pridelano v Sloveniji", pack="1 kg", qty=(1, "kg"), unit="kg", cats=["sadje"],
     aliases=["jabolka", "jabolko", "jabolk", "jabolki", "zlati delišes", "delišes", "slovenska jabolka", "rumena jabolka"],
     printed="SLOVENSKA JABOLKA ZLATI DELIŠES 1 kg", price=149, regular=189, disc=21, vextra="Cena velja za 1 kg (tehtano sadje).", img=("render", []))
prod(id="sladki-krompir-1kg", page=9, anchor="SLADKI KROMPIR", name="Sladki krompir", brand=None, line=None, descriptor=None,
     pack="1 kg", qty=(1, "kg"), unit="kg", cats=["zelenjava", "vecerja"],
     aliases=["sladki krompir", "sladkega krompirja", "sladek krompir", "batat", "krompir", "krompirja"],
     printed="SLADKI KROMPIR 1 kg", price=199, regular=249, disc=20, vextra="Cena velja za 1 kg (tehtana zelenjava).", img=("render", []), new="demo")
prod(id="brokoli-500g", page=9, anchor="BROKOLI", name="Brokoli", brand="SPAR", line="SPAR", descriptor="pakirano",
     pack="500 g", qty=(500, "g"), cats=["zelenjava", "vecerja"],
     aliases=["brokoli", "brokolija", "brokolijem", "brokoliju", "cvetača", "zelenjava"],
     printed="SPAR BROKOLI pakirano, 500 g", price=199, regular=249, disc=20, img=("render", []))
prod(id="sb-sampinjoni-500g", page=4, anchor="ŠAMPINJONI", name="Šampinjoni", brand="S-BUDGET", line="S-BUDGET", descriptor="pakirano",
     pack="500 g", qty=(500, "g"), cats=["zelenjava", "vecerja"],
     aliases=["šampinjoni", "šampinjone", "šampinjonov", "gobe", "gob", "gobami", "sampinjoni", "sbudget šampinjoni"],
     printed="S-BUDGET ŠAMPINJONI pakirano, 500 g", price=179, vnote=S_NOTE, img=("render", []))

# ============================================================ SPAR – osnovna živila (p. 5, 18, 19)
prod(id="riz-zlato-polje-800g", page=19, anchor="RIŽ", name="Riž", brand="Zlato polje", line=None, descriptor=None,
     pack="800 g", qty=(800, "g"), cats=["osnovna-zivila", "prilogi"],
     aliases=["riž", "riža", "rižem", "riz", "beli riž", "zlato polje", "priloga"],
     printed="RIŽ Zlato polje, 800 g", price=175, regular=275, disc=36, pc="PC 2,75", img=("render", []))
prod(id="moka-farina-t400-1kg", page=19, anchor="UNIVERZALNA", name="Univerzalna moka T400", brand="Farina", line=None, descriptor=None,
     pack="1 kg", qty=(1, "kg"), cats=["osnovna-zivila", "pekovsko"],
     aliases=["moka", "moke", "moko", "univerzalna moka", "pšenična moka", "bela moka", "t400", "farina"],
     printed="UNIVERZALNA MOKA T400 Farina, 1 kg", price=125, regular=188, disc=33, pc="PC 1,88", img=("render", []))
prod(id="spageti-barilla-500g", page=18, anchor="ŠPAGETI", name="Špageti št. 3", brand="Barilla", line=None, descriptor=None,
     pack="500 g", qty=(500, "g"), cats=["osnovna-zivila", "testenine", "vecerja"],
     aliases=["špageti", "špagetov", "špagete", "špagetih", "spageti", "testenine", "testenin", "pašta", "pasta", "barilla", "barilla špageti"],
     printed="ŠPAGETI ŠT. 3 Barilla, 500 g", price=99, regular=139, disc=28, pc="PC 1,39", img=("render", []))
prod(id="bolonjska-omaka-barilla-400g", page=18, anchor="BOLONJSKA", name="Bolonjska omaka", brand="Barilla", line=None, descriptor="osnova",
     pack="400 g", qty=(400, "g"), cats=["osnovna-zivila", "omake", "vecerja"],
     aliases=["omaka", "omake", "omako", "bolonjska omaka", "bolonjska", "bolognese", "omaka za testenine", "barilla omaka"],
     printed="BOLONJSKA OMAKA osnova, Barilla, 400 g", price=229, regular=299, disc=23, pc="PC 2,99", img=("render", []))
prod(id="pasiran-paradiznik-podravka-500g", page=18, anchor="PASIRAN", name="Pasiran paradižnik", brand="Podravka", line=None, descriptor=None,
     pack="500 g", qty=(500, "g"), cats=["osnovna-zivila", "omake"],
     aliases=["paradižnik", "paradižnika", "pasiran paradižnik", "passata", "paradižnikova omaka", "omaka", "podravka"],
     printed="PASIRAN PARADIŽNIK Podravka, 500 g", price=79, regular=139, disc=43, pc="PC 1,39", extra="MEGA CENA", img=("render", []))
prod(id="soncnicno-olje-spar-1l", page=5, box=(0.345, 0.755, 0.66, 0.968), name="Sončnično olje", brand="SPAR", line="SPAR", descriptor="PET",
     pack="1 l", qty=(1, "l"), cats=["osnovna-zivila"],
     aliases=["olje", "olja", "oljem", "sončnično olje", "sončničnega olja", "jedilno olje", "spar olje"],
     printed="SPAR SONČNIČNO OLJE PET, 1 l", price=159, regular=229, disc=30, pc="PC 2,29", bgforce=True, img=("render", []))

# ============================================================ SPAR – sladko, pijače (p. 19, 22, 23, 13)
prod(id="kinder-cokolada-100g", page=22, anchor="MLEČNA", name="Mlečna čokolada Kinder", brand="Ferrero", line="Kinder", descriptor=None,
     pack="100 g", qty=(100, "g"), cats=["sladko", "sladkarije"],
     aliases=["čokolada", "čokolade", "čokolado", "kinder", "kinder čokolada", "mlečna čokolada", "ferrero", "sladkarije"],
     printed="MLEČNA ČOKOLADA Kinder, Ferrero, 100 g", price=159, regular=189, disc=15, pc="PC 1,89", img=("render", []))
prod(id="marmeladni-namaz-belsad-700g", page=19, anchor="MARMELADNI", name="Marmeladni namaz", brand="Belsad", line=None, descriptor="več vrst",
     pack="700 g", qty=(700, "g"), cats=["sladko", "namazi", "zajtrk"],
     aliases=["marmelada", "marmelade", "marmelado", "marmeladni namaz", "namaz", "džem", "belsad", "slivova marmelada"],
     printed="MARMELADNI NAMAZ več vrst, Belsad, 700 g", price=289, regular=399, disc=27, pc="PC 3,99", img=("render", []))
prod(id="kava-barcaffe-classic-200g", page=22, box=(0.0, 0.746, 0.332, 0.968), name="Kava Barcaffè Classic", brand="Barcaffè", line=None,
     descriptor="mleta pražena kava", pack="200 g", qty=(200, "g"), cats=["pijace", "kava", "zajtrk"],
     aliases=["kava", "kave", "kavo", "mleta kava", "pražena kava", "barcaffe", "barcaffè", "barcaffe classic", "kava barcaffe"],
     printed="KAVA BARCAFFÈ CLASSIC mleta pražena kava, 200 g", price=379, regular=475, disc=20, pc="PC 3,79",
     vextra="Natisnjeno »redna cena 4,75« in »PC 3,79«; cena s SPAR plus kartico je enaka PC.", img=("embedded", 4133))
prod(id="mineralna-voda-dana-1-5l", page=23, anchor="MINERALNA", name="Negazirana naravna mineralna voda Dana", brand="Dana", line=None,
     descriptor="negazirana", pack="1,5 l", qty=(1.5, "l"), cats=["pijace", "voda"],
     aliases=["voda", "vode", "vodo", "mineralna voda", "negazirana voda", "dana", "dana voda", "pijača"],
     printed="NEGAZIRANA NARAVNA MINERALNA VODA DANA 1,5 l", price=59, regular=72, disc=18, pc="PC 0,59", img=("render", []))
prod(id="bio-kombucha-330ml", page=13, anchor="BIO KOMBUCHA", name="Bio kombucha", brand="SPAR", line="SPAR",
     descriptor="ingver-kurkuma, classic ali malina-hibiskus", pack="330 ml", qty=(330, "ml"), cats=["pijace"],
     aliases=["kombucha", "kombuča", "kombucho", "kombuče", "bio kombucha", "napitek", "fermentirana pijača", "čaj"],
     printed="NOVO BIO KOMBUCHA ingver-kurkuma, classic ali malina-hibiskus, 330 ml", price=159,
     vextra="Natisnjena oznaka »NOVO« (rdeča značka v bloku).", img=("render", []), new="printed")
prod(id="vital-cajno-pecivo-200g", page=12, anchor="ČAJNO PECIVO", name="Polnozrnato čajno pecivo", brand="SPAR Vital", line="Vital",
     descriptor="s koščki temne čokolade, brez sladkorja", pack="200 g", qty=(200, "g"), cats=["zajtrk", "sladko"],
     aliases=["čajno pecivo", "pecivo", "piškoti", "piškote", "vital", "spar vital", "polnozrnati piškoti", "keksi", "polnozrnato pecivo"],
     printed="POLNOZRNATO ČAJNO PECIVO s koščki temne čokolade, brez sladkorja, 200 g", price=259, regular=289, disc=10, pc="PC 2,89",
     img=("render", []), new="demo")
prod(id="vital-strucka-kurkuma-84g", page=12, anchor="S KURKUMO", name="Štručka s kurkumo", brand="SPAR Vital", line="Vital", descriptor=None,
     pack="84 g", qty=(84, "g"), cats=["pekovsko", "zajtrk"],
     aliases=["štručka", "štručko", "štručke", "pecivo", "štručka s kurkumo", "kurkuma", "vital", "spar vital"],
     printed="ŠTRUČKA S KURKUMO Vital, 84 g", price=49, regular=59, disc=16, img=("render", []), new="demo")

# ============================================================ INTERSPAR 14/26
I = "interspar-1426"
prod(cat=I, id="jedilna-cokolada-250g", page=1, box=(0.035, 0.30, 0.36, 0.465), name="Jedilna čokolada", brand="SPAR", line="SPAR", descriptor=None,
     pack="250 g", qty=(250, "g"), cats=["sladko", "osnovna-zivila", "pekovsko"],
     aliases=["čokolada", "čokolade", "čokolado", "jedilna čokolada", "čokolada za peko", "čokolada za kuhanje", "spar čokolada", "peka"],
     printed="SPAR JEDILNA ČOKOLADA 250 g", price=275, regular=369, disc=25, pc="PC 3,69",
     img=("cropn", (0.0, 0.365, 0.185, 0.485)),
     imgnote="Pravokotni izrez pakiranja iz naslovne fotografije (INTERSPAR str. 1); ozadje fotografije je ohranjeno, ker je pakiranje del fotografirane scene.")
prod(cat=I, id="pistacijev-namaz-150g", page=1, box=(0.03, 0.475, 0.29, 0.655), name="Pistacijev namaz", brand="DESPAR", line="Premium",
     descriptor="Premium", pack="150 g", qty=(150, "g"), cats=["sladko", "namazi", "zajtrk"],
     aliases=["pistacijev namaz", "namaz", "pistacije", "pistacijev krem", "pistacijeva krema", "premium", "despar premium", "crema al pistacchio"],
     printed="DESPAR PREMIUM PISTACIJEV NAMAZ 150 g", price=339,
     img=("cropn", (0.125, 0.455, 0.275, 0.635)),
     imgnote="Pravokotni izrez kozarca iz naslovne fotografije (INTERSPAR str. 1); ozadje fotografije je ohranjeno, ker je kozarec del fotografirane scene.", new="demo")
prod(cat=I, id="vleceno-testo-zito-400g", page=1, box=(0.735, 0.185, 0.995, 0.32), name="Vlečeno testo", brand="Žito", line="SPAR", descriptor="sveže",
     pack="400 g", qty=(400, "g"), cats=["pekovsko", "osnovna-zivila"],
     aliases=["testo", "testa", "vlečeno testo", "vlečenega testa", "štrudelj", "zavitek", "sveže testo", "žito", "testo za štrudelj"],
     printed="VLEČENO TESTO sveže, Žito, 400 g", price=143, regular=219, disc=34, pc="PC 2,19",
     img=("cropn", (0.60, 0.315, 1.0, 0.475)),
     imgnote="Pravokotni izrez pakiranja iz naslovne fotografije (INTERSPAR str. 1); ozadje fotografije je ohranjeno, ker je pakiranje del fotografirane scene.")
prod(cat=I, id="tolminska-skuta-500g", page=2, box=(0.29, 0.77, 0.50, 0.975), name="Tolminska skuta", brand="Mlekarna Planika", line=None,
     descriptor="5 % m. m.", pack="500 g", qty=(500, "g"), cats=["mlecni-izdelki", "zajtrk"],
     aliases=["skuta", "skute", "skuto", "skuti", "tolminska skuta", "planika", "mlekarna planika"],
     printed="TOLMINSKA SKUTA 5 % m. m., Mlekarna Planika, 500 g", price=309, regular=369, disc=16, img=("embedded", 27))
prod(cat=I, id="bio-maslo-250g", page=2, box=(0.67, 0.62, 0.985, 0.80), name="Bio maslo", brand=NATUR, line="Natur*pur", descriptor=None,
     pack="250 g", qty=(250, "g"), cats=["mlecni-izdelki", "zajtrk"],
     aliases=["maslo", "masla", "maslom", "bio maslo", "biološko maslo", "natur pur", "naturpur", "putr"],
     printed="BIO MASLO 250 g", price=229, regular=259, disc=11, img=("embedded", 53))
prod(cat=I, id="keksi-leibniz-200g", page=2, box=(0.04, 0.59, 0.29, 0.86), name="Keksi Leibniz", brand="Bahlsen", line="Leibniz", descriptor="več okusov",
     pack="200 g", qty=(200, "g"), cats=["sladko", "zajtrk"],
     aliases=["keksi", "keks", "kekse", "leibniz", "leibniz keksi", "bahlsen", "piškoti"],
     printed="KEKSI LEIBNIZ več okusov, Bahlsen, 200 g", price=229, regular=299, disc=23, pc="PC 1,49",
     vextra="Natisnjeno »PC 1,49« (nižje od cene s kartico); shranjeno le kot opomba. Ob nakupu dveh izdelkov Leibniz velja darilo (predpasnik), ni del cene.",
     img=("render", [104, 55]))
prod(cat=I, id="listnato-testo-500g", page=3, box=(0.43, 0.12, 0.925, 0.275), name="Listnato testo", brand="SPAR", line="SPAR", descriptor="zamrznjeno",
     pack="500 g", qty=(500, "g"), cats=["pekovsko", "zamrznjeno"],
     aliases=["testo", "testa", "listnato testo", "listnatega testa", "zamrznjeno testo", "pecivo", "spar testo"],
     printed="SPAR LISTNATO TESTO zamrznjeno, 500 g", price=145, regular=209, disc=30, pc="PC 2,09", img=("embedded", 255))
prod(cat=I, id="smetana-v-dozi-250g", page=3, box=(0.04, 0.775, 0.36, 0.935), name="Smetana v dozi", brand="Meggle", line=None, descriptor="z aromo vanilije",
     pack="250 g", qty=(250, "g"), cats=["mlecni-izdelki", "sladko"],
     aliases=["smetana", "smetane", "smetano", "stepena smetana", "smetana v dozi", "spray cream", "meggle", "sladka smetana"],
     printed="SMETANA V DOZI z aromo vanilije, Meggle, 250 g", price=219, regular=299, disc=26, pc="PC 2,09", img=("embedded", 256))
prod(cat=I, id="bio-jabolka-rdeca-600g", page=3, box=(0.42, 0.775, 0.955, 0.925), name="Slovenska bio rdeča jabolka", brand=NATUR, line="Natur*pur",
     descriptor="pakirano, Pridelano v Sloveniji", pack="600 g", qty=(600, "g"), cats=["sadje"],
     aliases=["jabolka", "jabolko", "jabolk", "jabolki", "bio jabolka", "rdeča jabolka", "slovenska jabolka", "natur pur"],
     printed="SLOVENSKA BIO RDEČA JABOLKA pakirano, 600 g", price=169, regular=249, disc=32, img=("embedded", 260))
prod(cat=I, id="mesanica-biskvit-250g", page=3, box=(0.16, 0.625, 0.52, 0.77), name="Mešanica za biskvit", brand="SPAR", line="SPAR", descriptor=None,
     pack="250 g", qty=(250, "g"), cats=["osnovna-zivila", "pekovsko"],
     aliases=["biskvit", "mešanica za biskvit", "mešanica", "biskvitna mešanica", "pecivo", "spar mešanica"],
     printed="SPAR MEŠANICA ZA BISKVIT 250 g", price=119, regular=149, disc=20, pc="PC 1,49", img=("embedded", 246))
prod(cat=I, id="sladki-prah-oetker-500g", page=2, box=(0.72, 0.805, 0.985, 0.975), name="Sladki prah", brand="Dr. Oetker", line=None, descriptor=None,
     pack="500 g", qty=(500, "g"), cats=["osnovna-zivila", "pekovsko"],
     aliases=["sladkor", "sladki prah", "mleti sladkor", "sladkorni prah", "dr. oetker", "oetker", "peka"],
     printed="SLADKI PRAH Dr. Oetker, 500 g", badge="ZNIŽANI FAVORITI", price=219, regular=278, disc=21, pc="PC 2,19",
     vnote="Akcija ZNIŽANI FAVORITI: natisnjeno »ZNIŽANI FAVORITI 21%« in redna cena 2,78.", img=("embedded", 51))
prod(cat=I, id="bio-pirin-kruh-600g", page=8, box=(0.655, 0.185, 0.955, 0.425), name="Bio pirin kruh", brand="SPAR", line="SPAR", descriptor="polnozrnat",
     pack="600 g", qty=(600, "g"), cats=["pekovsko", "kruh", "zajtrk"],
     aliases=["kruh", "kruha", "kruhom", "pirin kruh", "bio kruh", "polnozrnat kruh", "polnozrnati kruh", "pirni kruh"],
     printed="BIO PIRIN KRUH polnozrnat, 600 g", price=224, regular=249, disc=10, img=("embedded", 1373), new="demo")
prod(cat=I, id="bio-fitnes-strucka-117g", page=8, box=(0.345, 0.185, 0.65, 0.425), name="Bio fitnes štručka", brand=NATUR, line="Natur*pur", descriptor="polnozrnata",
     pack="117 g", qty=(117, "g"), cats=["pekovsko", "zajtrk"],
     aliases=["štručka", "štručko", "štručke", "pecivo", "fitnes štručka", "bio štručka", "polnozrnata štručka"],
     printed="BIO FITNES ŠTRUČKA polnozrnata, 117 g", price=119, regular=139, disc=14, img=("embedded", 1374))
prod(cat=I, id="bio-kornstrucka-76g", page=8, box=(0.03, 0.185, 0.335, 0.425), name="Bio kornštručka", brand=NATUR, line="Natur*pur", descriptor=None,
     pack="76 g", qty=(76, "g"), cats=["pekovsko", "zajtrk"],
     aliases=["kornštručka", "korn štručka", "štručka", "štručko", "pecivo", "bio kornštručka", "bio štručka"],
     printed="BIO KORNŠTRUČKA 76 g", price=44, regular=59, disc=25, img=("embedded", 1372))

# ============================================================ FIX 7: additional verified products (kept in separate files for review)
for _f in ("extra_products_spar.py", "extra_products_interspar.py"):
    exec(compile((pathlib.Path(__file__).parent / _f).read_text(encoding="utf-8"), _f, "exec"), globals())

# editorial order: interleave SPAR / INTERSPAR, attractive packshots first
RANK_ORDER = [
    "nutella-1kg", "jedilna-cokolada-250g", "belo-grozdje-1kg", "piscancje-meso-po-italijansko-800g", "pistacijev-namaz-150g",
    "surovo-maslo-pomurske-250g", "vleceno-testo-zito-400g", "stajerski-piscanec-1kg", "bio-jabolka-rdeca-600g", "sitarjev-hlebec-750g",
    "tolminska-skuta-500g", "skyr-mu-2x140g", "bio-pirin-kruh-600g", "kinder-cokolada-100g", "listnato-testo-500g", "piscancji-medaljoni-ptuj-750g",
    "keksi-leibniz-200g", "mandarine-1kg", "bio-maslo-250g", "alpsko-mleko-1l", "mesanica-biskvit-250g", "kava-barcaffe-classic-200g",
    "smetana-v-dozi-250g", "marmeladni-namaz-belsad-700g", "bio-fitnes-strucka-117g", "jabolka-zlati-delises-1kg", "sladki-prah-oetker-500g",
    "mleto-meso-ave-1kg", "bio-kornstrucka-76g", "piscancji-file-pivka-540g", "brokoli-500g", "sladki-krompir-1kg", "bio-kombucha-330ml",
    "spageti-barilla-500g", "bolonjska-omaka-barilla-400g", "pasiran-paradiznik-podravka-500g", "riz-zlato-polje-800g", "jogurt-dukat-1l",
    "skuta-mu-cuisine-500g", "vital-cajno-pecivo-200g", "vital-strucka-kurkuma-84g", "ocvirki-ave-100g", "moka-farina-t400-1kg",
    "soncnicno-olje-spar-1l", "mineralna-voda-dana-1-5l", "sb-sampinjoni-500g", "sb-svinjske-kocke-500g",
]
RANK = {pid: i + 1 for i, pid in enumerate(RANK_ORDER)}
for _s in P:  # additions keep the original order first; new products follow in file order (priority: cover, then page order)
    if _s["id"] not in RANK:
        RANK[_s["id"]] = len(RANK) + 1

# ----------------------------------------------------------------------------- recipes
SPAR, INT = "4126", "1426"
RECIPES = [
    {
        "id": "vecerja-piscanec-po-italijansko-riz-brokoli",
        "title": "Piščanec po italijansko z rižem in brokolijem",
        "kind": "dinner", "servings": 4, "budgetCents": 1300, "minutes": 40,
        "ingredients": [
            {"offerId": f"offer-piscancje-meso-po-italijansko-800g-{SPAR}", "requiredQuantity": "800 g", "packsNeeded": 1,
             "conversionNote": "Porabiš celoten 800 g paket Perutnine Ptuj (že začinjeno po italijansko)."},
            {"offerId": f"offer-riz-zlato-polje-800g-{SPAR}", "requiredQuantity": "približno 300 g", "packsNeeded": 1,
             "conversionNote": "Kupiti je treba cel 800 g paket; približno 500 g riža ostane v shrambi."},
            {"offerId": f"offer-brokoli-500g-{SPAR}", "requiredQuantity": "500 g", "packsNeeded": 1,
             "conversionNote": "Porabiš cel 500 g paket brokolija."},
        ],
        "pantryAssumptions": ["olje, sol in poper imaš doma", "limonin sok ali česen sta neobvezna"],
        "steps": [
            "Pečico segrej na 200 °C. Piščančje meso razporedi po pekaču in peci po navodilih na embalaži (običajno 35–45 minut), do zlato rjave skorjice.",
            "Riž v osoljeni vodi kuhaj približno 15 minut, nato odcedi.",
            "Brokoli razdeli na cvetove in ga 4–5 minut kuhaj na pari ali v rahlo osoljeni vodi, da ostane čvrst.",
            "Brokoli po želji začini z oljem in poprom.",
            "Piščanca postrezi z rižem in brokolijem ter prelij s sokom iz pekača.",
        ],
    },
    {
        "id": "kosilo-spageti-paradiznikova-omaka-gobe",
        "title": "Špageti s paradižnikovo omako in šampinjoni",
        "kind": "lunch", "servings": 4, "budgetCents": 600, "minutes": 25,
        "ingredients": [
            {"offerId": f"offer-spageti-barilla-500g-{SPAR}", "requiredQuantity": "500 g", "packsNeeded": 1,
             "conversionNote": "En 500 g paket zadošča za štiri porcije."},
            {"offerId": f"offer-pasiran-paradiznik-podravka-500g-{SPAR}", "requiredQuantity": "500 g", "packsNeeded": 1,
             "conversionNote": "Porabiš celo 500 g embalažo."},
            {"offerId": f"offer-sb-sampinjoni-500g-{SPAR}", "requiredQuantity": "500 g", "packsNeeded": 1,
             "conversionNote": "Porabiš cel 500 g paket šampinjonov."},
        ],
        "pantryAssumptions": ["olje, sol in poper imaš doma", "česen, čebula in origano so neobvezni"],
        "steps": [
            "V velikem loncu zavri osoljeno vodo in skuhaj špagete po navodilih na embalaži.",
            "Šampinjone očisti, nareži na rezine in jih 5–6 minut praži na žlici olja, da porjavijo.",
            "Prilij pasiran paradižnik, po okusu solí in popopraj ter 8–10 minut kuhaj na majhnem ognju.",
            "Špagete odcedi, jih premešaj z omako in takoj postrezi.",
        ],
    },
    {
        "id": "zajtrk-pirin-kruh-skuta-jabolka",
        "title": "Zajtrk: pirin kruh s skuto in jabolki",
        "kind": "breakfast", "servings": 2, "budgetCents": 900, "minutes": 10,
        "ingredients": [
            {"offerId": f"offer-bio-pirin-kruh-600g-{INT}", "requiredQuantity": "4 rezine (približno 120 g)", "packsNeeded": 1,
             "conversionNote": "Kupiti je treba cel 600 g hlebec; ostanek porabiš za naslednje zajtrke."},
            {"offerId": f"offer-tolminska-skuta-500g-{INT}", "requiredQuantity": "približno 200 g", "packsNeeded": 1,
             "conversionNote": "Kupiti je treba celo 500 g embalažo; približno 300 g ostane v hladilniku."},
            {"offerId": f"offer-bio-jabolka-rdeca-600g-{INT}", "requiredQuantity": "2 jabolki (približno 300 g)", "packsNeeded": 1,
             "conversionNote": "Kupiti je treba cel 600 g paket; preostala jabolka ostanejo za prigrizek."},
        ],
        "pantryAssumptions": ["med ali cimet po okusu imaš doma (neobvezno)"],
        "steps": [
            "Jabolka operi, odstrani sredico in jih nareži na tanke rezine.",
            "Skuto v skledi premešaj z vilicami; po želji dodaj malo medu.",
            "Kruh po želji na kratko popeci v toasterju ali ponvi.",
            "Rezine kruha namaži s skuto, obloži z jabolki in po želji potresi s cimetom.",
        ],
    },
]


# ----------------------------------------------------------------------------- helpers
def strip_diacritics(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def expand_aliases(aliases, name, brand):
    out = []
    for a in aliases + [name.lower()] + ([f"{brand.lower()} {name.lower()}"] if brand else []):
        for v in (a.lower(), strip_diacritics(a.lower())):
            if v not in out:
                out.append(v)
    return out


def fmt(c: int) -> str:
    return f"{c // 100},{c % 100:02d}"


def page_lines(page):
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            t = " ".join(s["text"] for s in l["spans"]).strip()
            if t:
                out.append((pymupdf.Rect(l["bbox"]), t))
    return out


def page_cells(page):
    out = []
    for d in page.get_drawings():
        r = d["rect"] & page.rect
        f = d.get("fill")
        if f and r.width > 60 and r.height > 60 and r.width < page.rect.width * 0.99 and sum(f) > 0.3:
            out.append((r, tuple(round(c * 255) for c in f)))
    return out


_smooth_cache: dict[tuple[str, int], float] = {}


def smoothness(cid: str, xref: int) -> float:
    key = (cid, xref)
    if key not in _smooth_cache:
        doc = DOCS[cid]
        pix = pymupdf.Pixmap(doc, xref)
        if pix.colorspace and pix.colorspace.n == 4:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        if pix.alpha:
            pix = pymupdf.Pixmap(pix, 0)
        if pix.n not in (1, 3):
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        a = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n).astype(float).mean(2)
        _smooth_cache[key] = float(np.abs(np.diff(a, axis=1)).mean() + np.abs(np.diff(a, axis=0)).mean()) if a.size > 4 else 0.0
    return _smooth_cache[key]


def centre(r):
    return pymupdf.Point((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)


def locate(spec):
    """Return (block rect in PDF pts, packshot image infos)."""
    cid = spec["cat"]
    page = DOCS[cid][spec["page"] - 1]
    W, H = page.rect.width, page.rect.height
    infos = [i for i in page.get_image_info(xrefs=True) if i["xref"]]
    if "box" in spec:
        x0, y0, x1, y1 = spec["box"]
        block = pymupdf.Rect(x0 * W, y0 * H, x1 * W, y1 * H)
        cell = block
    else:
        hits = [r for r, t in page_lines(page) if spec["anchor"] in t]
        assert hits, f"anchor not found: {spec['id']}"
        c = centre(hits[0])
        cand = [(r, f) for r, f in page_cells(page) if r.contains(c)]
        assert cand, f"no cell: {spec['id']}"
        cell, _ = min(cand, key=lambda rf: rf[0].width * rf[0].height)
        block = None
    shots = [i for i in infos if cell.contains(centre(pymupdf.Rect(i["bbox"])))
             and i["width"] * i["height"] >= spec.get("minpx", 8000) and smoothness(cid, i["xref"]) >= 2.5]
    if block is None:
        # the drawn grid cell is the placement box; cells in the top row run under the printed header band
        block = pymupdf.Rect(cell)
        if block.y0 < 0.057 * H:
            block.y0 = 0.057 * H
    return block, shots


def verify_text(spec, block):
    """Assert the typed price facts are printed inside the block (PDF text layer cross-check)."""
    page = DOCS[spec["cat"]][spec["page"] - 1]
    grown = pymupdf.Rect(block) + (-2, -2, 2, 2)
    texts = [t for r, t in page_lines(page) if grown.contains(centre(r))]
    blob = " | ".join(texts)
    need = [f"{spec['price'] // 100} {spec['price'] % 100:02d}"]
    if spec.get("regular"):
        need += [f"redna cena {fmt(spec['regular'])}", f"{spec['disc']}%"]
    if spec.get("pc"):
        need.append(spec["pc"])
    miss = [n for n in need if n not in blob]
    if miss:
        print(f"  !! TEXT CHECK {spec['id']}: not found {miss}\n     block text: {blob[:400]}")
    return not miss


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


def make_image(spec, block, shots):
    cid = spec["cat"]
    doc = DOCS[cid]
    pdf = CATALOGS[cid]["pdf"]
    kind = spec["img"][0]
    page_index = spec["page"] - 1
    if kind == "embedded":
        xref = spec["img"][1]
        info = doc.extract_image(xref)
        pix = pymupdf.Pixmap(doc, xref)
        if pix.colorspace and pix.colorspace.n == 4:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        if pix.alpha:
            pix = pymupdf.Pixmap(pix, 0)
        has_mask = bool(info.get("smask"))
        img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        if has_mask:
            mp = pymupdf.Pixmap(doc, info["smask"])
            m = Image.open(io.BytesIO(mp.tobytes("png"))).convert("L")
            if m.size != img.size:  # mask and colour image may have different resolutions: bring both to the larger one
                size = (max(m.width, img.width), max(m.height, img.height))
                img, m = img.resize(size, Image.LANCZOS), m.resize(size, Image.BICUBIC)
            img.putalpha(m)
        if has_mask:
            prov = f"Embedded PDF image xref {xref} (native {pix.width}×{pix.height} px, with its soft mask as alpha), PDF page {spec['page']} of {pdf}."
        else:
            arr = np.asarray(img.convert("RGB")).astype(int)
            edge = np.concatenate([arr[0], arr[-1], arr[:, 0], arr[:, -1]])
            col, _ = dominant(edge)
            img = flood_transparent(img.convert("RGB"), [col, (255, 255, 255)])
            prov = (f"Embedded PDF image xref {xref} (native {pix.width}×{pix.height} px), PDF page {spec['page']} of {pdf}; "
                    f"flat background ({'#%02x%02x%02x' % col}) flood-filled from the edges to transparency.")
        return trim_resize(img), prov
    if kind == "cropn":
        page = doc[page_index]
        W, H = page.rect.width, page.rect.height
        x0, y0, x1, y1 = spec["img"][1]
        rect = pymupdf.Rect(x0 * W, y0 * H, x1 * W, y1 * H)
        pix = page.get_pixmap(clip=rect, dpi=300, alpha=False)
        img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        return trim_resize(img), spec.get("imgnote", f"Crop of PDF page {spec['page']} of {pdf}.")
    if kind == "plain":
        # unmodified page render of the packshot images' area (used when redaction would lose clipping masks); white page bg flood-filled
        page = doc[page_index]
        clip = pymupdf.Rect()
        for i in shots:
            clip |= pymupdf.Rect(i["bbox"])
        clip = (clip + (-1, -1, 1, 1)) & block
        dpi = min(600, max(150, int(72 * 900 / max(clip.width, clip.height))))
        pix = page.get_pixmap(clip=clip, dpi=dpi, alpha=False)
        img = flood_transparent(Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB"), [(255, 255, 255)], tol=14)
        xrefs = ", ".join(str(i["xref"]) for i in shots)
        return trim_resize(img), (f"Unmodified clip render of PDF page {spec['page']} of {pdf} at {dpi} dpi (embedded images xref {xrefs}, clipping "
                                  f"masks preserved); white page background flood-filled from the edges to transparency.")
    # render: work on a fresh copy so removed layers don't leak between products
    d2 = pymupdf.open(ROOT / pdf)
    pg = d2[page_index]
    clip = pymupdf.Rect()
    for i in shots:
        clip |= pymupdf.Rect(i["bbox"])
    clip = (clip + (-2, -2, 2, 2)) & block
    hidden = set(spec["img"][1])
    shot_xrefs = {i["xref"] for i in shots}
    for i in pg.get_image_info(xrefs=True):
        x = i["xref"]
        if not x or not pymupdf.Rect(i["bbox"]).intersects(clip):
            continue
        if smoothness(cid, x) < 2.5 or x in hidden or x not in shot_xrefs:  # shadows, hidden layers, neighbours' images
            pg.delete_image(x)
    pg.add_redact_annot(clip + (-1, -1, 1, 1), fill=False)
    pg.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED,
                        text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    dpi = min(600, max(150, int(72 * 900 / max(clip.width, clip.height))))
    pix = pg.get_pixmap(clip=clip, dpi=dpi, alpha=False)
    img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
    arr = np.asarray(img).astype(int)
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
        if share > 0.25 and (min(col) > 150 or spec.get("bgforce")):
            bgs.append(col)
    img = flood_transparent(img, bgs)
    xrefs = ", ".join(str(i["xref"]) for i in shots)
    prov = (f"Clip render of the packshot on PDF page {spec['page']} of {pdf} at {dpi} dpi (embedded image xref {xrefs}); shadow layers, "
            f"text and vector badges removed, background ({', '.join('#%02x%02x%02x' % c for c in bgs)}) flood-filled from the edges to transparency.")
    return trim_resize(img), prov


def cached_image(spec, block, shots):
    """make_image() with a small on-disk cache (.tmp/imgcache) keyed by the spec, geometry and this file's image code,
    so adding / fixing one product does not re-render all packshots (a full run takes ~10 min)."""
    import hashlib
    key = hashlib.sha1((json.dumps(spec, sort_keys=True, default=str) + repr(tuple(block)) + repr([i["xref"] for i in shots])
                        + IMAGE_CODE_VERSION).encode("utf-8")).hexdigest()
    cdir = TMP / "imgcache"
    cdir.mkdir(exist_ok=True)
    meta, fimg = cdir / f"{spec['id']}.json", cdir / f"{spec['id']}.png"
    if meta.exists() and fimg.exists():
        m = json.loads(meta.read_text(encoding="utf-8"))
        if m["key"] == key:
            return Image.open(fimg).convert("RGBA" if m["rgba"] else "RGB"), m["prov"]
    img, prov = make_image(spec, block, shots)
    img.save(fimg)
    meta.write_text(json.dumps({"key": key, "prov": prov, "rgba": img.mode == "RGBA"}, ensure_ascii=False), encoding="utf-8")
    return img, prov


IMAGE_CODE_VERSION = "2"  # bump when make_image() changes


def offer_for(spec):
    cid = spec["cat"]
    suffix = CATALOGS[cid]["suffix"]
    regular = spec.get("regular")
    loyalty = regular is not None
    notes = []
    if spec.get("pc"):
        notes.append(f"natisnjeno tudi »{spec['pc']}«")
    if spec.get("extra"):
        notes.append(f"oznaka »{spec['extra']}«")
    if spec.get("badge"):
        notes.append(f"akcija »{spec['badge']}«")
    if spec.get("cond"):
        notes.append(spec["cond"])
    vnotes = [n for n in (spec.get("vnote"), spec.get("vextra")) if n]
    if loyalty:
        vnotes.insert(0, "Znižana cena velja s SPAR plus kartico; redna cena je natisnjena v istem bloku.")
        quote = (f"{spec['printed']}{(' ' + spec['extra']) if spec.get('extra') else ''} {spec.get('badge', 'CENEJE')} {spec['disc']}% "
                 f"redna cena {fmt(regular)}{(' ' + spec['pc']) if spec.get('pc') else ''} s SPAR plus kartico {fmt(spec['price'])}")
    else:
        quote = f"{spec['printed']} {fmt(spec['price'])}"
    return {
        "id": f"offer-{spec['id']}-{suffix}",
        "productId": spec["id"],
        "catalogId": cid,
        "priceCents": spec["price"],
        "priceUnit": spec.get("unit", "pack"),
        "priceKind": "loyalty_price" if loyalty else "catalog_price",
        "regularPriceCents": regular,
        "discountPercent": spec.get("disc"),
        "conditions": {"spPlusRequired": loyalty, "couponRequired": False,
                       "note": ("Velja s SPAR plus kartico" + ("; " + "; ".join(notes) if notes else "")) if loyalty else ("; ".join(notes) or None)},
        "validity": validity(cid, spec["page"]),
        "sourceQuote": quote,
        "verification": {"status": "verified", "checkedOn": CHECKED_ON,
                         "method": f"Visual check of rendered PDF page {spec['page']} of {CATALOGS[cid]['pdf']} (200 dpi crop of the offer block) cross-checked with the PDF text layer",
                         "notes": " ".join(vnotes) or None},
    }


def write_json_atomic(data):
    tmp = CATALOG_JSON.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, CATALOG_JSON)


def main():
    TMP.mkdir(exist_ok=True)
    PRODUCTS_DIR.mkdir(parents=True, exist_ok=True)
    if not DRY:
        for old in PRODUCTS_DIR.glob("*.webp"):
            old.unlink()  # only packshots generated by this run remain
    catalogs = []
    for cid, c in CATALOGS.items():
        base = ROOT / "public" / "catalog" / cid
        doc = DOCS[cid]
        pages = []
        for i in range(doc.page_count):
            n = i + 1
            full = Image.open(base / "pages" / f"page-{n:02d}.webp")
            th = Image.open(base / "thumbs" / f"page-{n:02d}.webp")
            pages.append({"pdfPageIndex": i, "pdfPageNumber": n, "printedPageLabel": PRINTED_LABELS[cid].get(n),
                          "image": {"src": f"/catalog/{cid}/pages/page-{n:02d}.webp", "width": full.width, "height": full.height},
                          "thumb": {"src": f"/catalog/{cid}/thumbs/page-{n:02d}.webp", "width": th.width, "height": th.height},
                          "theme": THEMES[cid].get(n)})
        cover = Image.open(base / "cover.webp")
        catalogs.append({
            "id": cid, "retailer": c["retailer"], "title": c["title"], "issueLabel": c["issue"], "publishedDate": "2026-10-07",
            "validFrom": D_FROM, "validTo": D_TO, "sourceFile": c["pdf"], "pdfUrl": f"/catalog/{cid}/katalog.pdf",
            "pageCount": doc.page_count,
            "cover": {"src": f"/catalog/{cid}/cover.webp", "width": cover.width, "height": cover.height},
            "pages": pages,
        })
    products, offers, placements = [], [], []
    overlay_boxes: dict[tuple[str, int], list] = {}
    sheet = []
    ok_all = True
    ids = [s["id"] for s in P]
    assert len(ids) == len(set(ids)), "duplicate product ids"
    assert set(RANK_ORDER) <= set(ids), f"rank order mentions unknown ids: {set(RANK_ORDER) - set(ids)}"
    for spec in P:
        cid = spec["cat"]
        page = DOCS[cid][spec["page"] - 1]
        W, H = page.rect.width, page.rect.height
        if DRY:  # fast check of anchors / boxes / text layer only (SPARKO_DRY=1), nothing is written
            try:
                block, shots = locate(spec)
                ok_all &= verify_text(spec, block)
                print(f"DRY {spec['id']:40s} p{spec['page']:02d} shots={len(shots)} block=({block.x0/W:.3f},{block.y0/H:.3f},{block.x1/W:.3f},{block.y1/H:.3f})")
            except AssertionError as e:
                ok_all = False
                print(f"DRY !! {spec['id']}: {e}")
            continue
        block, shots = locate(spec)
        ok_all &= verify_text(spec, block)
        img, prov = cached_image(spec, block, shots)
        img.save(PRODUCTS_DIR / f"{spec['id']}.webp", "WEBP", quality=86, method=6)
        sheet.append((spec["id"], img))
        qty = {"amount": spec["qty"][0], "unit": spec["qty"][1]} if spec.get("qty") else None
        new = spec.get("new")
        products.append({
            "id": spec["id"], "name": spec["name"], "brand": spec["brand"], "line": spec["line"],
            "descriptor": spec["descriptor"], "packSize": spec["pack"], "quantity": qty,
            "categories": spec["cats"], "aliases": expand_aliases(spec["aliases"], spec["name"], spec["brand"]),
            "image": {"src": f"/products/{spec['id']}.webp", "width": img.width, "height": img.height, "provenance": prov},
            "theme": THEMES[cid].get(spec["page"]), "editorialRank": RANK[spec["id"]],
            "isNew": bool(new), "newSource": {"printed": "printed_badge", "demo": "demo_editorial"}.get(new),
        })
        offer = offer_for(spec)
        offers.append(offer)
        bx = {"x": round(block.x0 / W, 4), "y": round(block.y0 / H, 4),
              "width": round(block.width / W, 4), "height": round(block.height / H, 4)}
        bx["width"] = min(bx["width"], round(1 - bx["x"], 4))
        bx["height"] = min(bx["height"], round(1 - bx["y"], 4))
        label = PRINTED_LABELS[cid].get(spec["page"])
        placements.append({"id": f"pl-{spec['id']}-{CATALOGS[cid]['suffix']}-p{spec['page']:02d}", "offerId": offer["id"], "catalogId": cid,
                           "pdfPageIndex": spec["page"] - 1, "pdfPageNumber": spec["page"], "printedPageLabel": label, "bbox": bx})
        overlay_boxes.setdefault((cid, spec["page"]), []).append((spec["id"], bx))
        print(f"{cid[:3]} {spec['id']:36s} p{spec['page']:02d} {spec['price']:5d}c img {img.width}x{img.height}")
    if DRY:
        print("DRY RUN done, text-check", "OK" if ok_all else "ISSUES")
        return
    data = {"version": 2, "catalogs": catalogs, "products": products, "offers": offers, "placements": placements, "recipes": RECIPES}
    write_json_atomic(data)
    for (cid, n), boxes in overlay_boxes.items():
        im = Image.open(ROOT / "public" / "catalog" / cid / "pages" / f"page-{n:02d}.webp").convert("RGB")
        dr = ImageDraw.Draw(im)
        for pid, b in boxes:
            r = [b["x"] * im.width, b["y"] * im.height, (b["x"] + b["width"]) * im.width, (b["y"] + b["height"]) * im.height]
            dr.rectangle(r, outline=(255, 0, 255), width=6)
            dr.rectangle([r[0] + 6, r[1] + 6, r[0] + 8 + 9 * len(pid), r[1] + 26], fill=(255, 0, 255))
            dr.text((r[0] + 8, r[1] + 8), pid, fill="white")
        im.save(TMP / f"overlay-{cid}-p{n:02d}.png")
    cw, ch = 220, 240
    cols = 8
    rows = (len(sheet) + cols - 1) // cols
    sh = Image.new("RGB", (cols * cw, rows * ch), "white")
    for k, (pid, img) in enumerate(sheet):
        tile = Image.new("RGB", (cw, ch), (241, 242, 241) if (k // cols) % 2 else (255, 255, 255))
        im = img.convert("RGBA").copy()
        im.thumbnail((cw - 20, ch - 40))
        tile.paste(im, ((cw - im.width) // 2, 25 + (ch - 40 - im.height) // 2), im)
        ImageDraw.Draw(tile).text((4, 4), pid, fill="black")
        sh.paste(tile, ((k % cols) * cw, (k // cols) * ch))
    sh.save(TMP / "products-sheet.png")
    print("products", len(products), "offers", len(offers), "placements", len(placements), "recipes", len(RECIPES), "text-check", "OK" if ok_all else "ISSUES")


if __name__ == "__main__":
    main()
