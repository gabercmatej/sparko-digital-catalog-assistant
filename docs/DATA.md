# Sparko – catalog data & assets

All catalog data lives in **`src/data/catalog.json`** (data version **2**; types: `src/lib/types.ts`, zod schema:
`src/lib/schemas.ts`). Two original leaflets are the source of truth:

| Catalog | Source file (repo root, not deployed) | Served copy | Pages | Validity printed |
| --- | --- | --- | --- | --- |
| `spar-4126` – SPAR katalog 41/26 | `261007-1-Katalog_4126.pdf` | `/catalog/spar-4126/katalog.pdf` | 36 | od srede 7. 10. 2026; product pages »DO TORKA 13. 10.«; printed pages 20–23 (PDF pp. 28–31) »DO TORKA 20. 10.« |
| `interspar-1426` – INTERSPAR katalog 14/26 | `261007-2-Katalog_INTERSPAR_1426.pdf` | `/catalog/interspar-1426/katalog.pdf` | 8 | od srede 7. 10. 2026; food pages »DO TORKA 13. 10.«; pp. 4–7 (non-food) do torka 20. 10.; Tefal items on p. 1/4 »7. 10. do 3. 11. 2026« |

The previous demo catalog (SPAR 40/26, `260930-1-Katalog_4026.pdf`) and its runtime assets were removed from `public/`.
The root PDF and the old scripts (`build_catalog.py`, `render_pages.py`) stay in the repo for history only.

`Catalog.validFrom/validTo` = general validity of the food offers (2026-10-07 → 2026-10-13, from the footnote on SPAR p. 4 and
INTERSPAR p. 2). Only food items from the 13. 10. period were catalogued; the 20. 10. pages are non-food (kitchenware, Tupperware,
textiles, books, advent calendars).

## What is in the dataset

| Item | SPAR 41/26 | INTERSPAR 14/26 | Total |
| --- | --- | --- | --- |
| Leaflet pages (image + thumbnail + theme + printed label) | 36 | 8 | 44 |
| Verified products = offers (exactly one primary offer per product) | 145 | 19 | 164 |
| Placements (one per offer = tappable region in the leaflet) | 145 | 19 | 164 |
| Offers that need the SPAR plus card (`loyalty_price`, regular price printed) | 120 | 17 | 137 |
| Offers with explicit validity (until 13. 10. 2026) | 133 | 16 | 149 |
| Offers with `catalog_default` validity (no own date on the page: 2026-10-07 → 2026-10-13, evidence = footnote) | 12 | 3 | 15 |
| Offers priced per `kg` / `kos` (loose, weighed or counter items) | 29 | 2 | 31 |
| Checked recipes (whole packs) | 3 | | 3 |
| Future promos (DEMO MOCK, see below) | | | 10 |

**History:** the first curated set was 47 products (SPAR 33, INTERSPAR 14). FIX 7 added **117 more verified products** (SPAR +112, INTERSPAR +5)
so that far more of the printed leaflet is tappable (reference case: SPAR p. 1 with Svinjska rebra EU and Radler Cola Limeta). They live in
`scripts/catalog/extra_products_spar.py` / `extra_products_interspar.py` (same facts and the same text-layer assertions as the original entries; helper `q(...)`
in `build_catalog_v2.py`). The original 47 keep editorial ranks 1–47; additions are ranked 48+ (cover first, then page order).
Placements per SPAR page: p1 8, p4 12, p5 11, p6 9, p7 5, p8 8, p9 5, p10 5, p11 4, p12 4, p13 6, p14 10, p15 10, p16 6, p17 6, p18 11, p19 5, p20 1, p22 6, p23 8, p24 5;
INTERSPAR: p1 3, p2 5, p3 6, p8 5.

Category coverage (slug : products): zajtrk 45, vecerja 39, osnovna-zivila 34, mlecni-izdelki 28, pijace 25, pekovsko 24, sladko 18, meso 14, mesni-izdelki 14,
prigrizki 10, ribe 10, zelenjava 9, sadje 8, kruh 7, zamrznjeno 7, namazi 6, omake 6, sir 6, prilogi 5, testenine 4, sladkarije 4, kava 4, zacimbe 3, voda 2, sokovi 1
(only slugs that `categoryLabel` in `src/lib/recommendations.ts` already knows; no new slug was introduced).
137 offers carry a printed `CENEJE x %` / `ZNIŽANI FAVORITI x %` and „redna cena“; 27 are plain prices (S-BUDGET, SPAR/DESPAR own-brand and other items printed without a discount).

