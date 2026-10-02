# Sparko – catalog data & assets

All catalog data lives in **`src/data/catalog.json`** (types: `src/lib/types.ts`, zod schema: `src/lib/schemas.ts`).
Source: original SPAR leaflet **`260930-1-Katalog_4026.pdf`** (SPAR katalog 40/26, 38 pages, 595×808 pt). It is a
**historical demo catalog**: offers keep their real printed validity and are never presented as current store prices.

## What is in the dataset

| Item | Count |
| --- | --- |
| Leaflet pages (image + thumbnail + theme + printed label) | 38 |
| Verified products / offers / placements | 32 / 32 / 32 |
| Offers that need the SPAR plus card (`loyalty_price`, regular price printed) | 17 |
| Offers with explicit validity (30. 9.–6. 10. 2026) | 27 (others: `catalog_default` from 30. 9. 2026, no end date printed) |
| Checked recipes (whole packs) | 3 |

Products span S-BUDGET (skuta, pommes frites, salama, svinjski zrezki, borovnice, krompir 5 kg, grozdje, hrenovke,
kava), breakfast (kruh za sendviče, maslo, jajca, trajno mleko, jogurt, sir v rezinah, kakav, jagode, avokado), staples
(moka, testenine, paradižnikova omaka, sončnično olje, riž, koruza), fruit/vegetables (jabolka, šampinjoni, zelje,
solata) and dinner components (piščančji file, mini file, mleto meso, smetana za kuho).

## How the data was produced

Scripts live in `scripts/catalog/` (Python 3.12 + PyMuPDF + Pillow + numpy; development-time only, never at runtime):

| Script | Purpose |
| --- | --- |
| `render_pages.py` | Renders all 38 pages to `public/catalog/pages/page-XX.webp` (1400 px wide, rendered at 2× then LANCZOS-downsampled, WebP q78 m6) and `public/catalog/thumbs/page-XX.webp` (240 px). |
| `extract_logo.py` | Extracts the genuine SPAR logo as vector paths from the footer of PDF page 5 → `public/brand/spar-logo.svg`. |
| `make_mascot.py` | Cuts the Sparko mascot out of `assets/references/reference-2.png` → `public/brand/sparko-mascot.webp`. |
| `build_catalog.py` | **Single source of the curated data.** Holds the hand-verified product/offer facts and recipes, derives placement boxes, renders packshots, writes `catalog.json` atomically, and writes review images to `.tmp/`. |
| `inspect_candidates.py`, `dump_text.py`, `images_near.py` | Curation helpers: locate offer blocks, dump positioned PDF text, list/export embedded images around a region. |

### Verification method (per offer)

1. Each candidate block was located by its product-name text, then the enclosing drawn cell rectangle was taken from
   the PDF vector layer. Blocks without a drawn cell (cover, p. 4, p. 14, p. 23) got a manual box.
2. A 200 dpi crop of every block was **inspected visually** to tie the price to the right pack. The PDF text layer was
   only a cross-check, because raw text order is unreliable.
3. Name, pack, price, "CENEJE x %", "redna cena", "PC" and "s SPAR plus kartico" were typed into `build_catalog.py`
   from the crop. `sourceQuote` holds the printed wording.
4. Every placement box was drawn on the page image (`.tmp/overlay-pXX.png`) and checked visually.
5. `npm run validate:data` checks schema, IDs, references, bounds, assets, discounts, validity and recipe totals.

### Conventions and interpretation

- Prices are integer cents. `priceUnit` is `pack` unless the block prints a loose/weighed unit. `kg` is used for
  Jabolka Gala, Sveže zelje and Piščančji file (postrežno, 1 kg), and `kos` for avokado and solata (1 kos).
- **SPAR plus:** where the small print says "redna cena X / s SPAR plus kartico", the big price is a `loyalty_price`
  (`spPlusRequired: true`). `regularPriceCents` is the printed "redna cena" and `discountPercent` is the printed
  "CENEJE x %". The validator checks that the percentage matches the two prices within ±2 points (printed values are
  rounded by SPAR, e.g. 31 % vs computed 32 %).
- **"PC x,xx"** is printed on some blocks (most likely the lowest price of the last 30 days). It is stored verbatim in
  `conditions.note`, not interpreted and not used as a regular price.
- **Validity.** The cover prints "40/26 PONUDBA KATALOGA VELJA OD SREDE 30.9.2026". Product pages (and two-page
  spreads with one shared header) print "DO TORKA 6. 10.", so those offers are `explicit` 2026-09-30 → 2026-10-06,
  with the evidence text. The cover (p. 1) and the S-BUDGET page (p. 5) print no end date, so they are
  `catalog_default` with `from` 2026-09-30 and `to: null`. **No end date was invented.**
- S-BUDGET items carry no printed discount. Their regular price and discount are `null`.
- `printedPageLabel` comes from the page number printed in the footer (text layer, checked visually). Pages without a
  printed number (1–7, 10, 11, 15, 17, 23, 24, 26, 28, 31, 36–38) have `null`. Page 28 (expected "17") prints none.

### Per-product notes and limits

- `maslo-250g`: the cover offer has no drawn cell. Its image is a rectangular crop from the cover photo (see below).
- `sir-rezine-150g`: the picture shows several DESPAR cheeses (maasdam, edamec, ementalec …), but only
  "SIR v rezinah, 150 g" is printed. We do not claim which varieties are included.
