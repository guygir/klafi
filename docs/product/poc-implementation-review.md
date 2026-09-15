# Kalpi PoC — implementation review

> **Expanded build active:** the former 28/49-card notes below are historical. Review the current 14-party, 51-politician, 191-card implementation in `expanded-poc-content-studio-review.md` and the generated audit in `docs/review/expanded-content-audit.md`.

This is the single review map for the post-feedback product direction and its playable implementation.

## Run and review

```bash
cd app
npm start
```

Open `http://127.0.0.1:4173`.

The bottom navigation now exposes four surfaces:

- **Today** — the real pack art, server-authoritative daily pull, and the staged walkout.
- **Binder** — all 28 collection wells, set filters, duplicate counts, full card backs, sources, sharing, and duplicate offers.
- **Growth** — the trading/gift-preview surface, creator-link builder, real local funnel events, and a link to the full bootstrap playbook.
- **Studio** — sponsor/agenda status, debug pack reset and countdown, the critical-contrast editorial sample, all-card status/source review, walkout replay, and the three-card Netanyahu reveal triplet.
- **Header debug reset** — debug mode places an immediate reset beside the live next-pack countdown; it uses the same server endpoint as Studio.

The selected framed treatment replays **quote → party/slot → member name → portrait** across `מחל-01`, `מחל-02`, and `מחל-03`, with configurable delays and distinct C/UC/R portraits.

The complete browser review hub is at `http://127.0.0.1:4173/project-docs/review/index.html` while the app server is running, or `docs/review/index.html` directly.

## PoC scope correction

Prestige / Legacy, Imitations / Satire, and שופרות / Mouthpieces are post-PoC backlog sets. They are explicitly outside this PoC. The PoC proves the core 28-card daily product, one reproducible six-card journey, the walkout, contextual backs, binder, sharing/trading preview, and return intent.

The next content pass replaces the 28-card structure with the locked 49-card PoC v2 structure in `docs/content/poc-set-structure-v2.md`: four shared commons plus three parties with one symbol, two manifesto excerpts, and four members × three distinct quote cards. The current Alpha remains runnable until the quote/source intake is complete.

## Reproducible guided demo

Use **Studio → Run six-card guided demo**. The server loads `app/data/demo-pack.json`, validates the real 3C/2U/1R composition, and returns six deterministic instances. Demo mode does not write inventory, pity, cooldown, packs, or funnel events.

The narrative and publication blockers are documented in `docs/content/poc-demo-sequence.md`.

## Corrected walkout

The reveal now uses one persistent card silhouette:

`sealed art pack → empty card → quotation/fact below card → party name + ballot letters → portrait → person name → contextual back`

The card does not disappear between beats. Source label, date, and source link arrive with the quotation. Every beat has a short readability hold and then waits for the player.

Implementation:

- Markup and choreography: `app/public/app.js`
- Persistent-card and motion styling: `app/public/styles.css`
- Existing art used by both home and tear stages: `docs/design/assets/pack-wrapper.png`
- Core demo art and rights status: `docs/design/poc-asset-manifest.md`

## Sponsor and agenda configuration

Round 1 strategy configuration:

- Sponsor: **Guy Girmonsky**
- Supported faction: **Current opposition**
- Agenda: **Kalpi supports change.**
- Primary audience: quiet/fearful supporters and undecided voters
- Secondary audience: voters currently supporting the opposing side
- Primary PoC action: return tomorrow
- Secondary distribution action: share a card

These values live in `app/data/advocacy.json`. Studio displays them and keeps the independent card-review release gate visible.

## Card and source review

Use **Studio → Card review desk** to inspect all 28 cards, filter the 10 drafts, open sources, and replay any walkout.

Source-of-truth files:

- Authored card copy: `docs/content/poc-cards.md`
- Generated runtime cards: `app/data/cards.json`
- Source registry: `app/data/sources.json`
- Generated content audit: `app/data/content-audit.json`
- Content process and human gates: `docs/content/editorial-pipeline.md`

The current roster has 10 cards in `draft`; those need direct-source review before release.

## Smotrich critical-contrast sample

The supplied 2015 quote is in `app/data/editorial-samples.json` and visible in Studio. It is marked `draft-secondary-source` because The Big Book of Quotes is a secondary archive. The original linked publication or recording must be inspected before moving it into the public pack.

## Trading and bootstrap

Trading is intentionally a preview, not a fake transfer:

- Growth always shows the offer flow, even before a duplicate exists, and labels that state as a fixture.
- When a card count reaches two, Growth uses the real duplicate and records the offer event.
- Binder exposes **Offer duplicate** on any card owned twice.
- Gift links reopen the exact card walkout; ownership transfer is the next implementation boundary.

The operating plan, thresholds, and failure tree live in `docs/growth/bootstrap-playbook.md`.

## Debug pack reset

Studio shows the live `HH:MM:SS` countdown and **Reset daily pack now**. The button calls a server-authoritative debug endpoint and clears only the current guest session's cooldown.

Debug is enabled by default locally. Run `KALPI_DEBUG=0 npm start` to hide and disable the endpoint.

## Architecture and verification

- Runtime: zero-dependency Node.js 20+.
- State: server-owned sessions, inventory, RNG, pity, cooldown, instances, and events.
- Persistence: queued atomic JSON writes under `app/.runtime/`.
- Client: vanilla HTML/CSS/JS; it renders server results.
- Verification: `cd app && npm test`.
- First-test protocol: `docs/growth/poc-test-kit.md`.

The automated suite covers content provenance, pack composition and pity, sessions/persistence/isolation, activity validation, debug reset, client/HTML selector contracts, the corrected walkout sequence, visible Growth/Studio routes, and use of the existing pack art.
