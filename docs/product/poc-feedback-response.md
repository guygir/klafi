# PoC feedback response

This is the working answer to the feedback received after the short pre-PoC pitch. It governs the playable PoC first; the presentation is rebuilt later.

## Product decision

Kalpi is now designed as a **disclosed advocacy collectible sponsored by Guy Girmonsky**. It supports political change through the **current opposition**. The game rules stay fixed. Every player sees the same editorial program. The program may begin with broad political orientation and become sharper over time:

1. **Orientation** — system, lists, people, ballot marks, representative quotations, how to inspect a source.
2. **Issue contrast** — agenda-aligned supporting cases and critical contrasts, grouped by issue and backed by inspectable receipts.
3. **Decision readiness** — list slots, ballot logistics, strongest positive evidence, strongest critical contrasts, and a clearly labeled closing case.

The sponsor, supported faction, and supported agenda are configured in `app/data/advocacy.json`. Card-level source and rights gates remain independent release blockers.

Non-negotiable factual rules:

- Exact quotation, named speaker, date/date-status, source, surrounding context, and selection rationale.
- Editorial conclusions are labeled as editorial analysis.
- Faction and activity totals are recorded events only. Never adjusted for appearance.
- Same odds, sources, rules, and release sequence for everyone.
- Corrections remain visible in a revision trail.

---

## Feedback → PoC response

### 1. FIFA-style slow walkout

**Comment:** FIFA buys time before a player card walks out. Kalpi should buy time for reading.

**Response:** identity no longer appears first. The reveal is:

`existing art pack → empty card → quote/fact below the card + source cue → party name + ballot letters → portrait → person name → full context/back`

One persistent card frame fills in across the beats; it is not replaced by separate reveal panels. Each beat has a short minimum hold and then waits for the player. A rare has more ceremony, not less source depth. Reduced motion removes movement but preserves the information order.

**Success:** a player can repeat the quote/hook and identify its source cue before the name appears; the full back is reached for every revealed card.

### 2. Design and feel are crucial

**Comment:** fun, intuitive, addictive, pleasant, easy on the eyes; animation must be crisp.

**Response:** one signature moment—the quotation emerges through the ballot slit. Everything else supports it: physical tear, typographic quote stage, faction stamp, silhouette, identity hit, foil, binder landing. Paper/ink/foil and the 8px party pip remain. Audio is off by default.

**Success:** no ambiguous primary action, 390×844 works without clipping, touch/keyboard/reduced-motion paths remain complete, and the main reveal remains smooth on a normal phone.

### 3. Bootstrap is the hard part

**Comment:** virality is easy only after enough people exist. The product must create the first users.

**PoC mechanics:**

- Every pull creates a vertical social artifact containing the hook, identity, source cue, advocacy disclosure, and exact-card deep link.
- Referral links reopen the shared card; creator codes show which seed cohort produced real opens.
- Duplicate → “offer as gift/trade” creates a shareable preview. Ownership does not transfer in this PoC.
- Aggregate events: pack opened, back completed, source opened, binder reached, share created, referral opened, gift preview created.
- Activity shown in the product is real PoC activity. Demo fixtures are labeled.
- The playable **Growth** surface exposes the duplicate offer, creator-link builder, funnel ledger, and full playbook instead of leaving these only in documentation.

**Bootstrap playbook:**

1. Recruit a small named creator cohort rather than “launch to everyone.”
2. Give each creator one recognizable reveal format and referral link.
3. Release the first coordinated pack opening in a short window, with WhatsApp-ready stills and TikTok/Reels vertical frames.
4. Watch share creation → referral open → first pack → completed back. Fix the first broken conversion, not vanity reach.
5. If sharing stalls, improve the artifact and walkout. If referral opens stall, improve creator framing. If first packs stall, shorten onboarding. Never fabricate momentum.

**Initial PoC thresholds (learning targets, not forecasts):**

- 10 seeded creators complete a pack.
- 30% of seeded players create at least one share artifact.
- 20% of referral visitors begin a guest session.
- 70% of opened packs reach all six backs.

### 4. Content volume is large

**Comment:** an agent alone may not produce creative, accurate, thorough political content at scale.

**Response:** split mechanical work from editorial responsibility.