- `jogurt-mu-1kg`: one price for 1,3 % or 3,2 % m. m.
- `moka-manitoba-1kg`: one price for type »0« or »00«.
- `sb-krompir-5kg`, `jabolka-gala-1kg`, `zelje-1kg`, `solata-frisno-kos`: Slovenian origin is printed
  ("Slovenija – moja dežela" badge or name) and noted only as a descriptor.
- `piscancji-file-1kg` is a counter (postrežno) price per kg.
- Skipped on purpose: group offers without a single pack ("vse hrenovke", "vsi narezki", "vsi pakirani siri"), the
  hero photo offers (hruške Abate, kajzerice) where no clean packshot exists, alcohol, pet food, non-food, and
  weekend/coupon-only offers on p. 38.

## Recipes (whole packs)

Cost = `packsNeeded × priceCents`. The validator also recomputes every recipe at the **regular** price for card-only
lines, so a recipe stays within budget even without SPAR plus.

| Recipe | Servings | With card | Without card | Budget |
| --- | --- | --- | --- | --- |
| Svinjski zrezki v gobovi omaki s pečenim krompirčkom | 2 | 8,36 € | 9,36 € | 10,00 € |
| Hiter zajtrk: kruh s skuto in jagodami | 2 | 7,36 € | 7,56 € | – |
| Testenine z mesno paradižnikovo omako | 4 | 8,47 € | 9,37 € | 10,00 € |

Pantry assumptions (oil, salt, pepper, optional flour/honey/onion) and the quantity-to-pack conversions are stored per
recipe.

## Image provenance

- **SPAR logo** (`public/brand/spar-logo.svg`): genuine vector artwork. The 7 filled paths (red bar, white letters
  S-P-A-R, green roundel with tree, white inner disc) were copied coordinate-for-coordinate from the footer of PDF
  page 5 (area x 429–481 pt, y 786–796 pt). The INTERSPAR logo next to it and the white backing rectangle are
  excluded. The viewBox is trimmed to the artwork with 0.12 pt padding. Aspect ratio ≈ 5.82 : 1. No raster, no
  redraw.
- **Mascot** (`public/brand/sparko-mascot.webp`, 375×360, transparent): cut out of the provided reference
  `assets/references/reference-2.png` (red "Vse najboljše ponudbe" banner, mascot area x 0–250 px). The method grows
  a region from the image border over the smooth red background, which stops at the character's dark outlines. Two
  seeds remove the enclosed red pocket inside the basket handle, and only the largest component is kept (this drops
  the loose sparkle strokes). The alpha is feathered inward by about 1 px and the image upscaled about 1.6× with
  LANCZOS to 360 px tall. The character is not redrawn. A faint red fringe is only visible on very dark backgrounds.
  `reference-1.png` (on white) was not used: it is about 110 px tall and washed out.
- **Packshots** (`public/products/<id>.webp`, ≤ 400 px long side). Each product's exact source is in
  `product.image.provenance`. There are three methods:
  - *embedded*: the original embedded image (skuta, trajno mleko, kava, olje, riž), using its soft mask as alpha where
    present, otherwise flood-filling its flat background.
  - *render* (most products): on a scratch copy of the page, shadow layers are removed (blurred images, detected by
    low gradient energy) and the text and vector art in the packshot area (price boxes, badges, cell background) are
    redacted. The packshot is then rendered at up to 600 dpi, and the page white plus the JPEG's own background tint
    are flood-filled from the edges to transparency. This respects the leaflet's clipping paths and multi-image
    composites. No neighbouring prices or labels are included.
  - *crop*: `maslo-250g` only, a rectangular crop of the pack from the cover photo (embedded hero image xref 7431).
    The wooden photo background is kept, because the pack is part of a photographed scene.
- **Page images**: straight renders of the PDF pages, nothing retouched.

Asset weight: pages 9.7 MB (38 × ~255 KB), thumbs 0.7 MB, packshots 0.8 MB, brand 48 KB. The original PDF
(`public/catalog/spar-katalog-40-26.pdf`) is about 28 MB and should be linked, not preloaded.

## Replacing the catalog with a new leaflet

1. Put the new PDF in the project root. Point `PDF` in `scripts/catalog/*.py` to it and copy it to
   `public/catalog/<name>.pdf`.
2. `python scripts/catalog/render_pages.py` renders all pages and thumbnails.
3. Update `PRINTED_LABELS`, `THEMES` and `HEADER_PAGE` (which page header carries the validity) in
   `build_catalog.py`. Also update the catalog metadata (`CATALOG_ID`, title, issue, dates, `V_CATALOG`/`v_week`
   evidence).
4. Find offers with `python scripts/catalog/inspect_candidates.py` (edit `CANDIDATES`) and **look at the crops** in
   `.tmp/crops/`.
5. Enter every verified product with `prod(...)` in `build_catalog.py`. Use `anchor` (a unique substring of the name
   line) or a manual `box`, and pick an image method. Put recipes in `RECIPES`.
6. `python scripts/catalog/build_catalog.py`, then review `.tmp/overlay-pXX.png` and `.tmp/products-sheet.png`.
7. `npm run validate:data` must print `OK`. Small fixes can also be made directly in `catalog.json` (re-running the
   builder overwrites them), followed by the validator.

Logo and mascot only need re-running if their sources change (`extract_logo.py`, `make_mascot.py`).
