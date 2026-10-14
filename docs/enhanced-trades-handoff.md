# Enhanced trades — cloud agent handoff

**Branch:** `enhanced-trades` (from `origin/main`)  
**Worktree:** `y5ot` (Cursor worktree)  
**Owner:** Guy  
**Last updated:** 2026-10-14

## Goal

Ship **multi-card trades** with server-enforced rules:

- Up to **3 cards per side**
- **AND** (all cards) vs **OR** (pick one on accept) per side
- Legacy **1↔1** trades still work
- **Compose** = simple dropdowns (no card art); **open trades** = card thumbnails
- RTL mobile UI; Hebrew copy where specified

**Do not merge** until Guy signs off on product QA.

---

## What is done

### Server

- `app/server/trade-core.js` — validation, reservations, accept resolution, `TRADE_MESSAGES_HE`, inventory helper
- `app/server/migrations/012_enhanced_trades.sql` — `offered_mode`, `wanted_mode`, card id arrays, accept picks
- `app/server/store.js`, `postgres-store.js` — create/accept/list, migration 012, legacy normalization
- `app/server/app.js` — POST body `{ offered, wanted }` or legacy ids; accept `{ offeredCardId, wantedCardId }`
- `app/server/trade-notices.js` — multi-card received/given arrays
- `app/server/trade-debug-samples.js` — optional QA board (see below)

### Client

- `app/public/trade-compose-ui.js` — shared constants, mode hints, formation summary
- `app/public/index.html` — compose slots, **כולם (וגם) / אחד (או)** toggles with hint text
- `app/public/app.js` — slot UI (set + card dropdowns); give = owned sorted by copy count; want = missing sorted by **holder count** (`/api/card-holders`)
- `app/public/trade-list.js` — AND/OR wanted-side filter; localhost can show unholdable offers
- `app/public/styles.css` — stacked mobile compose, open-trade formation badge

### Tests

- `app/test/enhanced-trades.test.js` — core rules, file store bundles/OR, PGlite migration, legacy
- `app/test/client-contract.test.js` — HTML/CSS/JS contracts updated

### Local QA (optional)

- `docs/qa-enhanced-trades/capture.mjs` — Playwright screenshots 390/320
- `docs/qa-enhanced-trades/seed-four-mode-trades.mjs` — manual reseed (usually not needed)

**Localhost debug board (no script):** run QA server with:

```bash
KLAFI_QA_TRADE_SAMPLES=1 KALPI_DEBUG=1 PORT=8799 node server/index.js
# or the existing inline createKalpiApp command on 8799 with KLAFI_QA_TRADE_SAMPLES=1
```

On **`GET /api/community`** (loopback + debug), the server:

1. Seeds **four** open 2↔2 offers (AND∧AND, AND∧OR, OR∧AND, OR∧OR) if none exist  
2. Grants the viewer cards needed to **accept**  
3. UI shows a **formation badge** on each offer  

Open: `http://127.0.0.1:8799/?view=growth&tab=open-trades`

---

## Still open / verify

- [ ] **Accept QA** for all four formations in browser (OR pick UI + server accept)
- [ ] **Postgres** accept path with full persistence (create + migration tested; accept E2E on real PG if deployed)
- [ ] **Race:** recycle vs open offer (needs 3 copies); double-accept (partially tested)
- [ ] **Achievements / binder counts** after multi-card trades
- [ ] **Tips/tutorial** copy for new compose UI
- [ ] **`messageHe`** on all store-layer accept failures (API often generic today)
- [ ] **Production:** ensure `KLAFI_QA_TRADE_SAMPLES` is **unset** (auto-seed must not run in prod)

---

## Key files map

| Area | Files |
|------|--------|
| Rules | `app/server/trade-core.js` |
| SQL | `app/server/migrations/012_enhanced_trades.sql` |
| API | `app/server/app.js` (trades routes) |
| Compose UI | `app/public/app.js`, `trade-compose-ui.js`, `index.html` |
| Open board | `app/public/app.js` (`tradeRowMarkup`), `trade-list.js` |
| Tests | `app/test/enhanced-trades.test.js` |

---

## Commands

```bash
cd app
npm test
npm run poc   # KALPI_DEBUG=1, default port 4173
```

QA on 8799: use worktree `app` with `dataDir: /tmp/klafi-qa-enhanced`, `debugEnabled: true`, **`KLAFI_QA_TRADE_SAMPLES=1`**.

---

## Suggested cloud agent prompt

Copy into a new **Cloud Agent** on this repo, branch **`enhanced-trades`**:

> Read `docs/enhanced-trades-handoff.md`. Continue enhanced trades: finish browser accept QA for AND/OR combinations, fix any gaps in Postgres accept, keep `KLAFI_QA_TRADE_SAMPLES` dev-only. Do not merge or push without Guy. Run `npm test` in `app/` before handing back.

---

## Git

Push target: **`origin/enhanced-trades`** (create if missing). Base for PR: **`origin/main`**.