- Agent: schema conversion, source registry, duplicate detection, word counts, missing-field checks, chronology checks, preview rendering.
- Human editor: quote selection, context, stance, fairness of the opposing steelman, rights, political accuracy, final approval.
- Status per item: `draft → fact-checked → approved`.
- The first 28 cards remain the quality benchmark. Expansion is blocked if a card lacks provenance or approval.
- The playable **Studio** surface exposes sponsor/faction configuration status, all 28 card/source statuses, the draft filter, source links, and walkout replay.

### 5. Agenda and quote programming

The supported agenda may choose favorable evidence for its side and critical evidence about another side. It must say that it is doing so. A real quote is still published with context and a source; an editorial selection is not presented as exhaustive balance.

#### Content patterns: broad first, sharper later

1. **Institution → implication → position** — teach a rule, show its policy consequence, state the supported position.
2. **Shared value → competing methods → editorial case** — begin with common language, compare methods, argue for one.
3. **Biography → responsibility → record** — identity, office controlled, dated decisions.
4. **Promise → action → consequence** — initial promise, actual act/vote, sourced outcome.
5. **Quote → context → consistency test** — memorable line, full setting, comparison with another quote/action.
6. **Same issue, paired receipts** — strongest sourced supporting card and strongest critical card, parallel visual treatment.
7. **Coalition consequence ladder** — list mechanics, declared relationships, policies a seat can enable or block.
8. **Commons → uncommon → rare argument** — vocabulary, issue facts, synthesis/contrast. Rarity is depth, not truth.
9. **Receipt chain** — three independent source cards unlock a labeled editorial synthesis.
10. **Timeline reveal** — before office, decision, later result, then interpretation.
11. **Steelman → response** — strongest fair opposing case before the supported answer.
12. **Claim → source challenge** — predict speaker/event, then reveal context and editorial takeaway.
13. **Official-event context drop** — CEC fact first; implications only in later cards.
14. **Closing ballot set** — letters, first slots, logistics, positive receipts, critical contrasts, closing case.

The PoC demonstrates three deeply: quote/context/consistency, paired receipts, and common/uncommon/rare.

---

## Audience-impact analysis

These are research scenarios for one common experience, not hidden user profiles.

Priority order for the PoC:

1. Quiet or fearful supporters and undecided voters.
2. Voters currently supporting the opposing side.

The primary measurable action is **return tomorrow**. Creating a card share is the secondary distribution action.

### Quiet or fearful supporter

**Experience:** private binder; anonymous participation later; source-first share card that can be posted without publicly declaring a vote; real aggregate activity.

**Expected effect:** reduced sense of isolation, a lower-risk way to participate, and stronger return behavior when the public activity is credible.

**Product benefit:** activates a silent audience without exposing identities or inventing a lead.

**Measure:** next-day return, source-card shares, voluntary anonymous participation, and perceived-isolation survey.

### Undecided voter

**Experience:** system orientation before argument; issue-grouped supporting and critical receipts; original source and context always one action away.

**Expected effect:** replaces feed pressure with inspectable material, gives a reason to return, and makes uncertainty more specific (“I disagree on issue X”) rather than vague.

**Product benefit:** credibility, consideration time, source inspection, and sustained collection.

**Measure:** next-day return, backs completed, source opens, issue-set completion, card shares, and self-reported clarity.

### Voter supporting the opposing side

**Experience:** same rules and access; collect every faction; inspect and challenge critical cards; see corrections; strongest opposing argument is represented before the response.

**Expected effect:** enough trust to keep playing even when disagreeing; sharing through disagreement; useful adversarial review of weak context.

**Product benefit:** broader reach, stronger fact-checking, correction signals, and organic discussion.

**Measure:** retention after critical cards, source opens, corrections/reports, cross-faction completion, disagreement shares.

### Stop conditions

- Next-day return is weak: improve the unresolved collection/reward promise before adding another mechanic.
- Players return but do not share: improve the card artifact and social framing without weakening the sourced payload.
- Trust or source opens fall: add context; do not merely intensify rhetoric.
- Shares stall: improve the artifact/walkout; do not fabricate social proof.
- Opposing-user reports reveal clipped context: correct, version, and preserve the revision.
- Players mistake editorial analysis for a quote: redesign the label before publishing more cards.

---

## Presentation later

The audience already heard the broad introduction. The later PoC presentation should be issue-response oriented:

`feedback heard → walkout demo → design proof → bootstrap mechanics + thresholds → audience impact → content operation → next test`

Detailed holding notes live in `docs/presentation/poc-pitch-notes.md`.
