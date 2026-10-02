# Sparko MVP — QA report

Date: 2026-10-02. Environment: Windows 10, Node 22.17, Next.js 16.3.8, Chromium (Playwright 1.63).

## Commands and results

| Command | Result |
| --- | --- |
| `npm run validate:data` | OK – 32 products, 32 offers, 32 placements, 38/38 pages, 3 recipes, no errors/warnings |
| `npm run typecheck` | pass (0 errors) |
| `npm run lint` | pass (0 problems) |
| `npm test` (Vitest) | **131/131 pass** – 8 files: assistant (43), assistant-llm (35, mocked provider), recommendations (11), chat (11), leaflet geometry + pages (19), persistence (7), store (5) |
| `npm run build` | pass – `/`, `/moj-katalog`, `/letak`, `/domov` static; `/api/chat` dynamic |
| `npm run test:e2e` (against `next start`, no API key) | **11/11 pass** (`tests/e2e/journey.spec.ts`) |
| Client bundle scan for `ANTHROPIC_API_KEY`, `UPSTASH_REDIS_REST_TOKEN`, `sk-ant` in `.next/static` | 0 matches |
| Scan of `src/` for Windows/OneDrive paths | 0 matches |

## E2E coverage (passed)

- Core journey: "Koliko stane skuta?" → card with **3,38 €, 1 kg, PDF-stran 5** → save (no duplicate) → carousel and card show saved state → Moj katalog ("Tvoji izdelki · 1", recommendations) → "Odpri SPAR letak" → saved overlay with "V Mojem katalogu" → add pommes in leaflet → remove skuta in leaflet (highlight disappears immediately) → Moj katalog and old chat card update → reload restores conversation and selection.
- Both product actions have identical width/height (≥ 44 px), also in the saved state.
- All four suggestions send a message and get an answer.
- Dinner for two: whole-pack total inside 10 € with a visible pantry assumption.
- Unknown product ("kaviar") → honest text, no product card.
- Follow-up "kje je v letaku?" after "koliko stane skuto" → PDF-stran 5.
- Domov placeholder keeps chat and selection state.
- "Pošlji PDF na e-pošto" shows only the availability text; no input, no mailto, no POST request.
- Demo conversation: opening saves nothing; continuing forks into a user conversation (`forkedFrom: demo-…`).
- 360 / 390 / 430 px: no horizontal overflow on `/`, `/moj-katalog`, `/letak`; every product tile exactly square with 0 px radius; assistant reply has no avatar gutter; composer doesn't overlap the bottom nav.

## Unit-tested (selected)

Slovenian variants (skuta/skute/skuto/sbudget skuta/typo), cheaper follow-up, "dodaj to" only with an unambiguous context, read-only questions never save, discount ranking only from printed verified percentages (S-BUDGET skuta excluded), meal totals with whole packs and card/no-card totals, provider: valid output → live with placeholders resolved; malformed JSON, invented price, save claim, timeout, missing key → fallback; IDs outside candidates dropped; prompt-injection text in data/user message cannot change prices; production without Upstash disables live AI; burst limiter; persistence corrupt/quota/migration; store idempotent save, reset selection keeps conversations, deleting conversations keeps selection; recommendations exclude saved items, reasons match signals, deterministic, max 6, diversified; leaflet zoom/pan/tap geometry and filtering.

## Visual QA (browser screenshots)

`planning/qa-screenshots/`: welcome at 360/390/430 + desktop, skuta card, saved state, discounts, dinner recipe, breakfast, Moj katalog, leaflet page 5 with saved skuta, Domov. Compared with `assets/ui/sparko-ui-direction-v3.png`: same hierarchy (compact SPAR logo, 96 px square carousel, ~110 px mascot, restrained title, four quiet suggestion rows, pill composer, three-tab nav). Final overrides applied (no reply avatar, two equal buttons, email placeholder). Fixed during QA: carons on uppercase tile names were clipped; carousel names broke mid-word; closed sidebar shadow leaked onto the left edge; toasts covered sheet actions (moved under the header); "Dobra izbira zate" appeared on already-saved items.

Leaflet (verified by the leaflet agent with Playwright scripts, screenshots in `.tmp/`, not committed): overlay alignment at fit, 2.5× zoom + pan, 360/430 px and landscape; green outline + white contrast edge visible on the green S-BUDGET page; pulse runs twice and stops (~2.9 s); `prefers-reduced-motion` disables it; unsaved target shows a temporary dashed outline without saved badge; filter handles removing the last saved item.

## Data

32 verified products (S-BUDGET, breakfast, dairy, staples, vegetables/fruit, meat). Each price was tied to its pack visually on rendered pages; every bbox was drawn on its page and checked. 17 offers require SPAR plus (regular price printed); 27 have explicit validity 30. 9.–6. 10. 2026; the S-BUDGET/cover offers use the catalog start date with no printed end date (shown as "Velja od 30. 9. 2026"). Recipes: dinner for two 8,36 € (9,36 € without card) ≤ 10 €; quick breakfast 7,36 € (7,56 €); pasta for four 8,47 € (9,37 €) ≤ 10 €. Details and limits in `docs/DATA.md`.

Source-verification limits: maslo packshot is a crop from the cover photo (wood background); skuta/olje/riž/kava embedded images are small (~100–160 px); multi-variant offers (sir v rezinah, jogurt 1,3/3,2 %, moka 0/00) are stored as one product at one printed price; printed percentages may differ by 1 point from the price ratio (SPAR rounding); no curated product appears on more than one page.

## Not tested / requires follow-up

- **Live Anthropic provider: NOT tested** – no `ANTHROPIC_API_KEY` in this environment. All model-path tests use a mocked client; e2e ran in the labeled fallback mode. Run a live smoke test after setting the key (e.g. ask "Kaj je najbolj znižano?" and check the reply is labeled without "Omejen način").
- **Upstash rate limiter: not tested live** (no credentials); logic unit-tested with mocked fetch.
- **Real phone**: on-screen keyboard behavior (visualViewport handling), pinch-zoom/two-finger pan and iOS Safari pointer capture were only simulated (desktop Chromium mobile emulation, mouse events). Test on an actual iPhone/Android before the demo.
- Vercel deployment and anonymous access (Deployment Protection) – to be done by the user.