**Perutnina Ptuj** (brand `Perutnina Ptuj`; all clean single-pack offers in the leaflet): `piscancje-meso-po-italijansko-800g`
(p. 6, 5,19 €), `stajerski-piscanec-1kg` (p. 6, 5,39 €), `piscancji-medaljoni-ptuj-750g` (p. 15, 6,99 €, frozen). The
»IZDELKI SLIM&FIT PERUTNINE PTUJ – 30 % CENEJE« block on p. 7 is a group offer without a price per pack and was skipped.

## How the data was produced

Scripts live in `scripts/catalog/` (Python 3.12 + PyMuPDF + Pillow + numpy; development-time only, never at runtime):

| Script | Purpose |
| --- | --- |
| `render_pages_v2.py` | Per catalog: pages `public/catalog/<id>/pages/page-XX.webp` (1400 px wide, rendered at 2× then LANCZOS, WebP q78), thumbs `…/thumbs/page-XX.webp` (240 px), `cover.webp` (page 1, 720 px, q80) and a copy of the PDF as `katalog.pdf`. |
| `build_catalog_v2.py` | **Single source of the curated data.** Holds the hand-verified product/offer facts, validity, recipes, editorial order; derives placement boxes and packshots, cross-checks every price against the PDF text layer, writes `catalog.json` atomically and review images to `.tmp/`. |
| `extract_logo.py`, `make_mascot.py` | Brand assets (unchanged; the SPAR logo comes from the 40/26 PDF footer). |
| `inspect_candidates.py`, `dump_text.py`, `images_near.py`, `build_catalog.py`, `render_pages.py` | Legacy 40/26 pipeline and curation helpers, kept for history. |

Run: `python scripts/catalog/render_pages_v2.py` then `python scripts/catalog/build_catalog_v2.py` (set `PYTHONIOENCODING=utf-8` on
Windows). `npm run validate:data` checks everything below.

### Verification method (per offer)

1. (also for the FIX 7 additions) Each block was located by its product-name text; the enclosing **drawn grid cell** of the leaflet is the placement box
   (cells in the top row are cut below the printed header band, y ≥ 5.7 % of the page). Blocks without a drawn cell (cover,
   photo pages, SPAR p. 5 oils, p. 22 lower rows, all INTERSPAR pages) got a manual box checked on the overlay.
2. Every block was **read visually** on the page image and the facts typed by hand: name, brand, pack, price, „CENEJE x %“,
   „redna cena“, „PC“, „s SPAR plus kartico“, S-BUDGET marker, NOVO badge. `sourceQuote` holds the printed wording.
3. The build script **asserts that the typed price, `redna cena x,xx`, `x%` and `PC x,xx` strings are present in the PDF text layer
   inside the block** (all 164 pass; FIX 7: three blocks without a price in the text layer were dropped instead of being entered unchecked). The text layer was only a cross-check, because raw text order is unreliable.
4. Every placement box was drawn on the page image (`.tmp/overlay-<catalog>-pXX.png`) and reviewed; no two boxes on a page overlap.
5. `npm run validate:data` checks schema, IDs, references, per-catalog page bounds, `placement.catalogId == offer.catalogId`,
   assets (exact case, real WebP size), discounts (printed % vs computed, ±2), validity inside the catalog window, isNew/newSource,
   whole-pack recipes and the future promos.

### Conventions and interpretation

- Prices are integer cents. `priceUnit` is `pack` unless the block prints a loose/weighed unit: `kg` is used for belo grozdje,
  Sitarjev hlebec (»750 g; cena na kg«), mandarine, jabolka Zlati delišes and sladki krompir (all SPAR, 1 kg). Recipes only use `pack` offers.
