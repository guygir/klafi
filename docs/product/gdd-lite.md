# Kalpi — Product / GDD lite

Collect-only digital TCG. No battles. Free forever.

> **Decision update, 6 Sept 2026:** the feedback-focused PoC is a **disclosed advocacy edition**, not a neutral referee. The earlier objective-content principle below is retained as the original baseline, but is superseded for editorial selection. Game rules, source provenance, and recorded activity remain fixed and common to every player. See [poc-feedback-response.md](poc-feedback-response.md).

Why this format works (Pocket + collectible musts): [digital-collectibles.md](digital-collectibles.md).

---

## Product job

Help 18–24s **recognize party members, symbols, and manifesto points** well enough to cast a **smart vote** (אוריינות פוליטית), by making the learning loop feel like a daily collectible habit. Show-up on 27 Oct is the other half.

**Subgoal — be objective.** Kalpi never picks a side. Players may. Content, art weight, rarity, and rules do not.

Full alignment (audience, jam goals, security, progression): [alignment.md](alignment.md).

---

## Principles

1. **Free forever.** No IAP. Reach is the business model; civic turnout is the outcome.
2. **Short session.** Daily rip under ~90 seconds. Longer only if the player chooses to read backs or browse the binder.
3. **The back is the product.** Pack open without a readable back fails the civic job.
4. **Equal structure per party.** Same slot types, same rarity math, same visual weight. No “cool party / boring party.”
5. **Objective voice.** Facts, dates, roles, published platform lines. No jokes that punch a camp. No “we” that means a bloc.
6. **No lore.** The world is the election. Atmosphere comes from real institutions. Empty of story on purpose — the cause is the heart.
7. **Progression is learning.** Extra packs come from timed quizzes on cards you own, not from empty grind.

---

## Core loop

1. Come back (habit).
2. Rip a free pack (dopamine).
3. Hit a new / holo card (variable reward).
4. Flip the back (learning, 10–20 seconds).
5. Slot it into a party set (progress).
6. Share or chase the missing card (social).

```
login → pack available? → rip → reveal → flip backs → binder → share
                ↓ no
         countdown to next daily pack
```

---

## Alpha slice (must ship later, designed now)

| Surface | Behavior |
|---|---|
| Account | Guest or one-tap. No social graph required. |
| Daily pack | **One free pack per 24 hours.** Not 8 hours in Alpha. |
| Open | Tear → spread → rare pause → tap to flip. 6 cards. |
| Card | Front (identity) and back (short factual text + source). |
| Binder | Filter by party set. Missing slots shown. Completion %. |
| Share | Static “just pulled X” image. Optional, never mandatory. |
| Race UI | Fake social proof only: “12 people have 80% of Set A.” No money. |

8-hour drops are a **live-ops lever** on the roadmap, not the Alpha default. Daily is enough habit; 8h is more hostile.

---

## Roadmap (designed now, built later)

- **In-game faction board** (pick a list; packs tally it; no reward).
- **Real-life party work** (verified) → big pack bundle.
- **Timed swipe quiz popups** → extra pack (bind progression to learning).
- **Opinion survey → PARTY pack** (matched-list politicians only).
- Verified civic actions (volunteer at a kalpi / party HQ) → pack bundle.
- Optional **election pulse** (filings, dates — not horse-race polls). See below.
- Completion race + optional sponsored civic prize (see legal).
- Streaks, commons milestones, share stamps (see progression).
- Influencer seeding. Trading / gifting. Daily numbered holos.

---

## Card types (same skeleton for every party)

| Type | Front job | Back job |
|---|---|---|
| Member | Name, list slot, role | 2–3 factual lines that help you vote |
| Symbol | Official letter / mark | What the mark is and how it appears on the ballot |
| Platform | One plank title | One sourced position, not editorialized |
| Quote | Attributed public line | Context + date + source. Labeled as a quote. |
| Commons | Institution or rule | How the system actually works |

Shared commons sit outside party sets so the collection is not only “my camp.”

---

## Rarity

| Tier | Weight in a 6-card pack (target) | Visual |
|---|---|---|
| Common | 3 | Flat frame, no foil |
| Uncommon | 2 | Thin foil edge |
| Rare | 0–1 | Full foil frame, pause on reveal |
| Holo | 0–1 (low) | Animated foil + date stamp |

Pity: if a player opens **3 packs** without a **new-to-them** card, the next pack guarantees one new card. Civic games should not withhold knowledge like a casino.

Duplicates exist (trading bait later). Alpha may mark “already owned” and still show the back — rereading is learning.

### Numbered holos — list slot, not population

Life TCG prints holos to an animal’s wild population. We take the *idea* (print run means something real) and invert it for neutrality.

