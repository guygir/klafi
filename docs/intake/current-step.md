# Current step

- **Round:** Expanded PoC Content Studio
- **Status:** implemented and locally verified
- **Last updated:** 2026-09-09
- **Review URL:** `http://127.0.0.1:4173`
- **Canonical source:** `app/data/studio-content.json`

## Implemented

- Final 14-party, 51-politician roster.
- 41-record public quote archive imported as discovery leads with both archive and upstream URLs.
- 149 sourced member quote cards selected after a deeper coalition meme pass; four sparse C/UC slots remain explicitly blank.
- Four shared commons, 14 symbol cards, and 28 sourced platform/policy cards.
- Active 195-card runtime catalog with dynamic binder filters and server-authoritative 3C/2U/1R packs.
- Party → politician → C/UC/R Studio editor with quote, classification, date, source, context, scene, flavor, identity reference, review state, and Weave metadata.
- Debug-only atomic per-card saving; production mode is read-only.
- Per-card and per-politician Weave copy plus party JSON export.
- Sourced visual-meme moments and alternate quote corpora visible per politician in Studio.
- Feiglin’s Common card now depicts the sourced feet segment and uses the requested in-video sentiment as a visibly asterisked attributed paraphrase; no verbatim public transcript was found.
- Smotrich’s Common card now uses the requested “גרנדמייזר” phonetic meme treatment, also visibly asterisked rather than presented as a literal transcript.
- Ben Gvir’s Uncommon card now uses his sourced quotation about the proposed crocodile perimeter at Ketziot Prison; this corrects the earlier mistaken footwear interpretation.
- 78-feature PoC slice inventory with 1–5 difficulty, effort, boundary, risk, and recommendation.
- Quote-focused backs, explicit WhatsApp sharing, seven server-derived achievements, real local faction/collection boards, and persistent simulated asynchronous trades.
- Four pack-ineligible Specials showcases: Prestige, Mouthpieces, Satire, and Legendary/Aces.
- Player-facing PoC is now Hebrew-first and RTL; Studio remains an English debug surface.
- Today uses the selected Studio card composition and automatically reveals quote → party/slot → name → portrait inside the card. There is no forced back flip or duplicate quote below it.
- Bottom navigation now exposes Today, Binder, Achievements, Events, and Community. Earned badge medallions also sit at the top of Binder.
- Specials are permanent Binder collectibles obtained only through server-timed Events. The active Aces launch event grants one free one-card event pack per Jerusalem calendar day.
- Distinct-card levels, a visual level-up reward dialog, and a daily “most cards from this party” local leaderboard are live PoC slices; level rewards remain display-only.
- Hebrew quality pass removes mixed-version assets by revalidating HTML/CSS/JS together and versioning the player bundle.
- Runtime cards now carry canonical Hebrew titles, set/type labels, and printed identifiers; the same completed front is used in Today, Binder thumbnails, Binder detail, Events, trades, and sharing.
- The compact level strip is now only pack reward icon + numeric progress (`0/5`) + level number.
- Community trades now filter set first and then card for both sides. The daily challenge always shows honest participants, including zero scores, and highlights the current anonymous player.
- Configurable framed reveal: quote → party/slot → name → portrait.
- Dated fallback snapshots for the former Alpha catalog and guided demo.
- Automated integrity, API-gating, prompt, roster, sparse-slot, pack, and client-contract tests.

## Editorial contract

The disclosed rule is active: governing/right-bloc figures receive critical selections and current-opposition figures favorable selections. Source wording, classification, context, and provenance remain stored independently. Generated props and scenes are explicitly labeled as editorial symbolism, not documentary evidence.

## Remaining public-release review

- Final ballot letters and list approvals still require CEC confirmation.
- Every generated portrait requires human likeness and selected-file license review.
- Identity-page references that are not direct Commons file pages should be replaced with the exact image used before export.
- Policy cards labeled as dated party statements must not be presented as current manifestos.
- Return, share, referral, and trading behavior still require live cohort measurement.

## Review outputs

- `docs/product/expanded-poc-content-studio-review.md`
- `docs/product/poc-feature-slice-inventory.json`
- `docs/review/expanded-content-audit.md`
- `docs/intake/research/`
- `app/data/studio-content.json`
- `app/data/cards-expanded.json`
- `app/data/cards-alpha-28-2026-09-09.json`
