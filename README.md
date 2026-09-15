# Kalpi / קלפי

Free digital collect-only TCG for Israeli Elections 2026. Pack dopamine is the bait. Political knowledge, participation, and a disclosed editorial case are the product.

**The feedback-focused PoC lives in [`app/`](app/).** It ships the server-authoritative daily pack → persistent empty-card/quote/party letters/portrait/name walkout → contextual back → binder → social artifact loop, plus visible Growth and Studio workspaces.

This build is an **advocacy prototype**, not a neutral election authority. Its sponsor and supported agenda are intentionally marked `configuration-required`; configure both before public release. Rules and activity counts remain real and common to every player.

## Run the Alpha

Requires Node.js 20+ and PostgreSQL. The committed `.env` is local (user `kalpi` / password `change-me`). There are no cloud API keys yet.

```bash
# Homebrew Postgres is enough on this machine. On a fresh PC:
#   brew services start postgresql@14
#   or: cd app && npm run db:up
cd app
npm install
npm run poc
```

Open **http://127.0.0.1:4173**. `/api/health` should report `"backend":"postgres"`. Quiz extra-packs are off (`QUIZ_ENABLED=0`). Public host: Vercel Hobby + Supabase (session pooler `:5432`). Run `npm test` in `app/` for generated content audits plus pack/server/client tests. JSON file fallback remains only when `DATABASE_URL` is unset.

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

**Mandatory / production first**
1. [x] Private GitHub repo https://github.com/guygir/klafi + local PostgreSQL store (`DATABASE_URL`, docker-compose, persist-across-restart test).
2. Public URL https://klafi.vercel.app (Vercel Hobby). Needs Supabase `DATABASE_URL` (session pooler `:5432`) in Vercel env before `/api` works.
3. Production advocacy identity configured for live.
4. CEC / rights / likeness / source approval (release blockers).
5. Account recovery, moderation, public rate limits.
6. Remaining KALPI pack art → KLAFI.

**Then product polish**
7. Unified card pipeline, taller cards, no fake social counts. **In progress.**
8. Quiz polish: two questions on an owned card, 5:00, one extra pack per Jerusalem day. **Shipped as first slice; UI/server bugs being closed.**
9. Hebrew content / copy pass.
10. Recurring phone QA after each slice.

**Later — not next**
11. Anonymous faction tally (scoreboard only; no pack reward).
12. Verified real-life party / kalpi work → pack bundle.
13. Disclosed survey + published scoring table → matched-list party pack.
14. Numbered holos / streaks / CEC pulse (no live polls in our voice).
15. Weavy / Figma Weave promo and rip assets; seed where 18–24 already are.

### Later (designed, not Alpha)

- Legal pass if a 10k NIS prize ever becomes real.
- Artist pass if a partner funds it. Do not wait.

---

## Do not

- Invent a “X% cannot name three parties” stat.
- Treat IDI 80–95% as a turnout forecast.
- Put the Democrats asterisk on a slide.
- Trust the client for RNG or collection.
- Start a React/Unity rewrite before the HTML rip works.
- Compress State Makers to “cards work” or Pocket to “daily rips.” Keep the five takes and the 98-card sold-out history set on stage.