**Member cards:** numbered run = official **list slot**, same rule on every list.

| List slot | Numbered copies |
|---|---|
| 1 (head of list) | **1/1** |
| 2 | 1/2 · 2/2 |
| 3 | 1/3 · 2/3 · 3/3 |
| *n* | 1/*n* … *n*/*n* |

Likud 1 and Democrats 1 and Ra'am 1 are all **1/1**. We are teaching list order, not poll share. Do **not** tie runs to seats, polls, or “importance.”

Server assigns the number. Client cannot claim 1/1.

Symbol / platform / quote / commons are **not** slot-numbered.

### Daily holo treatment (separate)

A holo can also carry the date (`01.09.2026`). Time-based spectacle, not a second print-run system. Slot-number is the chase. Date is the screenshot caption.

---

## Pack rules

- **6 cards** per pack (faster than State Makers’ 8).
- Target mix: 3C / 2U / 1R-or-Holo. **Print the mix.** Hidden odds are a loot-box tell.
- At least one card from a party set the player has not completed, when possible.
- At least one commons card in every other pack, so system literacy is not optional.
- After the reveal, **animate the card into its binder well** (Pocket: show where it slots).
- **Learning beat is mandatory.** The back is party / member / system info. Default: a short hold, then tap to flip. Target ~1.5s — **not 3s in Alpha** (3s may bounce them). Never skip the back as the default. The idea is: collectible ritual, knowledge on top.
- No paid rerolls. No hourglasses. **Extra pack = quiz** (learning). Pledge does **not** grant an extra pack.

---

## Party sets

**Full vision:** one set per list submitted to the Central Elections Committee (deadline **9 September 2026**).

**Equal structure per list:**

- 4 Member
- 1 Symbol
- 2 Platform
- 1 Quote

**Shared commons (all players):** 4 cards — Knesset, Kalpi, Threshold, CEC.

**PoC:** 3 parties × 8 + 4 commons = **28 unique cards**, plus “more parties coming” placeholders. Three parties are chosen for **map spread**, not popularity. See [poc-cards.md](../content/poc-cards.md).

---

## Reward taxonomy

| Trigger | Reward | Why | In Alpha? |
|---|---|---|---|
| Daily login | 1 pack | Habit | Yes |
| Timed swipe quiz (owned card) | 1 extra pack | Bind progression to learning | Designed, not built |
| Pack opened while in a **faction** | +1 on that list’s public tally (not a currency, not a pack) | The faction game *is* the progression. No extra reward | Designed, not built |
| Opinion survey complete | 1 **PARTY pack** (matched list only) | Choice + a reason to open that set | Designed, not built |
| Login / literacy streak (3 / 7 days) | Cosmetic stamp or guaranteed uncommon | Keep the week alive | Designed, not built |
| Commons set complete | Binder badge | System literacy, not only “my party” | Designed, not built |
| Verified **real-life** party / kalpi work | **Big pack bundle** | Best way to become knowledgeable. This is the large reward | Designed, not built |
| Share a pull (optional) | Binder stamp / cosmetic | Virality without pay | Share image only |
| First to complete a set | Public race placement | Spectacle | Fake race UI only |

---

## Two different “pledges” (do not mix them)

**Energy was a bad name.** There is no currency. You do not earn, spend, or buy anything called energy.

### 1. In-game faction — no reward

Optional. Pick one real list **inside the game**. Anonymous to other players (tile, not your name). Afraid to show an opinion? This is the bypass.

- Each pack you open adds **+1** to that list’s public tally.
- That number is just **packs pledged in-game**. A scoreboard. Not a poll, not a wallet.
- **No extra pack. No prize.** The faction race *is* the progression — people come back so their list’s number moves.
- Switch anytime (or after 24h). Unfactioned players still play; their packs do not tally a list.
- Same tile size for every list. Order = CEC letter / alpha, not polls.

Kalpi is the ref. Content stays even.

### 2. Real-life party work — big reward

Verified volunteer at a **party HQ, campaign, or kalpi** (someone signs off).

This is the best way to become knowledgeable about politics — you are in the room, not only flipping a card. So it **should** pay a large result: a **pack bundle**, not +1 on a board.

Do not auto-join the in-game faction when they volunteer. They can still pick (or not) in the game.

---

## Opinion survey → PARTY pack

Optional. Not required to play. Not an endorsement.

1. Short issue survey (what matters to you — not “who is a bro”).
2. **Server** scores against a published table (same questions for every player).
3. Reward: one pack whose members are **only politicians from the matched list**.
4. Copy: “Based on what you marked, here is a pack from [list]. Open it. Then collect the others.”

Rules:

