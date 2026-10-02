# Sparko — implementation status

Updated: 2026-10-02 (build session). Resume from here after context compaction.

## Stack (locked)
Next.js 16.3.8 App Router + React 19.2 + TypeScript, CSS Modules + tokens in `src/app/globals.css`, zod 4, `@anthropic-ai/sdk`, vitest, Playwright. One lockfile: `package-lock.json` (npm). Remote `gabercmatej/sparko-digital-catalog-assistant` was empty at start → repo initialized in place (branch `main`).

## Shared contracts (lead-owned — agents must not edit)
- `src/lib/types.ts` canonical models (Product, Offer, Catalog/CatalogPage, Placement, Recipe, SavedItem, Conversation, Message/MessageBlock, ChatRequest/ChatResponse).
- `src/lib/schemas.ts` zod schemas for data + chat API.
- `src/lib/catalog.ts` accessors, formatting, `leafletHref`, recipe totals.
- `src/lib/store/store.ts` + `persistence.ts` single client store (localStorage `sparko:v1`).
- `src/lib/assessment.ts` rule-based assessments.
- `src/components/product/*` ProductTile (square), ProductCard (chat/sheet), ProductActions (two equal buttons).
- `src/components/shell/*` AppShell, Header, BottomNav, Toasts; `src/components/ui/Icon.tsx`.

## Module ownership (subagents)
| Agent | Paths |
| --- | --- |
| A Data | `src/data/catalog.json`, `public/catalog/**`, `public/products/**`, `public/brand/**`, `scripts/catalog/**`, `scripts/validate-data.ts`, `docs/DATA.md` |
| B Chat UI | `src/app/page.tsx`, `src/components/chat/**`, `src/components/sidebar/**`, `src/lib/chat/**`, `src/lib/demo-conversations.ts` |
| C Moj katalog | `src/app/moj-katalog/**`, `src/components/collection/**`, `src/lib/recommendations.ts`, `tests/unit/recommendations.test.ts` |
| D Leaflet | `src/app/letak/**`, `src/components/leaflet/**` |
| E Retrieval/AI | `src/lib/assistant/**`, `src/app/api/chat/route.ts`, `tests/unit/assistant*.test.ts` |

## Progress
- [x] Setup, contracts, store, product card, shell, Domov placeholder
- [x] Agents A–E finished and integrated (data: 32 products, 38 pages, 3 recipes, vector logo, mascot cutout)
- [x] validate:data OK, typecheck, lint, unit 131/131, production build, e2e 11/11 on `next start`
- [x] Visual QA at 360/390/430/desktop (planning/qa-screenshots), QA report (planning/QA-REPORT.md), README
- [x] Local git commit on `main`
- [ ] Push to GitHub (see final notes), Vercel deploy by user, live Anthropic smoke test (needs key), real-phone test

Lead fixes during integration: tile name caron clipping + full-width names, toasts moved below header,
assessment "Dobra izbira zate" hidden for already-saved items, zod refine guard, Message.actions/modeNotice,
closed sidebar shadow/visibility, recommendation test robustness, eslint ignores for scratch dirs.
