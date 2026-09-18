# Kalpi — Visual system

Collectible and civic. Not a campaign poster, not a meme page, not a government PDF. Reference: State Makers finish + TCG Pocket pack feel, with **shared chrome** so no party looks like the hero.

Hero finishes (open in a browser): [hero-cards.html](hero-cards.html)  
Mobile wireframes: [wireframes.html](wireframes.html)
PoC asset and rights status: [poc-asset-manifest.md](poc-asset-manifest.md)
Weave still/motion production template: [weave-production-brief.md](weave-production-brief.md)

---

## Direction

- Paper, ink, foil. A card you would want to keep.
- Party color is an **8px badge** only. Never a full-bleed wash.
- Illustrated / letterform art. No scraped press photos. No photoreal likeness in the jam.
- RTL-ready frames even when the PoC text is English.

---

## Palette

| Token | Hex | Use |
|---|---|---|
| `ink` | `#1A1F1C` | Type, rules |
| `paper` | `#F4EFE4` | Page, card field |
| `paper-deep` | `#E7DFD0` | Binder slots, wells |
| `rule` | `#2C3330` | Frames |
| `civic` | `#1F4F4A` | Shared brand teal — buttons, pack, progress |
| `civic-bright` | `#2A7A72` | Hover, pack glow |
| `foil` | `#C4A35A` | Rare edge |
| `holo` | `#7E8B9A` → `#C4A35A` → `#5E7A74` | Holo wash (CSS gradient) |
| `danger-mute` | `#8A4A3A` | Countdown only, never party-coded |

Party pips (badge only):

| Set | Pip |
|---|---|
| Likud | `#1B3A6B` |
| Democrats | `#C43B3B` |
| Ra'am | `#2E7D4F` |
| Commons / SYS | `#1F4F4A` |

If a new list is added, it gets a pip. It does not get a new frame.

---

## Type

Player-facing lock:

- **Hebrew display:** `Noto Serif Hebrew` — card names, quotes, player headings.
- **UI / metadata:** `IBM Plex Sans Hebrew` — controls, party/slot rows, collection state.
- **Latin fallback:** `Fraunces` for the Latin pack wordmark and `IBM Plex Sans` for Studio.
- Never change families by surface. Binder, reveal, dialog, trade and Studio use the same card markup and type roles.

Sizes on a 63 × 88 mm card (390 × 544 CSS px):

| Role | Size | Weight |
|---|---|---|
| Type chip | 10px | 600 |
| Title | 22px | 600 |
| Subtitle | 12px | 400 |
| Back body | 13px / 1.4 | 400 |
| Source | 10px | 400 |

Minimum body size 13px. No 9px legal grey.

---

## Card frame

```
┌─────────────────────────┐  8px outer rule (ink)
│ ▌ pip                   │  8px party pip, top-left
│  [MEMBER]          R    │  type chip + rarity
│                         │
│         ART  3:4        │  illustration well
│                         │
│  Title                  │
│  Subtitle               │
│  KALPI · LIK-M-01       │  footer catalog
└─────────────────────────┘
```

Back: same outer rule, no art well. Title, 40–60 word body, “Why it matters,” source, catalog code.

Corners: 12px. Inset: 16px. Art well radius: 8px.

### Selected pack-v2 member front

The framed collectible treatment is selected. The physical ratio is `63 / 96`, with a taller art well. Percentages are fixed across every member card and measured upward from the bottom:

- `1.8–12%`: centered quote in a fixed-height Hebrew zone.
- `12.2–16.2%`: Hebrew party name and `מקום <slot>`.
- `16.4–21.8%`: Hebrew member name.
- `22–100%`: inset editorial portrait.

Catalog metadata appears with the portrait stage: top-left is the Hebrew ballot letters plus one set-wide sequence number; top-right is the compact rarity mark. Stars use wax-seal green, not yellow. `01` is the ballot-symbol card, `02–03` are the two platform cards, and each list slot then reserves three stable numbers in Common / Uncommon / Rare order. Netanyahu therefore occupies `מחל-04–06`; slot 2 occupies `מחל-07–09`, even if one of those cards is not published yet. Use the rounded antique outer frame, gold/umber rarity finish and inset portrait well.

The runtime flags `theme`, `cardFrame`, `density`, and `quoteReveal` are independently configurable in Studio. `classic-v1`, `classic-v1`, `compact-v1`, and `fade-v1` remain the tested rollback path. `fullart-v1` is a comparison dummy only: full-bleed portrait, rising black panel, then name / party+slot / rarity / quote. Default remains `tall-v2`.

