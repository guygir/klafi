# Kalpi PoC v2 — 49-card structure

This replaces the 28-card content structure after the first Alpha. Prestige, Satire, and שופרות / Mouthpieces remain post-PoC expansion backlog.

## Timed Legendary / Aces promotion set

Legendary cards are a PoC extension, not part of the base 49-card pool and not a fourth result silently added to daily odds.

- A Legendary is attached to a dated political or campaign event and is available only during a published server-controlled window.
- The server records the event id, active window, card id, and grant. Once earned, the card remains in the binder after the window closes.
- The front shows the event date and `Legendary`; the back retains the exact/adapted classification, source, full context, and release rationale.
- Debug and guided-demo grants do not modify ordinary inventory or daily cooldown.
- First candidate: Benjamin Netanyahu — “אם היו מעירים אותי בבוקר ה־7 באוקטובר, זה היה נראה אחרת.*” The display line is adapted; the source record preserves his longer direct answer and the asterisk must remain visible.

## Total

- 3 parties × 15 cards = 45 party cards.
- 4 shared system cards.
- **49 cards total.**

PoC parties:

- Likud (`LIK`)
- The Democrats (`DEM`)
- Ra’am (`RAM`)

## Per-party structure

Each party has:

1. **One symbol card**
   - Official or historically associated ballot letters.
   - Common.
   - Filing/status date and official source required.
2. **Two manifesto excerpt cards**
   - Exact excerpts from the party’s own published document or official page.
   - `P-01` is Common.
   - `P-02` is Uncommon.
   - Label as a document excerpt, not a politician quote.
3. **Top four chosen members × three quote cards**
   - 12 member cards per party.
   - Each card carries a different real quotation.
   - Each quotation needs exact wording, speaker, date/date-status, primary or closest source, and surrounding context.
   - `Q01` is Common.
   - `Q02` is Uncommon.
   - `Q03` is Rare.

Total per party:

- 6 Common: symbol, first manifesto excerpt, four `Q01` cards.
- 5 Uncommon: second manifesto excerpt, four `Q02` cards.
- 4 Rare: four `Q03` cards.

## Shared system cards

Retain:

- The Knesset
- The Kalpi
- The Threshold
- Central Elections Committee

Current rarity allocation remains 2 Common, 1 Uncommon, 1 Rare.

## Full rarity pool

- 20 Common.
- 16 Uncommon.
- 13 Rare.
- No Holo in the PoC.

Daily packs remain:

`3 Common · 2 Uncommon · 1 Rare`

## Member-card identity

Recommended ID:

`<PARTY>-M<rank>-Q<quote>`

Examples:

- `LIK-M01-Q01`
- `LIK-M01-Q02`
- `LIK-M01-Q03`

All three cards use the same person and stable visual identity. They vary by:

- Real quotation.
- Pose or camera angle.
- Civic/issue setting.
- Common, Uncommon, or Rare finish.

The three cards are separate collectible knowledge units, not cosmetic variants of the same quotation.

## Data and publication gates

A member triplet is blocked unless:

- All three quotations are genuinely different.
- Every text is classified as `exact`, `shortened`, or `attributed-paraphrase`.
- `shortened` and `attributed-paraphrase` cards carry a visible `*` beside the quotation plus the on-card footnote “* shortened/adapted from sourced remarks”; the back states the precise classification and links the source.
- An asterisk never upgrades uncertain wording into a verbatim quotation.
- Speaker and date/date-status are known.
- Each source URL is inspectable.
- Context prevents a clipped or reversed meaning.
- At least one identity reference is recorded per person. Public photographs remain internal model references; only the generated editorial illustration ships in the PoC.

A manifesto card is blocked unless the exact source document, version/date, section/page where available, and original-language excerpt are recorded.
