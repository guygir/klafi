# Kalpi — Product hat (every aspect)

This is the alignment sheet. If a feature does not serve **אוריינות פוליטית** (a smart vote) and **show-up on 27 Oct 2026**, it is not in the product.

> **Decision update, 6 Sept 2026:** after the pre-PoC pitch, the next build became a **disclosed advocacy edition**. Earlier neutrality language below records the original concept; it no longer governs editorial selection. Sponsor/viewpoint disclosure, exact provenance, one common program, fixed rules, and real activity counts now govern the PoC. See [poc-feedback-response.md](poc-feedback-response.md).

Jam brief we are serving (as transcribed; no public page URL found yet):

| Jam goal | How Kalpi touches it |
|---|---|
| Strengthen voter knowledge | Card backs + quiz + commons (how the system works) |
| Be involved, including on socials | Share the rare, faction tally, set race, trading |
| Encourage voting | Habit to 27 Oct; pledge is play, show-up is the outcome |
| Taking choices | Pledge a list, survey → party pack, flip/learn, then vote for real |
| אוריינות פוליטית | **North star.** Informed / smart vote. Not “pick our side.” |
| Fight AI fake news | Knowledge is the counter. We do not fact-check TikTok clip-by-clip; we give lists, roles, and sourced platforms so a fake has less room |
| Young audience | 18–24 / first-timers. Designed for the feed, not a PDF |

The game never picks a side. Players may.

---

## 1. North star

**אוריינות פוליטית — make a smart vote.**

Turnout is the other half: get them to the kalpi *and* make the slip informed.

Subgoal (never drop): stay objective. Equal card structure, equal art weight, rarity never follows polls.

---

## 2. Audience (what is actually going on)

Many **new** voters. Not a monolith.

| Pattern | So the product… |
|---|---|
| They may vote the **parents’ default** | Teach the list, not “rebel against home.” Give facts they can use without a family argument |
| They may **not care** — war, load, enough already | 90-second rip. No lecture. Dopamine first |
| **TikTok / viral fake news** is a civics class they did not ask for | Sourced backs. Commons. Quiz on what they already pulled |
| Some are **afraid to show an opinion** (at least on one side) | Camp pledge is **anonymous**. Energy is a tile, not a name. Bypass the fear; still a choice |

Pitch examples (lived, not a stat):

- Me: **“Bennett is a bro.”** That is not a platform.
- **Little brother** — does not know who to vote for (the young-voter problem).
- **Hadar Muchtar** — same not-knowing.

Why **not** “ask your parents”:

- Rebellion. A parent lecture is the wrong teacher for this age.
- Parents are **invested and emotional**. They are not a neutral syllabus.

How you teach a smart vote: a daily loop that is not a parent, not a party ad, not a TikTok — **knowledge they chose to flip.**

---

## 3. Bait vs goal (still)

Pack dopamine is bait. The **goal** is to teach Israeli politics and induce a smart vote (and show-up). The card back is **one** example of that goal — not the whole product. Quiz on a pulled card, commons, party pack, trading a dupe so someone else reads a back: same job. Extra packs come from the quiz, **not** from pledging a camp.

