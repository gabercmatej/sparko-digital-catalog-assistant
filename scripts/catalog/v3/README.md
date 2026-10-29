# V3.1 catalog indexing — rules for every indexer

Goal: every real, priced product offer printed in the six PDFs becomes ONE verified offer spec in
`scripts/catalog/v3/offers/<catalogId>[.<part>].json`. Quality beats count: never invent a name, price, regular price,
discount, pack size or date. Anything that cannot be read with certainty goes to `excluded` with the reason.

The spec format is documented at the top of `build_offers.py` (read it first). `offers/spar-online-4426.json` is a
complete worked example. Run every command from the repository root. Python: `python` (PyMuPDF + Pillow installed).

## Workflow per PDF page
1. `python scripts/catalog/v3/inspect_page.py <catalogId> <page> --draft`
   Prints the page's text lines, price prints, images (xref + box), drawn cells (all normalized 0..1) and heuristic
   DRAFT offers (price + nearest name block + a box). The draft pairing is often wrong: treat it as a hint only.
2. Look at the page: `Read` `public/catalog/<catalogId>/pages/page-NN.webp` (1400 px). For coordinates use the grid
   render printed by step 1 (`.tmp/v3/grid/...png`, lines every 0.05) and zoom in on dense areas with
   `inspect_page.py <catalogId> <page> --crop x0,y0,x1,y1` (writes a zoomed PNG with 0.01 ticks; Read it).
3. Write the offers for the page into your JSON file. Add a `pages` entry for EVERY page of your range, with
   `offersOnPage` = number of priced offers printed on that page (= your offers on the page + your excluded on the page;
   0 for recipe / brand / editorial pages without prices) and a short `theme` (e.g. "Sveža izbira", "Mlečni izdelki").
4. Validate often: `python scripts/catalog/v3/build_offers.py <catalogId> --pages=<lo>-<hi>` (fast, text-layer check).
5. Every ~5 pages render: `... --pages=<lo>-<hi> --preview`, then Read `.tmp/v3/overlay/<catalogId>-pNN.png`
   (magenta = your offer boxes, cyan = image crops) and `.tmp/v3/sheet-<catalogId>-pages<lo>-<hi>-N.png` (packshots)
   and fix wrong boxes / bad crops (crop must show the product only, not the price badge or a neighbour).

## Facts
- `price`: the big promotional price, in cents. If the label says »s SPAR plus kartico« → `priceKind: "loyalty_price"`,
  `spPlus: true`. Without a card condition → `catalog_price`. Coupon-only prices → `coupon_price`, `coupon: true`.
- `regular` only when »redna cena X« (or a struck-through old price) is printed for THIS offer. `discount` only when a
  percentage (»CENEJE 25%«, »-35%«) is printed for THIS offer. `pc`: the printed »PC x,xx« text (lowest price of the last
  30 days) exactly as printed, else null. Never compute a missing regular price or percentage.
- Prices per kg (»cena za kg«, »1 kg«, loose fruit / vegetables / deli counter »postrežno«) → `priceUnit: "kg"`; pack
  stays what is printed (e.g. "1 kg" or "750 g; cena na kg" in descriptor/conditionNote). Per piece → `kos`.
- Multi-buy / gratis conditions (»1+1 GRATIS«, »ob nakupu 2 kosov«, »2 za«) → `conditionNote` with the printed wording;
  the price stays the printed price.
- `qty`: total quantity for the price ("2 × 140 g" → [280, "g"]; "6 × 1,5 l" → [9, "l"]); null when not printed.
- One printed block with several flavours / variants at one price (»več vrst«, »različni okusi«) = ONE offer; put the
  variants in `descriptor`. Two different prices = two offers.
- The same product printed twice in one catalog (cover + inner page) = two offers with distinct keys (append `-pNN`).
- `isNew: true` only when a NOVO badge is printed on the offer (include NOVO in `printed`).
- `unitPrice` only when a price per kg / l is printed (e.g. »1 kg = 7,98 €«).
- `availability`: printed restriction of THIS offer (MEGA SPAR: the store-type icons/labels printed at the product,
  e.g. »Samo v INTERSPAR in večjih SPAR trgovinah«). Catalog-wide restrictions (DESPAR Koper, SPAR Online) are added
  automatically — do not repeat them.
- `validity`: ONLY when the offer / its block / its page header prints dates that differ from the page rule shown by
  `inspect_page.py` (»# validity by rule«). Quote the printed text in `evidence` with the PDF page number, e.g.
  `{"from": "2026-10-29", "to": "2026-10-30", "evidence": "PDF str. 44: »PONUDBA VELJA 29. IN 30. 10. 2026.«"}`.
  Never extend a date. Year is 2026.
- Names: Slovenian, sentence case ("Suhe slive brez koščic"), brand in `brand` (not repeated in name unless it is part
  of the product name). `printed`: the block's printed text in reading order (shortened with … is fine) incl. prices.
- `categories`: from `CATEGORIES` in `common.py`; primary first and never a meal tag; add meal tags (zajtrk, kosilo,
  vecerja, malica, prilogi) where natural. `aliases`: 4–12 lowercase search words incl. Slovenian inflections
  (mleko, mleka, mlekom), generic words (jogurt, sir) and the brand.
- `box`: the whole printed offer block (product photo + name + price badge). Use the drawn cell when the draft says
  "drawn cell" and it matches; otherwise compute from the printed coordinates. Boxes of neighbours must not overlap
  noticeably.
- `image`: `{"xrefs": [..]}` when the packshot is an embedded image listed for the page (cleanest, transparent
  background; list only that product's images); else `{"crop": [x0,y0,x1,y1]}` tight around the product photo.
  Check the sheet: if an xrefs render is empty/garbled, switch to crop.
- `anchor`: a distinctive piece of the printed NAME line (uppercase as printed); it must lie inside `box`.
  Pages without a text layer: `"textCheck": false` and say so in `notes`.

## Exclude (list in `excluded` with page, printed text and reason) — never as offers
- price or name not legible with certainty; coupons without a product price (»-25 % s kuponom« on a range);
  loyalty-point collections without a product price; recipe ingredient lists; »vse vrste …« range discounts without
  one product and price; services / gift cards.

## Do not
- edit anything outside your own offers file(s); do not run the full build without `--pages`; do not touch
  `src/`, tests, git, or other catalogs' files. Do not delete `.tmp/v3` files of others.