- **SPAR plus:** where the small print says „redna cena X / s SPAR plus kartico“, the big price is a `loyalty_price`
  (`spPlusRequired: true`), `regularPriceCents` is the printed „redna cena“ and `discountPercent` the printed „CENEJE x %“
  (printed values are rounded by SPAR, e.g. 10 % vs computed 11 %; the validator allows ±2 points). INTERSPAR offers use the same
  »s SPAR plus kartico« convention.
- **„PC x,xx“** is printed on many blocks (most likely the lowest price of the last 30 days). It is stored verbatim in
  `conditions.note` (»natisnjeno tudi »PC …««), never used as a regular price. Two blocks print a PC that differs from the card
  price (`kava-barcaffe-classic-200g`: redna 4,75, PC 3,79, card price 3,79; `keksi-leibniz-200g`: redna 2,99, PC 1,49, card price 2,29);
  this is kept verbatim as a note and not interpreted.
- **Validity.** Pages with their own header (»DO TORKA 13. 10.«) are `explicit` 2026-10-07 → 2026-10-13. Printed two-page
  spreads share one header: SPAR pp. 6→7, 8→10, 14→15, 18→19 (printed pages 4–5, 6–7, 8–9, 10–11) and INTERSPAR p. 2→3; the evidence says
  which page carries the date. SPAR p. 20 (»PONUDBA VELJA OD 7. 10. 2026 DO 13. 10. 2026«) is explicit on the page. The covers and SPAR p. 12
  (Vital insert, no header) print no end date of their own and are `catalog_default` with the end date taken from the printed footnote on
  SPAR p. 4 / INTERSPAR p. 2. No end date was invented.
- S-BUDGET items carry no printed discount (regular price and discount `null`).
- `printedPageLabel` is the page number printed in the footer. SPAR pdf pages 1–3, 9, 11–13, 16–17, 21–22, 32–36 and INTERSPAR 1, 8
  print none (`null`); the PDF contains inserts without numbers.
