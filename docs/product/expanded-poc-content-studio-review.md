# Expanded PoC Content Studio — implementation review

## Run it

```bash
cd app
npm start
```

Open `http://127.0.0.1:4173` and choose **Studio**.

## What is live

- **14 submitted lists and 51 selected politicians** in one canonical source.
- **149 populated quote cards** plus four visible blank slots created by the sparse-card rule.
- **14 symbols, 28 platform/policy cards, and four shared commons**.
- **195 playable cards** after blank quote slots are omitted.
- Daily and demo packs preserve **3 Common / 2 Uncommon / 1 Rare**.
- Binder filters, totals, sources, backs, sharing, art keys, and walkouts derive from the active catalog.
- Quote backs are intentionally compact: quotation, classification/disclosure, and source receipt rather than an additional essay.
- Binder achievements are derived from server inventory and recorded events.
- Growth now includes explicit WhatsApp sharing, a real local faction tally, a real local collection board, and persistent give/want trade offers with clearly labeled simulated acceptance.
- Prestige, Mouthpieces, Satire, and Legendary/Aces have sourced `P`-marked showcase examples in `app/data/specials-content.json`; they remain outside daily odds.

## Hebrew player loop and timed events

- Player navigation is `היום` → `אוסף` → `הישגים` → `אירועים` → `קהילה`; Studio is reached separately as a debug surface.
- The Today reveal now uses the same fixed-zone card selected in Studio. All four information stages run automatically inside the card, followed only by a compact source receipt.
- Specials appear in Binder but cannot enter `generatePack()`. Active windows are configured in `app/data/events.json`; the server permits one one-card event pull per Jerusalem day and keeps the card after the window closes.
- Levels derive only from distinct server-owned inventory. The reward presentation is intentionally visual-only in this PoC.
- The daily party challenge is computed from real dated pack history and counts duplicates; it is not a poll or a fabricated fixture.

## Hebrew quality gate

- Player JavaScript, CSS, JSON, and HTML revalidate together, preventing a new navigation shell from loading with an old card renderer.
- Every runtime card exposes `titleHe`, `setNameHe`, `typeHe`, and a Hebrew `displayCode`; internal IDs remain available only for persistence and Studio.
- Binder thumbnails and detail use the same fixed-zone front as Today. No player-facing back or flip control remains.
- The level strip contains only the pack reward image, numeric within-level progress, and level number.
- Trade selection is set-first on both sides. Daily challenge rows include honest zero scores so a new day never renders as a blank feature.
- Client contracts reject known legacy English copy outside Studio and reject the removed back/flip selectors.

The old 28-card Alpha and its demo are preserved as dated fallback snapshots in `app/data/`.

## Studio review flow

1. Choose a party from the horizontal party register. Each tab shows populated slots versus possible slots.
2. Choose a politician. The status line shows requested letters, list slot, editorial treatment, and evidence grades.
3. Review Common, Uncommon, and Rare together. Blank slots remain visible and cannot produce prompts or enter packs.
4. Review the separate meme-research desk: final cards remain quotations, while sourced non-quote visual moments and alternate candidates stay visible beneath them.
5. Edit the displayed/original quotation, translation, classification, date, source, source quality, context, scene, added flavor, art key, and review state.
6. Record Weave model/version, seed, identity/style reference strengths, and output-review status after generation.
7. Use **Save card**. In debug mode this patches one card and atomically replaces `app/data/studio-content.json`; with `KALPI_DEBUG=0` the mutation endpoint is unavailable.
8. Copy one prompt, concatenate a politician's populated prompts, or export one party's canonical JSON.

Unsaved cards receive a visible gold state and trigger the browser's leave-page warning.

## Reveal and card contract

The selected framed treatment remains:

`empty frame → quotation → Hebrew party + requested letters + slot → Hebrew name → portrait + catalog ID + rarity`

All four delays remain configurable and locally persistent. Rarity is `★ / ★★ / ★★★`; timed Legendary/Aces cards remain outside this base catalog.

## Canonical and generated files

- `app/data/studio-content.json` — editable canonical party, roster, quote, evidence, scene, flavor, art, and review data.
- `docs/intake/research/quote-archive-41.json` — archive discovery leads with upstream source links.
- `docs/intake/research/batch-*.json` — reviewable research batches.
- `docs/intake/research/party-metadata.json` — requested letters, caveats, symbols, and two policy cards per list.
- `app/data/cards.json` — active generated catalog.
- `app/data/cards-expanded.json` — generated expanded catalog artifact.
- `app/data/cards-alpha-28-2026-09-09.json` — fallback Alpha catalog.
- `app/data/demo-pack-alpha-2026-09-09.json` — fallback Alpha demo.
- `docs/review/expanded-content-audit.md` — generated missing-source, evidence, blank-slot, CEC, and art audit.

## Build and verification commands

```bash
cd app
npm run import:quotes
npm run build:studio
npm run audit:studio
npm run build:catalog
npm run activate:catalog
npm test
```

`build:studio` normalizes source descriptors into the public `exact`, `shortened`, or `attributed-paraphrase` card classifications while retaining the original evidence descriptions. It also normalizes source evidence to A/B/C and source type to primary/closest-primary/secondary.

`build:data` now activates the expanded catalog. `build:alpha` remains available only for rebuilding the retired Markdown-authored Alpha artifact.

## Editorial and evidence disclosure

The prototype openly applies one rule to everyone:

- governing/right-bloc figures: critical, controversial, consequential, or meme-worthy selections;
- current-opposition figures: favorable, constructive selections.

Selection is partisan; wording and provenance may not be falsified. Adapted display text is marked through its classification, while original text and context remain on the record. Generated props, lighting, and scene treatments are editorial symbolism—not documentary evidence—and this disclosure appears in canonical data, Studio, runtime backs, and every copied Weave prompt.

## Release blockers

- CEC confirmation of final list names and ballot letters.
- Human review of direct context for sensitive or secondary-source quotations.
- Human likeness review of generated portraits.
- Exact license recording for the specific identity image selected for each final generation.
- Replacement of missing art keys and completion of Weave export metadata.
- Live measurement of tomorrow-return and card-sharing behavior.
