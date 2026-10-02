# Sparko — digitalni pomočnik za SPAR katalog (MVP)

Mobilni slovenski nakupovalni pomočnik **Sparko** z osebnim katalogom (»Moj katalog«) in interaktivnim originalnim SPAR letakom. Demo uporablja zgodovinski katalog **SPAR 40/26 (30. 9. 2026)**; cene in datumi so iz tega kataloga, ne aktualne cene v trgovini.

Osrednja pot: vprašaš za skuto → preverjena kartica izdelka → »Dodaj v Moj katalog« → izdelek je v Mojem katalogu s pojasnjenimi priporočili → »Poglej v SPAR katalogu« odpre originalno stran letaka z označenim izdelkom → dodajanje/odstranjevanje v letaku se takoj pokaže povsod → po osvežitvi vse ostane.

## Lokalni zagon

Zahteve: Node.js ≥ 20.9 (preizkušeno z 22.17), npm.

```bash
npm ci
cp .env.example .env.local   # neobvezno – brez ključa deluje omejeni način
npm run dev                  # http://localhost:3000
```

## Skripte

| Ukaz | Namen |
| --- | --- |
| `npm run dev` | razvojni strežnik |
| `npm run build` / `npm start` | produkcijska gradnja / zagon |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm test` | enotni testi (Vitest) |
| `npm run test:e2e` | E2E testi (Playwright; najprej `npm run build`, nato zažene `next start` na vratih 3100) |
| `npm run validate:data` | preveri `src/data/catalog.json` (sheme, ID-ji, poti slik, meje pravokotnikov, recepti) |

Za E2E prvič namesti brskalnik: `npx playwright install chromium`.

## Okoljske spremenljivke

| Spremenljivka | Obvezna | Pomen |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | za živi AI | strežniški ključ za Anthropic API. Brez njega Sparko deluje v **omejenem načinu**. |
| `AI_MODEL` | ne | model, privzeto `claude-haiku-4-5` (hiter). Kakovostnejša možnost: `claude-sonnet-5-5`. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | za živi AI v produkciji | trajna omejitev uporabe (Upstash Redis REST). Brez njiju je živi AI v produkciji izklopljen. |
| `ALLOW_UNLIMITED_AI` | ne | `true` vklopi živi AI v produkciji brez trajne omejitve (samo za zaprte predstavitve). |

Ključi ostanejo na strežniku; nikoli jih ne dodaj v `NEXT_PUBLIC_*` spremenljivke ali v repozitorij.

## Živi AI in omejeni način

- **Živi način** (`ANTHROPIC_API_KEY` + omejevalnik ali `ALLOW_UNLIMITED_AI=true`): model razume vprašanje in sestavi kratek odgovor. Cene, odstotki, datumi in seštevki se vedno vstavijo iz preverjenih podatkov; izhod modela se preveri s shemo, dovoljeni so le ID-ji pridobljenih izdelkov.
- **Omejeni način** (brez ključa, ob izpadu, časovni omejitvi ali neveljavnem izhodu): deterministično iskanje, kartice izdelkov, shranjevanje, priporočila, preverjeni recepti in letak delujejo naprej. Odgovor je jasno označen kot »Omejen način«.
- Klik na izdelek nikoli ne potrebuje modela.

## Podatki

- En vir podatkov: `src/data/catalog.json` (Catalog, Product, Offer, Placement, Recipe; cene v centih, normalizirani pravokotniki 0–1, PDF-indeks ločen od natisnjene številke strani).
- Pripravljene slike strani: `public/catalog/pages/`, sličice `public/catalog/thumbs/`, slike izdelkov `public/products/`, izvirni PDF `public/catalog/spar-katalog-40-26.pdf`.
- Postopek priprave, preverjanja in zamenjave kataloga: [`docs/DATA.md`](docs/DATA.md). Po vsaki spremembi zaženi `npm run validate:data`.
- Produkcija ne potrebuje Pythona, OCR-ja ali zapisljivega diska.

## Ponastavitev demo stanja

Podatki testerja so samo v brskalniku (`localStorage`, ključ `sparko:v1`). V meniju → Nastavitve:
- »Ponastavi Moj katalog« izprazni shranjene izdelke (pogovori ostanejo),
- »Izbriši moje pogovore« izbriše testerjeve pogovore (izbor ostane).
Primeri pogovorov so statični in vedno ponovljivi.

## Objava na Vercelu

1. Na Vercelu izberi **Add New → Project** in uvozi GitHub repozitorij `gabercmatej/sparko-digital-catalog-assistant`.
2. Framework: Next.js (samodejno), Root Directory: koren repozitorija, privzeti ukazi (`npm run build`).
3. V **Settings → Environment Variables** dodaj po želji `ANTHROPIC_API_KEY`, `AI_MODEL` ter `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (ali začasno `ALLOW_UNLIMITED_AI=true`).
4. Deploy. Za predstavitev preveri **Deployment Protection**, da povezava deluje v zasebnem oknu na telefonu brez prijave v Vercel.

Brez ključa aplikacija deluje v omejenem načinu.

## Struktura

```
src/app/            strani: / (Sparko), /moj-katalog, /letak, /domov, /api/chat
src/components/     shell, product (kartica, ploščica, gumba), chat, sidebar, collection, leaflet
src/lib/            types, schemas, catalog, store (localStorage), assessment, recommendations, assistant (iskanje, nameni, model)
src/data/           catalog.json
scripts/            priprava in preverjanje podatkov
tests/              unit (Vitest), e2e (Playwright)
planning/           načrt, status izvedbe, QA poročilo
```