- **Not interpreted / not included (honest list, after FIX 7):** „2+1 / 1+1 GRATIS“ and „ob nakupu x kosov“ multi-buy offers without a per-pack price
  (INTERSPAR Primorska posebna moka, Zvijezda olje, jajca Humek; SPAR kajzerica 2+1) and group offers without a price per pack are skipped.
  **Radler Cola Limeta is catalogued** (SPAR p. 1) because the block prints a per-can price (0,81 €, „30 % ceneje“, redna cena za 1 kos 1,16 €), but the price is a
  **multi-buy price**: it is valid only when buying 24 cans (24 kosov 19,44 €). It is stored as `priceUnit: kos`, 81 / 116, with the condition in `conditions.note` and `verification.notes`.
  Alcohol (beer, wine, spirits), tobacco, appliances/kitchenware (Tefal, textiles), pet food and the weekend/coupon pages (SPAR p. 36) are out of scope.
  Medex health products, Finish (SPAR p. 1: „45 % CENEJE“ group block without a price), and all INTERSPAR pp. 4–7 (their offers run until 20. 10. / 3. 11., beyond the catalog's `validTo` which the data model forbids) are not catalogued.
- **Unmapped printed blocks, per SPAR page, and why** (everything else on the page is a placement):
  p1 Finish (group, no price); p4 – (all priced blocks mapped); p5 –; p6 Bio pakiran piščanec („15 % CENEJE“ only), Amadori panirani izdelki („250 g do 300 g“, range), Huftsteak (weighed „cca 300 g“, regular price only per kg);
  p7 Pečene piščančje prsi, Prekajen vrat, Kranjska klobasa, Prekajena rebra (prices per 100 g with per-kg regular price), Hribovska klobasa/Grajska salama and Slim&Fit (group, no price);
  p8 Kraški zašink („SAMO V INTERSPARIH“); p9 Bio tahini namaz („25 % CENEJE“ only), Ovsena kaša Dr. Oetker (pack „od 50 g do 61 g“); p10 Kajzerica (2+1), To-go sendvič/solata/skodelica (no pack, „od“ price);
  p12 –; p13 –; p14 Alpsko mleko 6 × 1 l (same product line as p. 16, avoided duplicate); p15 Zamrznjena zelenjava Natureta, Cmoki Zlato polje (group, no price);
  p16 –; p17 –; p18 Ketchup Felix (two pack sizes), Instant rezanci Fini Mini (no price); p19 Izdelki Bonduelle, Prepečenec Wasa, Keksi Plazma, Medex block (group/health);
  p20 Paradižnikov koncentrat, Bistre juhe Podravka (group, no price), Mešanica začimb Fant (several pack sizes); p22 Milka čokolada, Biskvitno pecivo Milka, Tuc krekerji
  (the printed price blocks of these three are missing in the PDF text layer, so the price could not be cross-checked; skipped), Merci (range), Čokolada Oreo (range), Keksi Bahlsen, Kava Black'n'Easy/Cappuccino (group, no price);
  p23 100 % sok Superior, Čaji Teekanne, Sirupi Frupi (group, no price); p24 Clipsy, beer and Pittinger/Union alcoholic beers (out of scope or price blocks not unique); p25 wine, spirits, pet food (out of scope); p26–36 non-food, points and coupon pages.
  INTERSPAR: p1 Primorska posebna moka (1+1), leseni valjar (non-food), Tefal; p3 Zvijezda olje and jajca Humek (2+1); pp. 4–7 as above; p8 Pisana solata („od“ price) and the restaurant meals (no pack).
- **FIX 7 conventions:** weighed / counter items („postrežno, 1 kg“, „sveže, postrežno“, kos pršuta) are `priceUnit: kg`, pack „1 kg“. Prices of items that print „PC: x,xx“ with a colon keep that wording in the note.
  Where the printed PC is lower or higher than the card price it is stored verbatim as a note only (Repi kozic, Žitne blazinice Lino, Barcaffè, Leibniz).
  Photo-page items (SPAR pp. 10, 11, cover hero blocks) have a placement over their printed label/price block (plus the photo where it is adjacent) and a rectangular crop of the photo as packshot (photo background kept), as for the INTERSPAR cover.
  Cover hero items use the embedded cover images: Ovsene tortilje use the bag labelled „WRAPS high protein“ (the printed name is „OVSENE TORTILJE 320 g"), Gorčica Estragon the ESTRAGON-SENF tube, Žrebičkovo meso the ŽREBIČEK pack.
- `sitarjev-hlebec-750g`: priced »na kg«; the loaf is 750 g.
- `piscancji-file-pivka-540g`: price is for the XXL pack 540 g (400 g + 140 g GRATIS).
- `piscancji-medaljoni-ptuj-750g`: frozen product; the pack says »Chicken nuggets«, the leaflet text says »PIŠČANČJI MEDALJONI«.
- `skyr-mu-2x140g`, `jogurt`, `jabolka`, … mention »več okusov« only; no flavour is claimed.

### „Novo“ flag (`isNew`, `newSource`)

- `printed_badge` (2): products whose block shows a printed **NOVO** badge – the only two NOVO tokens in the SPAR text layer:
  `ocvirki-ave-100g` (p. 7) and `bio-kombucha-330ml` (p. 13). The INTERSPAR leaflet prints none.
- `demo_editorial` (6): **EXPLICIT DEMO MOCK**, picked by the authors as plausibly seasonal/novel items (Vital line, autumn produce,
  Premium pistachio spread, bio pirin kruh, Skyr). It is **not** printed in the leaflet and must not be presented as a fact from the leaflet:
  `skyr-mu-2x140g`, `sladki-krompir-1kg`, `vital-cajno-pecivo-200g`, `vital-strucka-kurkuma-84g`, `pistacijev-namaz-150g`, `bio-pirin-kruh-600g`.

### Future promos (`src/data/future-promos.json`) – **DEMO MOCK**

Deterministic demo data for „Znižano naslednji teden“ (period 2026-10-14 → 2026-10-20), **not from any leaflet**
(`"mock": true`, note »DEMO MOCK: prihodnje akcije niso iz kataloga …«). 10 promos for 10 existing products: the three Perutnina Ptuj
products plus Nutella, surovo maslo, mandarine, šampinjoni S-BUDGET (SPAR) and jedilna čokolada, tolminska skuta, bio pirin kruh
(INTERSPAR). Rules enforced by the validator: product exists, `catalogId` equals the product's offer catalog, `priceCents` is strictly lower
than the current offer, `regularPriceCents` = the offer's printed regular price (null for S-BUDGET), `discountPercent = round((regular − price)/regular × 100)`,
dates inside the period and after the catalog's `validTo`, unique ids (`fp-<productId>-w42`). The CURRENT price of a product always comes
from its verified catalog offer.

## Recipes (whole packs)

Cost = `packsNeeded × priceCents`. The validator also recomputes every recipe at the **regular** price for card-only lines, so a
recipe stays within budget even without SPAR plus, and rejects non-`pack` offers.

| Recipe | Kind | Servings | With card | Without card | Budget |
| --- | --- | --- | --- | --- | --- |
| Piščanec po italijansko z rižem in brokolijem (Perutnina Ptuj) | dinner | 4 | 8,93 € | 12,23 € | 13,00 € |
| Špageti s paradižnikovo omako in šampinjoni | lunch | 4 | 3,57 € | 4,57 € | 6,00 € |
| Zajtrk: pirin kruh s skuto in jabolki (INTERSPAR) | breakfast | 2 | 7,02 € | 8,67 € | 9,00 € |

Pantry assumptions (oil, salt, pepper, optional garlic/honey) and the quantity-to-pack conversions are stored per recipe.

## Image provenance

- **SPAR logo** (`public/brand/spar-logo.svg`), **mascot** (`public/brand/sparko-mascot.webp`): unchanged, see `extract_logo.py` / `make_mascot.py`.
- **Packshots** (`public/products/<id>.webp`, ≤ 400 px long side, transparent where possible). Each product's exact source is in
  `product.image.provenance`. Methods:
  - *embedded*: the original embedded image with its soft mask as alpha (all INTERSPAR p. 2/3/8 items, Sitarjev hlebec, Barcaffè); a
    mask of a different resolution is brought to the larger size first. Without mask the flat background is flood-filled from the edges.
  - *render* (most SPAR products): on a scratch copy of the page, shadow layers and neighbouring images are removed, text and vector
    art in the packshot area are redacted, the packshot is rendered at up to 600 dpi and the page white plus the JPEG's own tint are flood-filled to transparency.
  - *plain* (belo grozdje): unmodified page clip, because redaction would drop the clipping mask; white flood-filled.
  - *crop* (INTERSPAR cover: jedilna čokolada, pistacijev namaz, vlečeno testo): rectangular crop from the cover photograph, **photo
    background kept** because the packs are part of a photographed scene. The jedilna čokolada crop shows the printed „ODLIČNA KAKOVOST“ badge.
- **Page images / covers**: straight renders of the PDF pages, nothing retouched.

Asset weight: SPAR pages 9.7 MB + thumbs 0.6 MB, INTERSPAR pages 2.1 MB + thumbs 0.1 MB, packshots 1.2 MB, cover images small.
The PDFs (`katalog.pdf`, 24 MB / 12 MB) should be linked, not preloaded. The root PDFs are listed in `.vercelignore`.

## Replacing the catalogs with new leaflets

1. Put the new PDFs in the project root, add them to `CATALOGS` in `render_pages_v2.py` / `build_catalog_v2.py`
   (`id`, file, title, issue, suffix) and add them to `.vercelignore`.
2. `python scripts/catalog/render_pages_v2.py`.
3. Update `PRINTED_LABELS`, `THEMES`, validity constants and header-page maps (`SPAR_HEADER`, `INTERSPAR_HEADER`) in `build_catalog_v2.py`.
4. Locate offers (`dump_text.py`, grep the text layer) and **look at the pages**. Enter every verified product with `prod(...)`
   (`anchor` = unique substring of the name line, or a manual `box`; image method `render`/`embedded`/`plain`/`cropn`). Put recipes in `RECIPES`
   and the order in `RANK_ORDER`.
5. `python scripts/catalog/build_catalog_v2.py`, then review `.tmp/overlay-<catalog>-pXX.png` and `.tmp/products-sheet.png`; the first full run takes ~10 minutes, later runs reuse `.tmp/imgcache` (SPARKO_DRY=1 does a fast locate + text-layer check only); the script prints
   `!! TEXT CHECK` for any typed price that is not printed in the block.
6. Update `src/data/future-promos.json` (or replace it with a real feed) and run `npm run validate:data` (must print `OK`).
