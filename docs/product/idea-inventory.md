# Kalpi — Idea inventory

**This is the place.** Everything we talked about in this project stays here, even if it does not fit on Pitch C.

Pitch C is a story for the room. This file is the product memory. If an idea is not on a slide, it is not lost.

Statuses:

| Tag | Meaning |
|---|---|
| **Pitch** | Say it on stage (C) |
| **Locked** | In the product. Build toward it |
| **Alpha** | Must ship in the first playable |
| **Shipped Alpha** | Implemented in `app/` and verified |
| **Designed** | Specified now, build after the rip works |
| **Parked** | Possible later. Not rejected |
| **Invert** | We looked at it and did the opposite |
| **Notes only** | Speaker notes / aside. Not a slide, not a design input |
| **Rejected** | We decided no |
| **Superseded** | Was locked earlier; a later product decision replaced it |

Where the long version lives is in the last column.

---

## North star and job

| Idea | Status | Lives in |
|---|---|---|
| Free digital collect-only TCG of lists / members / symbols / platforms | Locked, Pitch, Shipped Alpha | GDD, alignment, C, `app/` |
| Bait = pack dopamine. **Goal** = teach Israeli politics → smart vote + show-up. In the current PoC, quote cards use the quotation plus source receipt instead of an additional long back essay | Locked, Pitch C+D, current PoC simplified | one-pager, alignment, C, D, `app/public/app.js` |
| **אוריינות פוליטית** — a smart vote | Locked, Pitch | alignment §1, C slide 10 |
| Subgoal: stay objective. Game never picks a side | Superseded after pre-PoC feedback | Original GDD, C |
| Disclosed advocacy edition: sponsor/viewpoint visible; quote selection may make a case | Locked for feedback-focused PoC; profile configuration required | `app/data/advocacy.json`, poc-feedback-response |
| One common program: orientation → issue contrast → decision readiness | Locked, Shipped Alpha infrastructure | poc-feedback-response, card walkout metadata |
| Real activity only; exact quote + speaker/date/source/context/rationale | Locked, Shipped Alpha | advocacy profile, source registry, server events |
| Reward any pro-voting / pro-knowledge activity | Locked | GDD reward taxonomy |
| המטרה מקדשת את האמצעים — empty of lore on purpose | Locked, Pitch | alignment §3, C empty-of-lore |
| Jam goals: knowledge, socials, voting, taking choices, literacy, fight AI fake news via knowledge, young audience | Locked | alignment table |
| \* Helps Democrats more (uninformed default is anti-Democrat) | Notes only | C speaker notes. Not a slide. Not a design input |

---

## Audience and pitch story

| Idea | Status | Lives in |
|---|---|---|
| 18–24 / first-timers (~595–640k, ~six seats) | Locked, Pitch | one-pager, citations, C |
| 46.7% vs 74.9%; national 70.6% | Locked, Pitch | citations, C |
| Intention surveys run hot (2013 88% → 67.8%) | Locked, Pitch | one-pager, C |
| Do **not** claim “2026 youth will not vote” or invent a knowledge % | Locked | citations forbidden lines |
| New voters may default to parents | Locked, Pitch | alignment §2, C |
| May not care (war, load) | Locked, Pitch | alignment §2, C |
| TikTok / viral fake news as civics class | Locked, Pitch | alignment, C |
| Afraid to show an opinion → anonymous camp | Locked, Pitch | GDD camps, C trait→game |
| Parents fail: rebellion + emotionally invested | Locked, Pitch | alignment, C |
| Lived examples: “Bennett is a bro”; brother; Hadar Muchtar | Locked, Pitch | C slide 7, notes |
| 47s attention (Gloria Mark) | Locked, Pitch | citations, C |
| Age of wars and TikTok | Locked, Pitch | one-pager, C |

---

## Why cards / why digital (the proofs)