**המטרה מקדשת את האמצעים.** Empty of lore on purpose. QR on that slide: [guygir.itch.io](https://guygir.itch.io) — prior jams; this time emptiness is the civic choice.

### Why this format (do not compress on stage)

**Local proof — State Makers / יוצרים מדינה** (Piece of History): 98-card Israeli history TCG, packs of 8, holos, first edition sold out. People paid to collect and learned history. [pieceofhistory.com/statemakers](https://www.pieceofhistory.com/statemakers). Kalpi points that at *this* election, digital and free.

**Digital proof — Pokémon TCG Pocket.** Five things we take:

1. Daily timed packs → they come back
2. The rip is a ritual (addictive)
3. Collecting sets is the progression
4. Rarity is a screenshot — that is the virality
5. Optimal for a quick session

Not the shop. Not battles. Extra pack = quiz.

---

## 4. Loop, camps, survey pack

**Daily:** login → server rips a pack → client shows the result → flip backs → binder.

**In-game faction (optional):** pick a list in the game. Each pack adds +1 to that list’s **tally** (a scoreboard, not a currency). No extra pack. The race is the game.

**Real-life party work (verified):** HQ / campaign / kalpi. **Big pack bundle.** Best path to political knowledge. Not the same as the in-game faction pick.

**Opinion survey → PARTY pack (designed now):**

- Short opinion survey (issues, not “who is handsome”).
- Server scores it against a **published** table.
- Reward: one pack **only of politicians from the matched list**.
- Copy: “Based on what you marked, here is a pack from [list]. Open it. Then collect the others.”
- Tool, not endorsement. Same questions for everyone. Other sets stay visible and completable.
- Never required to play. Never auto-pledges the camp.

---

## 5. Progression (why they keep coming back)

Faction + a $$ contest are two hooks. Not enough.

| Hook | Job | Alpha? |
|---|---|---|
| Daily pack / 24h clock | Habit | Yes |
| Pity (new card after 3 dry packs) | Trust / knowledge floor | Yes |
| Binder % / dashed wells | “Collect ’em all” | Yes |
| Daily numbered holo (`#1 of 1 today`) | Chase that is not pay-to-win | Designed |
| Timed quiz → extra pack | Bind dopamine to literacy | Designed |
| In-game faction tally (no reward) | Tribal without outing anyone | Designed |
| Real-life party work | Big pack bundle | Designed |
| Set race (first to complete) | Spectacle | Mock UI |
| 10k NIS prize | Pitch concept only; legal later | No |
| Login / literacy **streaks** | Keep the week alive | Designed |
| Commons completion | System literacy, not only “my party” | Designed |
| Share stamps (cosmetic) | Social without IAP | Share image |
| Party pack from survey | Choice + a reason to open *that* set | Designed |
| CEC pulse (filings, dates — not polls) | Real calendar, later | Maybe |

outbid.lol is the proof that people and companies **will spend a lot of money** to sit on top of a public ladder for fame. [outbid.lol](https://outbid.lol) · [about](https://outbid.lol/about). We invert: **nobody pays.** Same spectator sport, civic cause.

---

## 6. Neutrality (non-negotiable)

- Equal 8-card skeleton per list + shared commons.
- No “cool party / boring party” art.
- Energy tiles same size; order is CEC letter / alpha, not poll rank.
- Party pack is a **match**, disclosed, not a recommendation from Kalpi.
- News: CEC facts only. No live polls in our voice.

---

## 7. Security (baseline, from day one)

The client is a **display**. It does not own luck.

| Rule | Why |
|---|---|
| **Server pulls.** RNG and pack contents are created on the server. Client receives `{packId, cards[]}`. | A user cannot inject “I pulled Netanyahu holo” |
| Collection is **server state**. Client cannot POST an inventory. | Saved result never went through the player |
| Quiz grade is server-side, against **owned** card ids | Cannot farm extra packs |
| Energy / streaks / party-pack match are server-side | Cannot spoof the board |
| Rate-limit: one daily pack, one quiz-pack per day (as designed) | Clock is not a suggestion |
| Guest ok; bind later | Approachable, still authoritative |

Detail: [implementation/part-2.md](../implementation/part-2.md).

---

## 8. Implementation stance (when we build)

- **HTML first** — approachable jam demo, no framework tax.
- **Frontend craft:** project skill `.cursor/skills/frontend-design` + [visual-system.md](../design/visual-system.md). Brief tokens win over skill defaults.
- **Weavy / Figma Weave** ([weave.figma.com](https://www.figma.com/solutions/figma-ai-tool-weave/), still [help.weavy.ai](https://help.weavy.ai)) for stills, UI chrome, **rip animation**, and **promo videos** we can rip / compress into the client. Generate, then cut; do not ship a raw prompt dump as the product.

---

## 9. Presentation (Pitch C)

Spine: voting % → gap → first-timers → surveys lie → **lived examples** → young-voter problem → **parents fail** → **אוריינות פוליטית** → 47s / cards / Pocket → trait→game → **outbid invert** → Kalpi → play → quiz → empty-of-lore **+ QR to jams** → one ask.

**Asterisk (speaker notes only, not a slide, not a design input):**

> I think this would help the Democrats more, because when people do not know how to vote they mostly default *anti*-Democrat. Personal read. Not the thesis. The product stays equal and does not steer.

---

## 10. Non-goals (still)

No lore, no PvP, no IAP, no client-trusted pulls, no live polls in our voice, no outing a player’s camp, no “Kalpi recommends this list.”
