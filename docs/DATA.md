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
| Verified products = offers (exactly one primary offer per product) | 33 | 14 | 47 |
| Placements (one per offer) | 33 | 14 | 47 |
| Offers that need the SPAR plus card (`loyalty_price`, regular price printed) | 29 | 13 | 42 |
| Offers with explicit validity (until 13. 10. 2026) | 28 | 11 | 39 |
| Offers with `catalog_default` validity (no own date on the page: 2026-10-07 → 2026-10-13, evidence = footnote) | 5 | 3 | 8 |
| Checked recipes (whole packs) | 3 | | 3 |
| Future promos (DEMO MOCK, see below) | | | 10 |

Category coverage (slug : products): zajtrk 20, pekovsko 11, vecerja 11, osnovna-zivila 10, sladko 8, mlecni-izdelki 8, meso 6,
sadje 4, pijace 4, zelenjava 3, namazi 3 (+ kruh, zamrznjeno, omake, mesni-izdelki, prigrizki, prilogi, testenine, kava, voda).
42 offers carry a printed `CENEJE x %` and „redna cena“; 5 are plain prices (S-BUDGET šampinjoni and svinjske kocke,
SPAR ocvirki / bio kombucha, DESPAR Premium pistacijev namaz).

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

1. Each block was located by its product-name text; the enclosing **drawn grid cell** of the leaflet is the placement box
   (cells in the top row are cut below the printed header band, y ≥ 5.7 % of the page). Blocks without a drawn cell (cover,
   photo pages, SPAR p. 5 oils, p. 22 lower rows, all INTERSPAR pages) got a manual box checked on the overlay.
2. Every block was **read visually** on the page image and the facts typed by hand: name, brand, pack, price, „CENEJE x %“,
   „redna cena“, „PC“, „s SPAR plus kartico“, S-BUDGET marker, NOVO badge. `sourceQuote` holds the printed wording.
3. The build script **asserts that the typed price, `redna cena x,xx`, `x%` and `PC x,xx` strings are present in the PDF text layer
   inside the block** (all 47 pass). The text layer was only a cross-check, because raw text order is unreliable.
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
- **Not interpreted / not included:** `ZNIŽANI FAVORITI` is stored as printed (`sladki-prah-oetker-500g`); „2+1 / 1+1 GRATIS“ and „ob nakupu x kosov“
  multi-buy offers (INTERSPAR Primorska posebna moka, Zvijezda olje, jajca Humek; SPAR kajzerica, Radler Cola) were skipped because
  no single-pack price can be stated honestly; group offers without a price per pack (Slim&Fit Perutnina Ptuj, Bonduelle, Wasa …) were skipped; alcohol,
  tobacco, kitchenware/appliances, textiles and the weekend/coupon pages (SPAR p. 36) are out of scope.
- `sitarjev-hlebec-750g`: priced »na kg«; the loaf is 750 g.
- `piscancji-file-pivka-540g`: price is for the XXL pack 540 g (400 g + 140 g GRATIS).
- `piscancji-medaljoni-ptuj-750g`: frozen product; the pack says »Chicken nuggets«, the leaflet text says »PIŠČANČJI MEDALJONI«.
- `skyr-mu-2x140g`, `jogurt`, `jabolka`, … mention »več okusov« only; no flavour is claimed.
- Cover offers not catalogued because no clean packshot/pack exists: žrebičkovo meso (Vital pack is part of the hero photo), ovsene
  tortilje, gorčica estragon, svinjska rebra EU, Radler, Finish.

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
5. `python scripts/catalog/build_catalog_v2.py`, then review `.tmp/overlay-<catalog>-pXX.png` and `.tmp/products-sheet.png`; the script prints
   `!! TEXT CHECK` for any typed price that is not printed in the block.
6. Update `src/data/future-promos.json` (or replace it with a real feed) and run `npm run validate:data` (must print `OK`).