| Idea | Status | Lives in |
|---|---|---|
| **State Makers / יוצרים מדינה** — 98-card Israeli history TCG, packs of 8, holos, first edition sold out. [Piece of History](https://www.pieceofhistory.com/statemakers) | Locked, Pitch | C own slide, sources, citations |
| **Pocket — five takes:** (1) daily timed pack (2) rip ritual (3) set collecting (4) rarity you screenshot (5) quick session | Locked, Pitch | digital-collectibles, C |
| Pocket scale ~150M / ~$1.3B; earlier digital Pokémon stalled without collecting | Locked | digital-collectibles, notes |
| We take Pocket’s **door**, not the shop / battles / hourglasses | Locked | digital-collectibles invert table |
| Digital collectible musts + **knowledge on top** (hold → flip back; extra pack = quiz on pulled card) | Locked, Pitch D (essence on C) | digital-collectibles §4, D |
| TCG rising trend (Pokémon, One Piece, Riftbound, Cyberpunk, sports, Life TCG, US politics cards). Hit the iron | Locked, Pitch C+D | one-pager insight, sources, C, D |
| [outbid.lol](https://outbid.lol) — people/companies pay to sit on a viral ladder; we invert: nobody pays | Locked, Pitch | C, sources, GDD leaderboard |
| Why not a quiz app? Quiz apps are not a daily habit for this age | Locked | digital-collectibles, notes |

---

## Loop, packs, cards

| Idea | Status | Lives in |
|---|---|---|
| One free pack / 24h | Locked, Shipped Alpha | GDD, `app/server/` |
| Maybe every **8 hours** as a live-ops lever | Parked | GDD: not Alpha default (“more hostile”) |
| 6 cards / pack (faster than State Makers’ 8); print the mix 3C/2U/1R-or-H | Locked, Shipped Alpha | GDD, `app/server/pack-engine.js` |
| Tear → spread → **hook → receipt → faction/type → silhouette → identity → full back** | Locked, Shipped Alpha | visual-system, feedback response, `app/public/` |
| Equal 8-card skeleton per list + 4 commons | Superseded for the next PoC content pass; implemented only in the current Alpha | card-bible, poc-cards (28), `app/data/cards.json` |
| **PoC v2 party structure:** 1 symbol + 2 exact manifesto excerpts + top 4 chosen members × 3 distinct sourced quote cards = **15 cards per party** | Locked, not implemented | 45 party cards + 4 retained shared commons = 49; `poc-set-structure-v2.md` |
| Every top-four member gets cards `01 / 02 / 03`: three different real quotations, three related but visibly different portraits/poses, one stable identity style | Locked, not implemented | Quote/source manifest + Weave portrait pipeline required |
| **Legendary / Aces promotion set** — exceptional, highly recognizable quotations released through dated event windows rather than ordinary daily packs. First PoC candidate: Netanyahu, “אם היו מעירים אותי בבוקר ה־7 באוקטובר, זה היה נראה אחרת.*” with the asterisk linking to the exact recorded wording and context | PoC extension backlog; outside the base 49-card random pool | Event id, active window, server-issued entitlement, source status, and permanent binder record required |
| PoC: Likud / Democrats / Ra'am (map spread, not the three largest) | Locked, Shipped Alpha | poc-cards, `app/data/cards.json` |
| Daily holo **date** as screenshot caption | Final product; explicitly removed from PoC v2 | GDD rarity |
| Signed / special variants | Parked | first brief |
| **Prestige / Legacy set** — recognizable current and former political figures across parties and eras; archive/status labels distinguish current from former | PoC showcase shipped; pack-ineligible | Oren Hazan, Menachem Begin, and Ehud Olmert examples in `app/data/specials-content.json` |
| **Imitations / satire set** — political characters and impersonations associated with *Eretz Nehederet*; satire cards are labeled as portrayals, never quoted as the real politician, and identify episode/date/performer where relevant | PoC showcase shipped; concept-only and rights-gated | Amsalem and Netanyahu portrayal examples; no show art shipped |
| **שופרות / Mouthpieces set** — disclosed editorial/satirical set about public figures who repeatedly amplify and defend a leader’s line. Cards demonstrate the pattern with dated sourced statements; “blind follower” remains the game’s editorial characterization, not an undisclosed factual claim about motive | PoC showcase shipped; pack-ineligible | Yinon Magal and Yaakov Bardugo examples with repeated-statement evidence |
| Life TCG population print-run | Invert | We do **not** tie to polls. We tie numbered copies to **list slot** (1 → 1/1), same on every list |
| List-slot numbered holos (Likud 1 = 1/1; slot 3 = 1–3/3) | Locked, Pitch D | GDD rarity |
| FIFA-style readable walkout: short minimum beats + player-controlled advance | Shipped Alpha | feedback response, `app/public/app.js` |
| Pity: new-to-them card after 3 dry packs | Locked, Shipped Alpha | GDD, `app/server/pack-engine.js` |
| Hebrew on cards in shipped product; English PoC / pitch | Locked | card-bible |
| No lore, no PvP, no IAP | Locked | GDD non-goals |

---

## Progression and social (beyond faction + cash)

| Idea | Status | Lives in |
|---|---|---|
| Daily login pack | Locked, Shipped Alpha | GDD, `app/` |
| Timed swipe quiz (image + name, role, list, 5:00) → extra pack | Designed | GDD, quiz.md (10 items) |
| Bind progression to **learning** | Locked | GDD, C |
| In-game **faction**: pick a list; packs tally it. **No reward** (not a currency) | Shipped PoC local slice | Server stores anonymous choice; each real pack adds +1 |
| **Real-life** party / kalpi work → **big pack bundle** | Designed | GDD |
| Extra pack = quiz on a card you **already pulled** | Designed, Pitch | GDD, quiz.md, C, D |
| Pledge is **anonymous** | Designed | GDD, alignment |
| Set race / who completes first | Designed (mock UI in Alpha) | GDD, wireframes |
| **10,000 NIS** first-set prize | Parked / pitch concept | GDD legal; Alpha does **not** ship a lottery |
| Influencer seeding (their audience = ours) | Designed (GROWTH on D) | D, GDD roadmap |
| Trading / gifting (friendly virality; knowledge moves) | Simulated async trade shipped; real counterparty later | Persistent give/want offer plus explicitly simulated acceptance and inventory swap |
| Country leaderboard + later groups / leagues | Local collection leaderboard shipped; groups/leagues later | Real anonymous local session inventory only |
| Commons-complete badge (shareable / viral) | Shipped PoC achievement | Server-derived badge shelf in Binder |
| Verified civic volunteer (kalpi / party HQ) → pack bundle | Designed | GDD rewards |
| Opinion survey → **PARTY pack** (matched-list politicians only) | Designed | GDD, alignment |
| Login / literacy streaks (3 / 7) | Designed | GDD progression |
| Share-the-pull + exact-card/referral link + duplicate gift/trade preview | Shipped; explicit WhatsApp action added | GDD, bootstrap playbook, `app/public/app.js` |
| News / live **polls** in the game | Invert on polls | Pulse = CEC facts only, maybe later. No live polls in our voice |

---

## Presentation versions (all kept)

| Deck | Job | Path |
|---|---|---|
| **C — ~10 min civic story** | % → examples → literacy → State Makers → Pocket → iron hot → bait vs goal → QR | [presentation/pitch/](../presentation/pitch/) |
| **D — 22 dense slides + long notes** | Product deck, **intertwined on purpose**: each civic claim earns a product line. Prove → lived table → literacy → trait→format → State Makers / Pocket / iron → bait → musts → loop → quiz → three choice mechanics → slots → content → stay/growth/build. Cut later. | [presentation/pitch-d/](../presentation/pitch-d/) |
| A | Product-brief argument | [presentation/index.html](../presentation/index.html) |
| B | Story only, no ask | [presentation/story/](../presentation/story/) |
| Citations | Numbers you may say | [citations.md](../presentation/citations.md) |
| AI-art deadline argument | Jam community anti-AI art | visual-system + B/C notes |

Ask is one last slide. Contest + possible partners deduced; do not split the room.

---

## Implementation (when we build)

| Idea | Status | Lives in |
|---|---|---|
| HTML first (approachability) | Locked, Shipped Alpha | part-2.md, `app/public/` |
| Server-authoritative pulls; client displays | Locked, Shipped Alpha | part-2.md, GDD security, `app/server/` |
| Guest / one-tap account | Shipped Alpha (guest token) | GDD, `app/server/store.js` |
| Weavy / Figma Weave for stills, rip, UI, promo video | Locked craft | part-2, visual-system |
| Agent skills: `frontend-design` + `kalpi-frontend` | Locked craft | `.cursor/skills/` |
| Visual tokens (paper/ink/foil, 8px pip) | Locked, Shipped Alpha | visual-system, hero-cards, wireframes, `app/public/styles.css` |
| QR to prior jams [guygir.itch.io](https://guygir.itch.io) | Pitch | C empty-of-lore |

---

## Still open (not lost — just unfinished)

- [ ] Survey **items** + published scoring table (neutrality pass)
- [ ] Public jam-page URL (goals already transcribed)
- [ ] You review Pitch C + this inventory; mark anything that still feels missing
- [ ] Legal if 10k NIS ever becomes real
- [ ] Artist pass if a partner funds it

---

## How to use this file

1. Pitch C stays short. Do not dump this list on stage.
2. When we add an idea in chat, **add a row here in the same turn.**
3. If you cannot find something, search this file first, then the “Lives in” path.
