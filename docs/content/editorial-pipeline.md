# Kalpi — editorial content pipeline

Agents can accelerate structure. A human editor owns political judgment.

## Unit of publication

Every card has:

- Identity, set, type, rarity, subtitle
- 40–60 word body
- “Why it matters”
- Short printed source
- Walkout kind (`quote` or `fact`)
- Exact walkout text
- Speaker and date/date-status
- Source registry id + inspectable URL
- Context
- Selection rationale
- Release phase
- Editorial role
- Content status

Release phases:

- `orientation`
- `issue-contrast`
- `decision-readiness`

Editorial roles:

- `orientation`
- `supporting-case`
- `critical-contrast`

Statuses:

- `draft` — structured, not publishable
- `fact-checked` — wording and provenance checked
- `approved` — human editor approved context, selection, tone, and rights

## Agent work

- Convert source notes into the schema.
- Flag missing speaker/date/source/context.
- Count words and compare sibling cards.
- Detect repeated or contradictory dates.
- Render cards and walkouts for review.
- Validate URLs syntactically.
- Generate an audit report of draft/blocked items.
- Suggest—not approve—possible issue pairs and chronology.

## Human work

- Open the primary or closest available source.
- Verify the quote character-for-character.
- Read enough surrounding material to prevent a clipped meaning.
- Decide whether the selection supports the disclosed editorial case.
- Write the selection rationale.
- Review the strongest opposing formulation before publishing a response.
- Approve rights and visual treatment.
- Mark the item `approved`.

## Publication gates

A public card does not ship if:

- Speaker, date/date-status, source URL, or context is empty.
- A paraphrase is styled as a quotation.
- An indirect index is the only quote source and the card is labeled approved.
- Editorial interpretation appears inside quotation marks.
- The selection rationale is hidden.
- An issue pair compares unlike questions.
- A correction was made without a revision note.
- The sponsor or supported agenda is still “configuration-required.”

## Broad → sharp programming

Each argumentative set should be reviewable as a chain:

1. **Baseline fact** — what happened or how the institution works.
2. **Receipt** — quote, vote, policy, decision, or official result.
3. **Contrast** — a parallel receipt or consistency test.
4. **Synthesis** — a clearly labeled editorial conclusion.

Rarity can encode depth:

- Common = vocabulary / system
- Uncommon = issue fact / responsibility
- Rare = comparison / synthesis

Rarity never means “more true.”

## Current PoC status

`app/scripts/build-cards.mjs` generates 28 cards from `poc-cards.md` and joins them to `app/data/sources.json`. Three direct quote walkouts are configured. Indirect reporting indexes remain visibly `draft` or `fact-checked`; they should be replaced by direct article/source URLs before a public advocacy release.

`app/data/editorial-sequences.json` demonstrates:

- Quote → context → consistency test
- Same-issue paired receipts (schema demonstration; publication blocked)
- Commons → uncommon → rare argument