- Kalpi does not say “you should vote this.” It says “here is that set, so you can actually read it.”
- Other lists stay visible and completable. Never hide the rest of the binder.
- Completing the survey does **not** auto-join an in-game faction.
- Survey answers and the match live on the server. The client does not pick the party pack contents.

---

## Timed quiz popups (progression = learning)

Not a homework screen. A **super-short timed offer**, same family as a flash sale — except the currency is attention.

**Offer:** “5 minutes. Two swipes. Extra pack.” Dismiss is always allowed. Never block the daily rip.

**Card (from a card the player already owns, preferably from the last pack):**

1. Face / illustration + name (always shown).
2. Swipe left/right: **what they do now / what they are known for** — 3–4 options, one correct, taken from the card back.
3. Swipe: **which list** — 3–4 list names, one correct.

Both correct inside **5:00** → extra pack. Wrong or timeout → no pack, show the back, they can try a new popup later (one successful extra-pack quiz per day).

Rules:

- Intuitive: swipe changes the option, one tap locks.
- No “who is good.” No opinion items.
- Commons cards can quiz the threshold / 120 / closed list the same way (image of the institution, swipe the fact).
- This is how extra packs are earned. Login is the habit pack. **Learning is the bonus pack.**

---

## Election pulse (maybe)

Worth considering, not locked. Goal: keep players in the real race without turning Kalpi into a poll aggregator.

**Safe if we do it:** CEC calendar, list-filing facts, “letters assigned,” dated official events. A Commons-style pulse chip: *9 Sept — lists filed.*

**Unsafe:** live poll widgets, “X is leading,” seat projections. That picks a horse and rewards large lists. If a partner later wants polls, they sit behind a labeled third-party strip, never in our voice, never affecting rarity or energy.

Default for jam: **skip polls.** Mention pulse as a later live-ops option.

---

## Leaderboard / prize

Public boards, all free:

1. **Faction tally** — in-game packs counted per list. Not a currency.
2. **Set race** — who completed a set (or commons) first.
3. **Country board** — collection % / literacy streak, whole game.
4. **Groups / leagues** later — friends, campus, unit. Same rules, smaller room.

**Trading / gifting** is how the game becomes friendly and social: gift a dupe, complete a friend’s set, talk about the back. Knowledge should move. No paid trade gate.

**Commons-complete badge** is shareable — viral for system literacy, not only “my party.”

[outbid.lol](https://outbid.lol) proved a public ranked list can explode — and that people/companies will **pay** (top spot ~$13–17k; six figures of bids; ~1M visits) to sit on that ladder for fame. Proof the spectacle is worth money. We steal the spectator sport, not the paywall. Civic cause; **nobody pays.** [About](https://outbid.lol/about).

- **10,000 NIS first-set prize** remains a pitch concept, legal review required.
- Alpha: fake counts only.

---

## Session budget

| Beat | Target |
|---|---|
| Open app → pack | 5s |
| Rip + reveal 6 | 20–30s |
| Flip 1–2 backs | 20–40s |
| Binder glance | 10–15s |
| **Default session** | **under 90s** |
| Deep binder browse | player-chosen, uncapped |

---

## Why they keep playing (progression beyond faction + cash)

Camp energy and a $$ race are two hooks. Not enough on their own.

1. **Daily clock** — pack is waiting.
2. **Pity** — knowledge is not withheld like a casino.
3. **Binder %** — dashed wells, set chase.
4. **Daily numbered holo** — time-based chase, not pay-to-win.
5. **Quiz extra pack** — literacy is how you get ahead.
6. **In-game faction tally** — no reward; the board is the game.
7. **Set race** — spectator sport (outbid invert; nobody pays).
8. **Streaks** — login and quiz chains (3 / 7).
9. **Commons complete** — you finished how the system works.
10. **Party pack** — a matched set you have a reason to open.
11. **Share stamps** — cosmetic, optional.

Prize money stays a **pitch concept**. Alpha does not ship a lottery.

---

## Security (baseline)

The client **displays**. It does not own luck.

- Pack RNG and contents are created **on the server**. Client receives card ids. A player cannot inject pulls.
- Inventory, faction tallies, streaks, quiz grades, and party-pack matches are **server state**.
- Never persist a client-authored collection as truth.

See [implementation/part-2.md](../implementation/part-2.md). Alpha is HTML-first for approachability.

---

## What this is not

- Not a battler (Marvel Snap / Pocket battles).
- Not a physical print run (State Makers is the local analog, not the product).
- Not a poll, forecast, or endorsement. Faction tally is **in-game packs**, not an election.
- Not a pay-to-rank board ([outbid.lol](https://outbid.lol) is the analog we invert).
- Not a client-trusted inventory.
- Not a story game with lore. Empty of fiction on purpose.
