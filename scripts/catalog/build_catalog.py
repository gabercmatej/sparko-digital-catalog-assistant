"""Build src/data/catalog.json, product packshots and debug overlays for the SPAR 40/26 demo catalog.

Product facts below (name, pack, price, conditions) were entered BY HAND after visually checking
each offer block on pages rendered at 200 dpi (see .tmp/crops) and cross-checking the PDF text
layer. The script only derives geometry (placement boxes), packshot images and page metadata.

Run (after render_pages.py):  python scripts/catalog/build_catalog.py
Outputs:
  src/data/catalog.json                (written atomically)
  public/products/<productId>.webp     (packshots, max 400 px long side)
  .tmp/overlay-pXX.png                 (placement boxes drawn on page images, for review)
  .tmp/products-sheet.png              (all packshots on white + grey, for review)
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
PDF = ROOT / "260930-1-Katalog_4026.pdf"
CATALOG_JSON = ROOT / "src" / "data" / "catalog.json"
PAGES_DIR = ROOT / "public" / "catalog" / "pages"
THUMBS_DIR = ROOT / "public" / "catalog" / "thumbs"
PRODUCTS_DIR = ROOT / "public" / "products"
TMP = ROOT / ".tmp"
CHECKED_ON = "2026-10-02"
CATALOG_ID = "spar-4026"

# ----------------------------------------------------------------------------- pages
PRINTED_LABELS = {8: "4", 9: "5", 12: "6", 13: "7", 14: "8", 16: "9", 18: "10", 19: "11", 20: "12", 21: "13",
                  22: "14", 25: "15", 27: "16", 29: "18", 30: "19", 32: "20", 33: "21", 34: "22", 35: "23"}
THEMES = {
    1: "Naslovnica", 2: "Jesenska pojedina", 3: "XXL ponudba", 4: "Okusi Azije", 5: "S-BUDGET",
    6: "MasterChef recept", 7: "MasterChef recept", 8: "Sadje in zelenjava", 9: "Sadje in zelenjava",
    10: "Sveži nakupi", 11: "Tuja kuhinja", 12: "Mesnica", 13: "Mesnine", 14: "Ribarnica",
    15: "Mlade družine", 16: "Sveže iz pekarne", 17: "Za dober kruh", 18: "Mlečni izdelki",
    19: "Mlečni izdelki", 20: "Shramba", 21: "Shramba", 22: "Sladko", 23: "Kava", 24: "Smoothiji",
    25: "Pijača", 26: "Napitki", 27: "Pivo in slani prigrizki", 28: "Vina in izbrana ponudba",
    29: "Noč čarovnic", 30: "Za ljubljenčke", 31: "Za ljubljenčke", 32: "Nega in razvajanje",
    33: "Čisto in urejeno", 34: "Nagrobne sveče", 35: "Tekstil in dodatki", 36: "SPAR online",
    37: "SPAR online", 38: "Kuponi",
}

# ----------------------------------------------------------------------------- validity
COVER = "naslovnica (str. 1): »40/26 PONUDBA KATALOGA VELJA OD SREDE 30.9.2026«"
V_CATALOG = {"status": "catalog_default", "from": "2026-09-30", "to": None,
             "evidence": f"Na strani ni posebnega roka; splošna veljavnost kataloga – {COVER}. Končni datum ni natisnjen."}


def v_week(header_page: int, page: int) -> dict:
    where = f"glava strani {header_page}" if header_page == page else f"skupna glava razpona strani {min(page, header_page)}–{max(page, header_page)} (na str. {header_page})"
    return {"status": "explicit", "from": "2026-09-30", "to": "2026-10-06",
            "evidence": f"{where}: »DO TORKA 6. 10.«; začetek: {COVER}"}


# ----------------------------------------------------------------------------- products
# img: ("render", extra_hidden_xrefs) -> render packshot area with shadow layers removed, flood-fill bg
#      ("embedded", xref)            -> embedded image with its soft mask (alpha)
#      ("crop", (x0,y0,x1,y1))       -> rectangular crop in PDF points (photo background kept)
# anchor: text found in the product name line -> enclosing cell gives the placement box
# box: manual normalized box (x0, y0, x1, y1) when the block has no drawn cell
P = []


def prod(**kw):
    P.append(kw)


S_NOTE = "S-BUDGET diskontna cena; odstotek popusta ni natisnjen."

prod(id="sb-skuta-1kg", page=5, anchor="LAHKA SKUTA", name="Lahka skuta", brand="S-BUDGET", line="S-BUDGET",
     descriptor="10 % m. m.", pack="1 kg", qty=(1, "kg"), cats=["mlecni-izdelki", "zajtrk"],
     aliases=["skuta", "skute", "skuto", "skuti", "lahka skuta", "lahke skute", "sbudget skuta", "s-budget skuta", "sir skuta", "cottage"],
     price=338, quote="S-BUDGET LAHKA SKUTA 10 % m. m., 1 kg 3,38", vnote=S_NOTE, rank=1, img=("embedded", 495))
prod(id="sb-pommes-1kg", page=5, anchor="POMMES FRITES", name="Pommes frites", brand="S-BUDGET", line="S-BUDGET",
     descriptor="valovit, za peko v pečici, zamrznjeno", pack="1 kg", qty=(1, "kg"), cats=["zamrznjeno", "prilogi", "vecerja"],
     aliases=["pommes", "pomfri", "pomfrit", "pomfrita", "krompirček", "krompirčka", "frites", "pommes frites", "zamrznjen krompir", "ocvrt krompir"],
     price=159, quote="S-BUDGET POMMES FRITES valovit, za peko v pečici, zamrznjeno, 1 kg 1,59", vnote=S_NOTE, rank=2, img=("render", []))
prod(id="sb-salama-400g", page=5, anchor="POSEBNA SALAMA", name="Piščančja posebna salama", brand="S-BUDGET", line="S-BUDGET",
     descriptor="Panvita Mir", pack="400 g", qty=(400, "g"), cats=["mesni-izdelki", "zajtrk"],
     aliases=["salama", "salame", "salamo", "piščančja salama", "piščančje salame", "posebna salama", "posebne salame", "narezek", "piščančja posebna"],
     price=99, quote="S-BUDGET PIŠČANČJA POSEBNA SALAMA Panvita Mir, 400 g 0,99", vnote=S_NOTE, rank=3, img=("render", []))
prod(id="sb-zrezki-500g", page=5, anchor="SVINJSKI ZREZKI", name="Svinjski zrezki", brand="S-BUDGET", line="S-BUDGET",
     descriptor="tanki, pakirano", pack="500 g", qty=(500, "g"), cats=["meso", "vecerja"],
     aliases=["zrezki", "zrezek", "zrezke", "zrezkov", "svinjski zrezki", "svinjske zrezke", "svinjina", "svinjino", "svinjsko meso", "meso"],
     price=409, quote="S-BUDGET SVINJSKI ZREZKI tanki, pakirano, 500 g 4,09", vnote=S_NOTE, rank=4, img=("render", []))

prod(id="jagode-250g", page=10, anchor="JAGODE", name="Jagode", brand=None, line=None, descriptor="pakirano",
     pack="250 g", qty=(250, "g"), cats=["sadje", "zajtrk"], aliases=["jagode", "jagod", "jagoda", "jagodami", "sveže jagode"],
     price=279, quote="JAGODE pakirano, 250 g 2,79", rank=5, img=("render", []))
prod(id="jajca-xl-10", page=19, anchor="DEBELA JAJCA", name="Debela jajca", brand="Jata Emona", line=None,
     descriptor="hlevske reje, XL", pack="10 kosov", qty=(10, "kos"), cats=["zajtrk", "osnovna-zivila"],
     aliases=["jajca", "jajce", "jajc", "jajci", "jajcem", "debela jajca", "jajca xl", "jata jajca"],
     price=389, kind="loyalty", regular=569, disc=31, pc="PC 5,69",
     quote="DEBELA JAJCA hlevske reje, Jata Emona, XL 10/1 CENEJE 31% redna cena 5,69 PC 5,69 s SPAR plus kartico 3,89",
     rank=6, img=("render", []))
prod(id="maslo-250g", page=1, box=(0.712, 0.372, 0.985, 0.512), name="Maslo", brand="SPAR", line="SPAR",
     descriptor="Ljubljanske mlekarne", pack="250 g", qty=(250, "g"), cats=["mlecni-izdelki", "zajtrk"],
     aliases=["maslo", "masla", "maslom", "maslu", "surovo maslo", "putr", "spar maslo"],
     price=199, kind="loyalty", regular=256, disc=22,
     quote="SPAR MASLO Ljubljanske mlekarne, 250 g CENEJE 22% redna cena 2,56 s SPAR plus kartico 1,99",
     rank=7, img=("crop", (428.5, 309.0, 499.5, 357.5)),
     imgnote="Rectangular crop of the butter pack from the cover photo (PDF page 1, embedded hero image xref 7431); wooden photo background kept because the pack is part of a photographed scene.")
prod(id="sb-borovnice-300g", page=8, anchor="BOROVNICE", name="Borovnice", brand="S-BUDGET", line="S-BUDGET",
     descriptor="pakirano", pack="300 g", qty=(300, "g"), cats=["sadje", "zajtrk"],
     aliases=["borovnice", "borovnic", "borovnicami", "borovnica", "gozdne borovnice", "sbudget borovnice"],
     price=399, quote="S-BUDGET BOROVNICE pakirano, 300 g 3,99", vnote=S_NOTE, rank=8, img=("render", []))
prod(id="moka-manitoba-1kg", page=20, anchor="MOKA MANITOBA", name="Moka Manitoba", brand="Mlinotest", line=None,
     descriptor="»0« ali »00«", pack="1 kg", qty=(1, "kg"), cats=["osnovna-zivila", "pekovsko"],
     aliases=["moka", "moke", "moko", "manitoba", "moka manitoba", "pšenična moka", "bela moka", "mlinotest"],
     price=75, kind="loyalty", regular=139, disc=46, pc="PC 0,89", extra="MEGA CENA",
     quote="MOKA MANITOBA »0« ali »00«, Mlinotest, 1 kg MEGA CENA CENEJE 46% redna cena 1,39 PC 0,89 s SPAR plus kartico 0,75",
     rank=9, img=("render", []))
prod(id="avokado-kos", page=8, anchor="AVOKADO", name="Predzorjen avokado", brand=None, line=None, descriptor=None,
     pack="1 kos", qty=(1, "kos"), unit="kos", cats=["sadje", "zajtrk"],
     aliases=["avokado", "avokada", "avokadom", "avokadi", "predzorjen avokado", "avocado"],
     price=129, quote="PREDZORJEN AVOKADO 1 kos 1,29", rank=10, img=("render", []))

prod(id="mleko-trajno-1l", page=18, anchor="TRAJNO MLEKO", name="Trajno mleko", brand="SPAR", line="SPAR",
     descriptor="Pomurske mlekarne, 1,5 % m. m.", pack="1 l", qty=(1, "l"), cats=["mlecni-izdelki", "zajtrk", "pijace"],
     aliases=["mleko", "mleka", "mlekom", "trajno mleko", "trajnega mleka", "polnomastno mleko", "uht mleko", "pomurske mlekarne"],
     price=75, kind="loyalty", regular=89, disc=15, pc="PC 0,79",
     quote="SPAR TRAJNO MLEKO Pomurske mlekarne, 1,5 % m. m., 1 l CENEJE 15% redna cena 0,89 PC 0,79 s SPAR plus kartico 0,75",
     rank=11, img=("embedded", 1857))
prod(id="jogurt-mu-1kg", page=18, anchor="NAVADNI", name="Navadni jogurt Mu", brand="Ljubljanske mlekarne", line="Mu",
     descriptor="1,3 % ali 3,2 % m. m., PET", pack="1 kg", qty=(1, "kg"), cats=["mlecni-izdelki", "zajtrk"],
     aliases=["jogurt", "jogurta", "jogurtom", "navadni jogurt", "tekoči jogurt", "mu jogurt", "jogurt mu"],
     price=149, kind="loyalty", regular=195, disc=23,
     quote="NAVADNI JOGURT MU 1,3 % m. m., 3,2 % m. m., Ljubljanske mlekarne, PET, 1 kg CENEJE 23% redna cena 1,95 s SPAR plus kartico 1,49",
     rank=12, img=("render", []))
prod(id="smetana-kuho-200g", page=18, anchor="ZA KUHO", name="Smetana za kuho", brand="Dukat", line=None,
     descriptor="Brzo & Fino", pack="200 g", qty=(200, "g"), cats=["mlecni-izdelki", "vecerja"],
     aliases=["smetana", "smetane", "smetano", "smetana za kuho", "kuhinjska smetana", "sladka smetana za kuhanje", "dukat"],
     price=129, kind="loyalty", regular=189, disc=31, pc="PC 1,29",
     quote="SMETANA ZA KUHO Dukat, 200 g CENEJE 31% redna cena 1,89 PC 1,29 s SPAR plus kartico 1,29",
     rank=13, img=("render", []))
prod(id="sir-rezine-150g", page=19, anchor="v rezinah", name="Sir v rezinah", brand="DESPAR", line="DESPAR",
     descriptor="v rezinah", pack="150 g", qty=(150, "g"), cats=["mlecni-izdelki", "zajtrk"],
     aliases=["sir", "sira", "sirom", "sir v rezinah", "narezan sir", "rezine sira", "despar sir"],
     price=149, kind="loyalty", regular=219, disc=31,
     quote="DESPAR SIR v rezinah, 150 g CENEJE 31% redna cena 2,19 s SPAR plus kartico 1,49",
     vextra="Na sliki je več vrst sira (npr. maasdam, edamec, ementalec); natisnjeno je le »SIR v rezinah, 150 g«.",
     rank=14, img=("render", []))
prod(id="kruh-sendvic-250g", page=10, anchor="KRUH ZA SENDVIČE", name="Kruh za sendviče", brand="DESPAR", line="DESPAR",
     descriptor="Pane per tramezzini, pakirano", pack="250 g", qty=(250, "g"), cats=["pekovsko", "zajtrk"],
     aliases=["kruh", "kruha", "kruhom", "toast", "toast kruh", "kruh za sendviče", "kruh za sendvič", "sendvič", "tramezzini"],
     price=119, kind="loyalty", regular=139, disc=14,
     quote="DESPAR KRUH ZA SENDVIČE pakirano, 250 g CENEJE 14% redna cena 1,39 s SPAR plus kartico 1,19",
     rank=15, img=("render", []))
prod(id="kakav-nesquik-400g", page=21, anchor="KAKAV NESQUIK", name="Kakav Nesquik", brand="Nestlé", line=None,
     descriptor=None, pack="400 g", qty=(400, "g"), cats=["zajtrk", "pijace"],
     aliases=["kakav", "kakava", "nesquik", "kakav v prahu", "čokoladni napitek", "nestle"],
     price=339, kind="loyalty", regular=458, disc=25, pc="PC 4,58",
     quote="KAKAV NESQUIK Nestlé, 400 g CENEJE 25% redna cena 4,58 PC 4,58 s SPAR plus kartico 3,39",
     rank=16, img=("render", []))
prod(id="sb-kava-500g", page=23, box=(0.344, 0.745, 0.655, 0.969), name="Mleta pražena kava", brand="S-BUDGET", line="S-BUDGET",
     descriptor=None, pack="500 g", qty=(500, "g"), cats=["pijace", "zajtrk"],
     aliases=["kava", "kave", "kavo", "mleta kava", "pražena kava", "mleta pražena kava", "sbudget kava"],
     price=429, quote="S-BUDGET MLETA PRAŽENA KAVA 500 g 4,29", vnote=S_NOTE, rank=17, img=("embedded", 2710))
prod(id="barilla-gran-ruote-500g", page=20, anchor="GRAN RUOTE", name="Testenine Gran Ruote F1", brand="Barilla", line=None,
     descriptor=None, pack="500 g", qty=(500, "g"), cats=["osnovna-zivila", "vecerja"],
     aliases=["testenine", "testenin", "testeninami", "pašta", "pasta", "barilla", "gran ruote", "kolesca"],
     price=189, quote="TESTENINE GRAN RUOTE F1 Barilla, 500 g 1,89 (NOVO)", rank=18, img=("render", []))
prod(id="barilla-omaka-olive-400g", page=20, anchor="PARADIŽNIKOVA", name="Paradižnikova omaka z olivami", brand="Barilla", line=None,
     descriptor="Olive", pack="400 g", qty=(400, "g"), cats=["osnovna-zivila", "vecerja"],
     aliases=["omaka", "omake", "omako", "paradižnikova omaka", "paradižnikove omake", "omaka za testenine", "pelati", "barilla omaka"],
     price=259, kind="loyalty", regular=349, disc=25, pc="PC 3,49",
     quote="PARADIŽNIKOVA OMAKA z olivami, Barilla, 400 g CENEJE 25% redna cena 3,49 PC 3,49 s SPAR plus kartico 2,59",
     rank=19, img=("render", []))
prod(id="olje-cekin-1l", page=14, box=(0.0, 0.745, 0.334, 0.969), name="Sončnično olje Cekin", brand="Tovarna olja Gea", line=None,
     descriptor="PET", pack="1 l", qty=(1, "l"), cats=["osnovna-zivila"],
     aliases=["olje", "olja", "oljem", "sončnično olje", "sončničnega olja", "jedilno olje", "cekin"],
     price=184, kind="loyalty", regular=299, disc=38, pc="PC 1,84",
     quote="SONČNIČNO OLJE CEKIN Tovarna olja Gea, PET, 1 l CENEJE 38% redna cena 2,99 PC 1,84 s SPAR plus kartico 1,84",
     rank=20, img=("embedded", 1306))
prod(id="riz-lepljivi-1kg", page=4, box=(0.0, 0.498, 0.335, 0.730), name="Beli lepljivi riž", brand="SPAR", line="SPAR",
     descriptor="Klebreis / sticky rice", pack="1 kg", qty=(1, "kg"), cats=["osnovna-zivila", "prilogi"],
     aliases=["riž", "riža", "rižem", "lepljivi riž", "beli riž", "sticky rice", "riz"],
     price=299, quote="SPAR BELI LEPLJIVI RIŽ 1 kg 2,99", rank=21, img=("embedded", 360))
prod(id="koruza-340g", page=11, anchor="KORUZA", name="Koruza", brand="SPAR", line="SPAR",
     descriptor="Sweet corn, pločevinka", pack="340 g", qty=(340, "g"), cats=["zelenjava", "osnovna-zivila"],
     aliases=["koruza", "koruze", "koruzo", "sladka koruza", "koruza v pločevinki", "sweet corn"],
     price=79, kind="loyalty", regular=99, disc=20, pc="PC 0,99",
     quote="SPAR KORUZA 340 g CENEJE 20% redna cena 0,99 PC 0,99 s SPAR plus kartico 0,79",
     rank=22, img=("render", []))
prod(id="sb-krompir-5kg", page=9, anchor="SLOVENSKI KROMPIR", name="Slovenski krompir", brand="S-BUDGET", line="S-BUDGET",
     descriptor="pakirano", pack="5 kg", qty=(5, "kg"), cats=["zelenjava", "prilogi"],
     aliases=["krompir", "krompirja", "krompirjem", "slovenski krompir", "vreča krompirja", "sbudget krompir"],
     price=299, quote="S-BUDGET SLOVENSKI KROMPIR pakirano, 5 kg 2,99", vnote=S_NOTE, rank=23, img=("render", []))
prod(id="jabolka-gala-1kg", page=8, anchor="JABOLKA GALA", name="Slovenska jabolka Gala", brand=None, line=None,
     descriptor="Pridelano v Sloveniji", pack="1 kg", qty=(1, "kg"), unit="kg", cats=["sadje"],
     aliases=["jabolka", "jabolko", "jabolk", "jabolki", "jabolka gala", "gala", "slovenska jabolka"],
     price=149, kind="loyalty", regular=199, disc=25,
     quote="SLOVENSKA JABOLKA GALA 1 kg CENEJE 25% redna cena 1,99 s SPAR plus kartico 1,49",
     vextra="Cena velja za 1 kg (tehtano sadje).", rank=24, img=("render", [700]))
prod(id="sampinjoni-250g", page=9, anchor="ŠAMPINJONI", name="Slovenski šampinjoni", brand="SPAR", line="SPAR",
     descriptor="pakirano", pack="250 g", qty=(250, "g"), cats=["zelenjava", "vecerja"],
     aliases=["šampinjoni", "šampinjone", "šampinjonov", "gobe", "gob", "gobami", "sampinjoni"],
     price=139, kind="loyalty", regular=179, disc=22,
     quote="SPAR SLOVENSKI ŠAMPINJONI pakirano, 250 g CENEJE 22% redna cena 1,79 s SPAR plus kartico 1,39",
     rank=25, img=("render", [700]))
prod(id="zelje-1kg", page=9, anchor="SVEŽE ZELJE", name="Slovensko sveže zelje", brand=None, line=None,
     descriptor="Pridelano v Sloveniji", pack="1 kg", qty=(1, "kg"), unit="kg", cats=["zelenjava"],
     aliases=["zelje", "zelja", "zeljem", "sveže zelje", "belo zelje", "glava zelja"],
     price=89, kind="loyalty", regular=129, disc=31,
     quote="SLOVENSKO SVEŽE ZELJE 1 kg CENEJE 31% redna cena 1,29 s SPAR plus kartico 0,89",
     vextra="Cena velja za 1 kg (tehtana zelenjava).", rank=26, img=("render", [700]))
prod(id="solata-frisno-kos", page=9, anchor="SOLATE FRIŠNO", name="Slovenske solate Frišno", brand="Frišno", line=None,
     descriptor="Pridelano v Sloveniji", pack="1 kos", qty=(1, "kos"), unit="kos", cats=["zelenjava", "vecerja"],
     aliases=["solata", "solate", "solato", "zelena solata", "glavnata solata", "frišno"],
     price=99, kind="loyalty", regular=139, disc=28,
     quote="SLOVENSKE SOLATE FRIŠNO 1 kos CENEJE 28% redna cena 1,39 s SPAR plus kartico 0,99",
     rank=27, img=("render", [700]))
prod(id="sb-grozdje-500g", page=10, anchor="BELO GROZDJE", name="Belo grozdje brez pečk", brand="S-BUDGET", line="S-BUDGET",
     descriptor="pakirano", pack="500 g", qty=(500, "g"), cats=["sadje"],
     aliases=["grozdje", "grozdja", "belo grozdje", "grozdje brez pečk", "grozdje brez peck"],
     price=169, quote="S-BUDGET BELO GROZDJE BREZ PEČK pakirano, 500 g 1,69", vnote=S_NOTE, rank=28, img=("render", []))
prod(id="piscancji-file-1kg", page=12, anchor="PIŠČANČJI FILE", name="Slovenski piščančji file IK", brand=None, line=None,
     descriptor="postrežno", pack="1 kg", qty=(1, "kg"), unit="kg", cats=["meso", "vecerja"],
     aliases=["piščanec", "piščančji file", "piščančje prsi", "file", "piščančjega fileja", "piščančje meso", "piscanec"],
     price=849, kind="loyalty", regular=1179, disc=27,
     quote="SLOVENSKI PIŠČANČJI FILE IK postrežno, 1 kg CENEJE 27% redna cena 11,79 s SPAR plus kartico 8,49",
     vextra="Postrežno: cena velja za 1 kg.", rank=29, img=("render", []))
prod(id="mleto-meso-480g", page=11, anchor="MLETO MEŠANO", name="Mleto mešano meso", brand="SPAR", line="SPAR",
     descriptor="svinjsko in goveje, pakirano", pack="480 g", qty=(480, "g"), cats=["meso", "vecerja"],
     aliases=["mleto meso", "mletega mesa", "mleto", "mešano meso", "meso za bolognese", "mleto mešano meso", "faširano"],
     price=399, quote="SPAR MLETO MEŠANO MESO pakirano, 480 g 3,99", rank=30, img=("render", []))
prod(id="sb-hrenovke-500g", page=13, anchor="PARTY", name="Hrenovke Party hot dog", brand="S-BUDGET", line="S-BUDGET",
     descriptor=None, pack="500 g", qty=(500, "g"), cats=["mesni-izdelki", "vecerja"],
     aliases=["hrenovke", "hrenovk", "hrenovka", "hrenovko", "hot dog", "party hrenovke", "sbudget hrenovke"],
     price=299, quote="S-BUDGET HRENOVKE PARTY HOT DOG 500 g 2,99", vnote=S_NOTE, rank=31, img=("render", []))
prod(id="piscancji-mini-file-400g", page=11, anchor="MINI FILE", name="Piščančji mini file IK", brand="SPAR", line="SPAR",
     descriptor="pakirano", pack="400 g", qty=(400, "g"), cats=["meso", "vecerja"],
     aliases=["mini file", "piščančji mini file", "piščančji fileji", "piščanec", "piščančje meso", "piscancji file"],
     price=479, quote="SPAR PIŠČANČJI MINI FILE IK pakirano, 400 g 4,79", rank=32, img=("render", []))

# ----------------------------------------------------------------------------- recipes
RECIPES = [
    {
        "id": "vecerja-za-dva-zrezki-gobova-omaka",
        "title": "Svinjski zrezki v gobovi omaki s pečenim krompirčkom",
        "kind": "dinner", "servings": 2, "budgetCents": 1000, "minutes": 35,
        "ingredients": [
            {"offerId": "offer-sb-zrezki-500g-4026", "requiredQuantity": "500 g (2 × 250 g)", "packsNeeded": 1,
             "conversionNote": "En 500 g paket zadošča za dve porciji po 250 g."},
            {"offerId": "offer-sb-pommes-1kg-4026", "requiredQuantity": "približno 400 g", "packsNeeded": 1,
             "conversionNote": "Kupiti je treba cel 1 kg paket; približno 600 g ostane v zamrzovalniku."},
            {"offerId": "offer-sampinjoni-250g-4026", "requiredQuantity": "250 g", "packsNeeded": 1,
             "conversionNote": "Porabiš cel 250 g paket."},
            {"offerId": "offer-smetana-kuho-200g-4026", "requiredQuantity": "200 g", "packsNeeded": 1,
             "conversionNote": "Porabiš celo 200 g embalažo."},
        ],
        "pantryAssumptions": ["olje, sol in poper imaš doma", "žlica moke za zgostitev omake je neobvezna"],
        "steps": [
            "Pečico segrej na 220 °C in na pekač razporedi približno 400 g krompirčka; peci po navodilih na embalaži (okoli 20–25 minut).",
            "Zrezke rahlo potolči, solí in popopraj.",
            "V ponvi segrej žlico olja in zrezke na vsaki strani peci 2–3 minute, nato jih odstavi in pokrij.",
            "V isti ponvi na kratko popraži narezane šampinjone, da spustijo in povrejo sok.",
            "Prilij smetano za kuho, po okusu solí in popopraj ter 2–3 minute kuhaj, da se omaka zgosti.",
            "Zrezke vrni v omako za minuto in postrezi s pečenim krompirčkom.",
        ],
    },
    {
        "id": "hiter-zajtrk-skuta-jagode",
        "title": "Hiter zajtrk: kruh s skuto in jagodami",
        "kind": "breakfast", "servings": 2, "budgetCents": None, "minutes": 10,
        "ingredients": [
            {"offerId": "offer-kruh-sendvic-250g-4026", "requiredQuantity": "4 rezine (približno 100 g)", "packsNeeded": 1,
             "conversionNote": "Kupiti je treba cel 250 g paket; ostanek porabiš za naslednji zajtrk."},
            {"offerId": "offer-sb-skuta-1kg-4026", "requiredQuantity": "približno 200 g", "packsNeeded": 1,
             "conversionNote": "Kupiti je treba celo 1 kg embalažo; približno 800 g ostane v hladilniku."},
            {"offerId": "offer-jagode-250g-4026", "requiredQuantity": "250 g", "packsNeeded": 1,
             "conversionNote": "Porabiš cel 250 g paket."},
        ],
        "pantryAssumptions": ["med ali sladkor po okusu imaš doma (neobvezno)"],
        "steps": [
            "Jagode operi, odstrani peclje in jih nareži na rezine.",
            "Skuto v skledi premešaj z vilicami; po želji dodaj malo medu.",
            "Kruh po želji na kratko popeci v toasterju ali ponvi.",
            "Rezine kruha namaži s skuto, obloži z jagodami in takoj postrezi.",
        ],
    },
    {
        "id": "testenine-z-mesno-omako",
        "title": "Testenine z mesno paradižnikovo omako",
        "kind": "lunch", "servings": 4, "budgetCents": 1000, "minutes": 30,
        "ingredients": [
            {"offerId": "offer-barilla-gran-ruote-500g-4026", "requiredQuantity": "500 g", "packsNeeded": 1,
             "conversionNote": "En 500 g paket zadošča za štiri porcije."},
            {"offerId": "offer-mleto-meso-480g-4026", "requiredQuantity": "480 g", "packsNeeded": 1,
             "conversionNote": "Porabiš cel 480 g paket."},
            {"offerId": "offer-barilla-omaka-olive-400g-4026", "requiredQuantity": "400 g", "packsNeeded": 1,
             "conversionNote": "Porabiš cel 400 g kozarec."},
        ],
        "pantryAssumptions": ["olje, sol in poper imaš doma", "čebula ali česen sta neobvezna"],
        "steps": [
            "V velikem loncu zavri osoljeno vodo in skuhaj testenine po navodilih na embalaži.",
            "Medtem v ponvi segrej žlico olja in na njem 6–8 minut praži mleto meso, da porjavi in razpade.",
            "Mesu prilij paradižnikovo omako, solí, popopraj in na nizkem ognju kuhaj 5 minut.",
            "Testenine odcedi, jih premešaj z omako in postrezi.",
        ],
    },
]

# ----------------------------------------------------------------------------- helpers
doc = pymupdf.open(PDF)


def strip_diacritics(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def expand_aliases(aliases, name, brand):
    out = []
    for a in aliases + [name.lower()] + ([f"{brand.lower()} {name.lower()}"] if brand else []):
        for v in (a.lower(), strip_diacritics(a.lower())):
            if v not in out:
                out.append(v)
    return out


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


_smooth_cache: dict[int, float] = {}


def smoothness(xref: int) -> float:
    if xref not in _smooth_cache:
        pix = pymupdf.Pixmap(doc, xref)
        if pix.colorspace and pix.colorspace.n == 4:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        if pix.alpha:
            pix = pymupdf.Pixmap(pix, 0)
        if pix.n not in (1, 3):
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        a = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n).astype(float).mean(2)
        _smooth_cache[xref] = float(np.abs(np.diff(a, axis=1)).mean() + np.abs(np.diff(a, axis=0)).mean()) if a.size > 4 else 0.0
    return _smooth_cache[xref]


def centre(r):
    return pymupdf.Point((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)


def locate(spec):
    """Return (block rect in PDF pts, cell fill rgb or None, packshot image infos)."""
    page = doc[spec["page"] - 1]
    W, H = page.rect.width, page.rect.height
    infos = [i for i in page.get_image_info(xrefs=True) if i["xref"]]
    if "box" in spec:
        x0, y0, x1, y1 = spec["box"]
        block = pymupdf.Rect(x0 * W, y0 * H, x1 * W, y1 * H)
        fill = None
        cell = block
    else:
        hits = [r for r, t in page_lines(page) if spec["anchor"] in t]
        assert hits, f"anchor not found: {spec['id']}"
        c = centre(hits[0])
        cand = [(r, f) for r, f in page_cells(page) if r.contains(c)]
        assert cand, f"no cell: {spec['id']}"
        cell, fill = min(cand, key=lambda rf: rf[0].width * rf[0].height)
        block = None
    shots = [i for i in infos if cell.contains(centre(pymupdf.Rect(i["bbox"])))
             and i["width"] * i["height"] >= 8000 and smoothness(i["xref"]) >= 2.5]
    if block is None:
        texts = [r for r, t in page_lines(page) if cell.contains(centre(r)) and r.y1 > 0.055 * H]  # skip header band
        content = pymupdf.Rect()
        for r in texts + [pymupdf.Rect(i["bbox"]) for i in shots]:
            content |= r
        block = pymupdf.Rect(cell)
        block.y0 = max(cell.y0, content.y0 - 5)
    return block, fill, shots


def dominant(pixels: np.ndarray):
    """Mean colour of the most common 8-level-quantized bin, plus its share."""
    q = (pixels // 8).reshape(-1, 3)
    vals, inv, counts = np.unique(q, axis=0, return_inverse=True, return_counts=True)
    k = counts.argmax()
    return tuple(int(v) for v in pixels.reshape(-1, 3)[inv.ravel() == k].mean(0)), counts[k] / len(q)


def flood_transparent(img: Image.Image, bgs, tol=24):
    a = np.asarray(img.convert("RGB")).astype(int)
    near = np.zeros(a.shape[:2], bool)
    for bg in bgs:
        near |= np.sqrt(((a - np.array(bg)) ** 2).sum(2)) < tol
    cand = Image.fromarray(np.where(near, 255, 0).astype(np.uint8)).copy()  # copy: detach from numpy buffer
    w, h = cand.size
    px = cand.load()
    border = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    for xy in border:
        if px[xy] == 255:
            ImageDraw.floodfill(cand, xy, 128)
    bgmask = np.asarray(cand) == 128
    alpha = np.where(bgmask, 0, 255).astype(np.uint8)
    # soften the cut edge slightly; feather inward only so no background fringe is added
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


def make_image(spec, block, fill, shots):
    kind = spec["img"][0]
    page_index = spec["page"] - 1
    if kind == "embedded":
        xref = spec["img"][1]
        info = doc.extract_image(xref)
        pix = pymupdf.Pixmap(doc, xref)
        if info.get("smask"):
            pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, info["smask"]))
        if pix.colorspace and pix.colorspace.n == 4:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        if pix.alpha:
            img = img.convert("RGBA")
            prov = f"Embedded PDF image xref {xref} (native {pix.width}×{pix.height} px, with its soft mask as alpha), PDF page {spec['page']}."
        else:
            arr = np.asarray(img.convert("RGB")).astype(int)
            edge = np.concatenate([arr[0], arr[-1], arr[:, 0], arr[:, -1]])
            col, _ = dominant(edge)
            img = flood_transparent(img.convert("RGB"), [col, (255, 255, 255)])
            prov = (f"Embedded PDF image xref {xref} (native {pix.width}×{pix.height} px), PDF page {spec['page']}; "
                    f"flat background ({'#%02x%02x%02x' % col}) flood-filled from the edges to transparency.")
        return trim_resize(img), prov
    if kind == "crop":
        rect = pymupdf.Rect(spec["img"][1])
        pix = doc[page_index].get_pixmap(clip=rect, dpi=300, alpha=False)
        img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        return trim_resize(img), spec.get("imgnote", f"Crop of PDF page {spec['page']}.")
    # render: work on a fresh copy so removed layers don't leak between products
    d2 = pymupdf.open(PDF)
    pg = d2[page_index]
    clip = pymupdf.Rect()
    for i in shots:
        clip |= pymupdf.Rect(i["bbox"])
    clip = (clip + (-2, -2, 2, 2)) & block
    hidden = set(spec["img"][1])
    for i in pg.get_image_info(xrefs=True):
        x = i["xref"]
        if not x or not pymupdf.Rect(i["bbox"]).intersects(clip):
            continue
        if smoothness(x) < 2.5 or x in hidden:
            pg.delete_image(x)
    # remove text and vector art (cell background, price boxes, badges) in the packshot area; keep images
    pg.add_redact_annot(clip + (-1, -1, 1, 1), fill=False)
    pg.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED,
                        text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    dpi = min(600, max(150, int(72 * 900 / max(clip.width, clip.height))))
    pix = pg.get_pixmap(clip=clip, dpi=dpi, alpha=False)
    img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
    arr = np.asarray(img).astype(int)
    bgs = [(255, 255, 255)]
    sc = dpi / 72
    for i in shots:  # background tint baked into each packshot JPEG: sample a band just inside its edges
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
    img = flood_transparent(img, bgs)
    xrefs = ", ".join(str(i["xref"]) for i in shots)
    prov = (f"Clip render of the packshot on PDF page {spec['page']} at {dpi} dpi (embedded image xref {xrefs}); shadow layers, "
            f"text and vector badges removed, background ({', '.join('#%02x%02x%02x' % c for c in bgs)}) flood-filled from the edges to transparency.")
    return trim_resize(img), prov


def offer_for(spec):
    kind = spec.get("kind", "catalog")
    loyalty = kind == "loyalty"
    notes = []
    if spec.get("pc"):
        notes.append(f"natisnjeno tudi »{spec['pc']}«")
    if spec.get("extra"):
        notes.append(f"oznaka »{spec['extra']}«")
    validity = V_CATALOG if spec["page"] in (1, 5) else v_week(HEADER_PAGE[spec["page"]], spec["page"])
    vnotes = [n for n in (spec.get("vnote"), spec.get("vextra")) if n]
    if loyalty:
        vnotes.insert(0, "Znižana cena velja s SPAR plus kartico; redna cena je natisnjena v istem bloku.")
    return {
        "id": f"offer-{spec['id']}-4026",
        "productId": spec["id"],
        "catalogId": CATALOG_ID,
        "priceCents": spec["price"],
        "priceUnit": spec.get("unit", "pack"),
        "priceKind": "loyalty_price" if loyalty else "catalog_price",
        "regularPriceCents": spec.get("regular"),
        "discountPercent": spec.get("disc"),
        "conditions": {"spPlusRequired": loyalty, "couponRequired": False,
                       "note": ("Velja s SPAR plus kartico" + ("; " + "; ".join(notes) if notes else "")) if loyalty else ("; ".join(notes) or None)},
        "validity": validity,
        "sourceQuote": spec["quote"],
        "verification": {"status": "verified", "checkedOn": CHECKED_ON,
                         "method": f"Visual check of rendered PDF page {spec['page']} (200 dpi crop of the offer block) cross-checked with the PDF text layer",
                         "notes": " ".join(vnotes) or None},
    }


# page whose header carries "DO TORKA 6. 10." for each product page (spreads share one header)
HEADER_PAGE = {4: 4, 8: 9, 9: 9, 10: 10, 11: 11, 12: 13, 13: 13, 14: 14, 16: 16, 18: 19, 19: 19, 20: 21, 21: 21, 23: 23}


def write_json_atomic(data):
    tmp = CATALOG_JSON.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, CATALOG_JSON)


def main():
    TMP.mkdir(exist_ok=True)
    PRODUCTS_DIR.mkdir(parents=True, exist_ok=True)
    pages = []
    for i in range(doc.page_count):
        n = i + 1
        full = Image.open(PAGES_DIR / f"page-{n:02d}.webp")
        th = Image.open(THUMBS_DIR / f"page-{n:02d}.webp")
        pages.append({"pdfPageIndex": i, "pdfPageNumber": n, "printedPageLabel": PRINTED_LABELS.get(n),
                      "image": {"src": f"/catalog/pages/page-{n:02d}.webp", "width": full.width, "height": full.height},
                      "thumb": {"src": f"/catalog/thumbs/page-{n:02d}.webp", "width": th.width, "height": th.height},
                      "theme": THEMES.get(n)})
    products, offers, placements = [], [], []
    overlay_boxes: dict[int, list] = {}
    sheet = []
    for spec in P:
        page = doc[spec["page"] - 1]
        W, H = page.rect.width, page.rect.height
        block, fill, shots = locate(spec)
        img, prov = make_image(spec, block, fill, shots)
        out = PRODUCTS_DIR / f"{spec['id']}.webp"
        img.save(out, "WEBP", quality=86, method=6)
        sheet.append((spec["id"], img))
        qty = {"amount": spec["qty"][0], "unit": spec["qty"][1]} if spec.get("qty") else None
        products.append({
            "id": spec["id"], "name": spec["name"], "brand": spec["brand"], "line": spec["line"],
            "descriptor": spec["descriptor"], "packSize": spec["pack"], "quantity": qty,
            "categories": spec["cats"], "aliases": expand_aliases(spec["aliases"], spec["name"], spec["brand"]),
            "image": {"src": f"/products/{spec['id']}.webp", "width": img.width, "height": img.height, "provenance": prov},
            "theme": THEMES.get(spec["page"]), "editorialRank": spec["rank"],
        })
        offers.append(offer_for(spec))
        bx = {"x": round(block.x0 / W, 4), "y": round(block.y0 / H, 4),
              "width": round(block.width / W, 4), "height": round(block.height / H, 4)}
        bx["width"] = min(bx["width"], round(1 - bx["x"], 4))
        bx["height"] = min(bx["height"], round(1 - bx["y"], 4))
        placements.append({"id": f"pl-{spec['id']}-p{spec['page']:02d}", "offerId": f"offer-{spec['id']}-4026",
                           "pdfPageIndex": spec["page"] - 1, "pdfPageNumber": spec["page"],
                           "printedPageLabel": PRINTED_LABELS.get(spec["page"]), "bbox": bx})
        overlay_boxes.setdefault(spec["page"], []).append((spec["id"], bx))
        print(f"{spec['id']:28s} p{spec['page']:02d} {spec['price']:5d}c img {img.width}x{img.height}")
    data = {
        "version": 1,
        "catalog": {"id": CATALOG_ID, "title": "SPAR katalog 40/26", "issueLabel": "40/26", "publishedDate": "2026-09-30",
                    "sourceFile": "260930-1-Katalog_4026.pdf", "pdfUrl": "/catalog/spar-katalog-40-26.pdf",
                    "pageCount": doc.page_count, "pages": pages},
        "products": products, "offers": offers, "placements": placements, "recipes": RECIPES,
    }
    write_json_atomic(data)
    # debug overlays
    for n, boxes in overlay_boxes.items():
        im = Image.open(PAGES_DIR / f"page-{n:02d}.webp").convert("RGB")
        dr = ImageDraw.Draw(im)
        for pid, b in boxes:
            r = [b["x"] * im.width, b["y"] * im.height, (b["x"] + b["width"]) * im.width, (b["y"] + b["height"]) * im.height]
            dr.rectangle(r, outline=(255, 0, 255), width=6)
            dr.rectangle([r[0] + 6, r[1] + 6, r[0] + 8 + 9 * len(pid), r[1] + 26], fill=(255, 0, 255))
            dr.text((r[0] + 8, r[1] + 8), pid, fill="white")
        im.save(TMP / f"overlay-p{n:02d}.png")
    # packshot review sheet: each on white and on #F1F2F1
    cw, ch = 220, 240
    cols = 8
    rows = (len(sheet) + cols - 1) // cols
    sh = Image.new("RGB", (cols * cw, rows * ch * 1), "white")
    for k, (pid, img) in enumerate(sheet):
        tile = Image.new("RGB", (cw, ch), (241, 242, 241) if (k // cols) % 2 else (255, 255, 255))
        im = img.convert("RGBA").copy()
        im.thumbnail((cw - 20, ch - 40))
        tile.paste(im, ((cw - im.width) // 2, 25 + (ch - 40 - im.height) // 2), im)
        ImageDraw.Draw(tile).text((4, 4), pid, fill="black")
        sh.paste(tile, ((k % cols) * cw, (k // cols) * ch))
    sh.save(TMP / "products-sheet.png")
    print("products", len(products), "pages", len(pages), "recipes", len(RECIPES))


if __name__ == "__main__":
    main()
