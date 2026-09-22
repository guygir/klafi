# Kalpi / קלפי

Free digital collect-only TCG for Israeli Elections 2026. Pack dopamine is the bait. Political knowledge, participation, and a disclosed editorial case are the product.

**The feedback-focused PoC lives in [`app/`](app/).** It ships the server-authoritative daily pack → persistent empty-card/quote/party letters/portrait/name walkout → contextual back → binder → social artifact loop, plus visible Growth and Studio workspaces.

This build is an **advocacy prototype**, not a neutral election authority. Its sponsor and supported agenda are intentionally marked `configuration-required`; configure both before public release. Rules and activity counts remain real and common to every player.

## Run the Alpha

Requires Node.js 20+ and PostgreSQL. Copy [`.env.example`](.env.example) to `.env` for local use (`kalpi` / `change-me` on `127.0.0.1`). Live Supabase credentials stay in Vercel env only.

```bash
# Homebrew Postgres is enough on this machine. On a fresh PC:
#   brew services start postgresql@14
#   or: cd app && npm run db:up
cd app
npm install
npm run poc
```

Open **http://127.0.0.1:4173**. `/api/health` should report `"backend":"postgres"`. Quiz extra-packs are off (`QUIZ_ENABLED=0`). Public host: Vercel Hobby + Supabase; configuration keeps the session-pooler URL for migrations, while Vercel runtime traffic uses transaction mode. Run `npm test` in `app/` for generated content audits plus pack/server/client tests. JSON file fallback remains only when `DATABASE_URL` is unset.

Use the bottom navigation: **Today** for the pack, **Binder** for the collection, **Growth** for trading/creator links/funnel activity, and **Studio** for sponsor configuration status, card review, walkout replay, and debug reset. Full implementation map: [docs/product/poc-implementation-review.md](docs/product/poc-implementation-review.md).

For a reproducible rehearsal, open **Studio → Run six-card guided demo**. It preserves the real 3C/2U/1R composition but does not change inventory, pity, events, or the daily cooldown. Demo sequence: [docs/content/poc-demo-sequence.md](docs/content/poc-demo-sequence.md) · first test kit: [docs/growth/poc-test-kit.md](docs/growth/poc-test-kit.md).

Creator/referral demonstrations:

- `http://127.0.0.1:4173/?ref=creator-name`
- `http://127.0.0.1:4173/?card=DEM-Q-01&ref=creator-name`
- Duplicate gift/trade preview links are created from the binder; ownership does not transfer in this PoC.

Feedback response: [docs/product/poc-feedback-response.md](docs/product/poc-feedback-response.md) · bootstrap: [docs/growth/bootstrap-playbook.md](docs/growth/bootstrap-playbook.md) · content pipeline: [docs/content/editorial-pipeline.md](docs/content/editorial-pipeline.md)

**Review everything 1 by 1 (Pitch C last):** open [docs/review/index.html](docs/review/index.html) in a browser.

Start here: [docs/README.md](docs/README.md) · **product hat:** [docs/product/alignment.md](docs/product/alignment.md)

**Everything we talked about** (including ideas that do not fit on the pitch): [docs/product/idea-inventory.md](docs/product/idea-inventory.md). Pitch C is the story for the room. The inventory is the product memory.

- **Pitch C (23 slides, civic story):** [docs/presentation/pitch/index.html](docs/presentation/pitch/index.html)
- **Pitch D (22 dense slides, strategy+product intertwined + long notes):** [docs/presentation/pitch-d/index.html](docs/presentation/pitch-d/index.html)
- PPTX C / D: under `docs/presentation/pitch/` and `pitch-d/`
- Hero cards: [docs/design/hero-cards.html](docs/design/hero-cards.html)
- Wireframes: [docs/design/wireframes.html](docs/design/wireframes.html)

---

## Steps onwards

Keep this list current. Check a box only when it is actually done.

### Product and pitch