Each portrait prompt may carry one editable **Added flavor** note tied to the quote. It is disclosed editorial symbolism, never evidence: examples include an unlit cigar, generic distant moving silhouettes, or a closed suitcase. Avoid logos, ethnic coding, literal allegations, invented recipients, visible money, or documentary reconstruction.

---

## Rarity language

| Tier | Frame | Reveal |
|---|---|---|
| Common `★` | Flat ink rule, no foil | Instant |
| Uncommon `★★` | 1px `foil` inner line | Instant |
| Rare `★★★` | 3px `foil` frame + pause | 400ms hold |
| Holo | Final-product treatment, not generated in the PoC | Reserved |

The PoC uses Common, Uncommon, and Rare only. Holo remains a future **treatment**, not a card type.

**Legendary / Aces is a timed promotion set, not a daily-pack rarity.** Its compact rarity mark is `P`. Its PoC treatment may add an event-date seal and longer portrait hold, but it keeps the shared frame, source receipt, and asterisk disclosure. Promotion cards never enter the base 49-card odds.

---

## Pack-open beats

1. **Tear** — pack art splits according to Studio timing.
2. **Arrival** — the single earned card enters the stage.
3. **Empty card** — one persistent card frame arrives without identity
4. **Hook + receipt below** — exact quote or labeled fact, review status, source label, date-status, and inspect link
5. **Party + ballot letters** — the first identity clue fills the same card
6. **Portrait** — illustrated art walks into the same frame; rare/holo ceremony escalates here
7. **Identity** — name and finished treatment complete the card.
8. **Receipt** — source and ownership actions remain outside the card.

The complete sequence advances automatically from one Studio-controlled timing object; it does not ask for a click at each beat. Reduced motion removes movement but preserves the order and final information.

The signature visual is **the line before the name**: quote typography condenses out of ink through a brief ballot-slit line. The effect runs on the persistent shared card and never swaps to a second renderer.

An advocacy disclosure strip remains visible above the app. Party color remains an 8px pip even when editorial selection supports a disclosed agenda.

---

## Mobile layout (390 × 844)

- Safe areas: 16px side, 24px top, 32px bottom for the primary button
- One primary action per screen (`Open today’s pack` / `Flip` / `To binder`)
- Binder: 2-column tall cards at 390px, with a partial next row and internal vertical scrolling
- Progress: civic teal bar, label `12 / 28 · 43%`
- Race row (roadmap UI): `12 people at 80% of Likud` — no prize amount in Alpha

---

## Weavy / Figma Weave (when we make more art)

Still cards, pack wrappers, **rip / foil loops**, UI chrome, and **promo videos** can be generated in Weavy (now Figma Weave), then ripped into the client.

- [Figma Weave](https://www.figma.com/solutions/figma-ai-tool-weave/) · canvas at weave.figma.com
- Node docs: [help.weavy.ai](https://help.weavy.ai)

Generate, then cut. Civic objects and letters — not scraped press faces. Agent UI craft: `.cursor/skills/frontend-design` + `.cursor/skills/kalpi-frontend`. Tokens below still win.

---

## Alpha art strategy

- Lock the frame first.
- Finish **3 hero cards** for demo and deck (SYS-C-02 Kalpi, SYS-C-03 Threshold holo, LIK-S-01 מחל).
- Remaining 25 cards use the same frame + letter/silhouette placeholders.
- Final product needs a rights pass on likeness and marks.

### Why the art is AI (say this in the jam)

This community often prefers hand-made art. We are not arguing that AI is “better.” We are arguing the **deadline**.

- Election day is **27 October 2026**. Lists file **9 September**. Virality needs weeks, not a launch the week of the vote.
- A full set is every list × members × symbols × platforms. Hand-painting that before October is how you miss the election.
- The civic goal is turnout and an informed slip. Every day without a daily pack is a day the 18–24 habit does not start.
- So AI-generated illustration — civic objects, letters, silhouettes, not scraped press faces — is the way we ship on time. If a later partner funds an artist pass, we take it. We do not wait.

Same stance as the product: **המטרה מקדשת את האמצעים.** The jam usually wants lore and hand-made heart. We want 18–24 at the kalpi. The empty means are on purpose.

---

## Accessibility

- Contrast: ink on paper, not grey on cream.
- Flip control is a button, not a hover-only gesture.
- Reduced-motion: skip shimmer, keep the flip.
- RTL: pip and rarity swap sides; body still starts from the start edge.