- [x] Original civic north star: **אוריינות פוליטית** + show-up.
- [x] Feedback pivot: disclosed advocacy edition; editorial selection may make a case, while rules, provenance, and recorded activity stay fixed.
- [x] Audience: new voters / parent default / don’t-care / TikTok fakes / afraid to speak → anonymous camp.
- [x] Pitch spine: Bennett-is-a-bro + brother + Hadar → why not parents → literacy. Asterisk (Democrats) in **notes only**.
- [x] Link [outbid.lol](https://outbid.lol) as proof people pay for a viral ladder; we invert (nobody pays).
- [x] QR on empty-of-lore slide → [guygir.itch.io](https://guygir.itch.io).
- [x] Party pack (survey → matched-list politicians) designed, not built.
- [x] Progression beyond faction + $$ (streaks, holos, quiz, commons, share stamps).
- [x] Security rule locked: **server pulls**; client displays.
- [x] Pocket five on the pitch: daily pack / rip ritual / set chase / rarity screenshot / quick session.
- [x] State Makers / יוצרים מדינה restored as its own beat (98 cards, sold out, teaches Israel).
- [x] List-slot numbered holos (1 → 1/1). Extra pack = quiz, not pledge. Trading + boards designed.
- [x] Pitch D (~15 min) for game / musts / growth. C stays the shorter civic story.
- [x] Product review completed; implementation authorized.
- [ ] Write the actual survey items + published scoring table with the advocacy identity disclosed.
- [ ] Confirm the public jam-page URL if we find it (goals are already transcribed).

### Expanded PoC — shipped

- [x] Vanilla HTML/CSS/JS, responsive 390×844-first UI.
- [x] Node server owns guest sessions, daily eligibility, RNG, pity, instances, and inventory.
- [x] Canonical 14-party / 51-politician Studio with 149 sourced quote cards, 14 symbols, 28 policy cards, and four commons.
- [x] Variable 195-card playable catalog generated from approved populated Studio records; four sparse slots stay visible but are pack-ineligible.
- [x] Existing-art pack → empty card → quote/fact below → party + ballot letters → portrait → name → full context → binder.
- [x] Set filters, missing wells, duplicate counts, completion %, source links, and disclosed share image.
- [x] Exact-card/referral links, real aggregate events, and duplicate gift/trade preview.
- [x] Dynamic Studio editing, atomic debug-only persistence, per-card/member Weave copy, party export, source review, and local debug reset.
- [x] Reproducible six-card guided demo with integrated core art and unchanged daily state.
- [x] Embedded provenance, exact/shortened/paraphrase classifications, editorial roles, identity references, and generated audit.
- [x] Automated roster/sparse-slot/prompt/pack/API/persistence/isolation/content/client tests.

### Next extensions — in this order

Reorder in the Cursor implementation-plan canvas. After every step: verify on phone + desktop before starting the next.

**Shipped**
1. [x] GitHub repo https://github.com/guygir/klafi + local PostgreSQL store (`DATABASE_URL`, docker-compose, persist-across-restart test).
2. [x] Public URL https://klafi.vercel.app (Vercel Hobby + Supabase transaction-pooled runtime). `/api/health` is `backend=postgres`. Quiz and debug stay off. **Live-deploy monitoring is not done; it ships last with step 16.**
5. [x] Account recovery and moderation. Guest recovery code in the profile (copy / restore against the existing session). Card and public-name reports share the Studio queue. Gameplay stays unthrottled; anonymous-session abuse protection belongs at the edge.
6. [x] Remaining KALPI pack art → KLAFI. Live pack still is `pack-wrapper-klafi.png` (KLAFI / קְלָפִי). The old KALPI wrapper and Seedance rip stay as reference only.
7. [x] Unified card pipeline, taller cards, no fake social counts. One `--card-width` token sizes walkout, dialog and share. Quote-fit keeps a readable floor on binder/peek/trade. Trades use the same renderer and dialog.
11. [x] Community loop: anonymous faction tally, honest country leaderboard, real transactional trading/gifting, sharing/referrals and creator acquisition links. One open offer per player, slim board, server accept, race from real pulls, level bonus card, party pip on the avatar.

**Active**
9. [x] Hebrew, trust and accessibility pass: player copy, advocacy disclosure, source receipts, dated CEC/status labels, keyboard/reduced-motion behavior and screen-reader labels. Visible advocacy strip, skip-to-content, named player dialogs, plural אתם voice, dated CEC/source receipts on walkout, share image, faction desk, binder missing slots, and the card dialog. Reduced-motion walkout jumps to the readable card; pack arrows work in both directions.
10. Recurring phone + desktop QA after every slice: real-device WhatsApp/Instagram handoff, recovery, moderation, replay-safe writes. **Ongoing.**

**Dropped by product decision**
3. Production advocacy identity configured for live. **No need.**
4. CEC / rights / likeness / source approval. **No need.**
8. Learning loop (owned-card quiz). **No need.** Player option already removed; server stays parked.
12. Verified real-life party / kalpi work → pack bundle. **No need.**
13. Disclosed survey + published scoring table → matched-list party pack. **No need.**

**Design first — do not implement yet**
14. [x] Numbered set-5 holos (print run 3, lined red 1/x, ★★★★ ממוספר) + login streak on the avatar stack. Live start is sets 1, 2, and 5 at pack odds 3:2:1. Only idle grants stamp. Ballot-letter tag top-left, fire streak top-right, rank below the avatar. Daily-date holos and CEC pulse stay parked.
15. Platform/live-ops: PWA + push, groups/leagues/seasonal ladders, event-controlled Specials, creator seeding. **Brainstorm design — review** [open the HTML](https://raw.githack.com/guygir/klafi/cursor/hebrew-trust-a11y-025e/docs/design/step-15-platform-liveops.html). Events player surface stays deferred.

**Last**
16. Pack-open animation branded KLAFI (Weavy/video) **and** step 2 live-deploy monitoring. CSS peel is parked. Extra Weavy promo loops stay with the step 14 design.

### Later (designed, not Alpha)

- Legal pass if a 10k NIS prize ever becomes real.
- Artist pass if a partner funds it. Do not wait.
- Prize campaigns remain parked until ownership, eligibility, abuse and lottery-law review are complete.

---

## Do not

- Invent a “X% cannot name three parties” stat.
- Treat IDI 80–95% as a turnout forecast.
- Put the Democrats asterisk on a slide.
- Trust the client for RNG or collection.
- Start a React/Unity rewrite before the HTML rip works.
- Compress State Makers to “cards work” or Pocket to “daily rips.” Keep the five takes and the 98-card sold-out history set on stage.
