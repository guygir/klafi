# Kalpi — Part 2: implementation

Product stays in [alignment.md](../product/alignment.md) and [gdd-lite.md](../product/gdd-lite.md). This note is stack, security, and craft. **Do not start a framework debate in the pitch.**

---

## Shipped Alpha

The first Alpha ships in [`../../app/`](../../app/): **HTML + CSS + a little JS**, served by a zero-dependency Node server that owns pulls and inventory.

Why HTML:

- Judges and partners can open a file or a URL. No store, no install, no “wait for the build.”
- Matches the jam artifacts we already have (`hero-cards.html`, `wireframes.html`).
- Agents and humans can read and patch the same files.

Later (Hebrew live, accounts, energy board) we can grow the server. The client stays thin.

---

## Security baseline (non-negotiable)

**Where the pull happens, the server pulls.** The saved result must not have gone through the player.

```
player taps “Open” → POST /packs/daily (auth or guest token)
server: check clock / pity / rate limit
server: RNG + pack mix + persist inventory
server: return the six card ids
client: play the rip animation on those ids
```

Never:

- Client sends `{cards: [...]}` as the pull.
- Client writes binder state that the server blindly accepts.
- “Offline pack” that later syncs as gospel.
- Quiz “I got both right” without the server scoring.

Also:

- Extra pack from quiz: server picks the owned card, scores the two swipes, grants or not.
- Party-pack survey: answers go to the server; match + pack seed happen there.
- Camp energy: increment only on a **confirmed** server pack (or quiz).
- Daily numbered holo: server assigns `#1 of 1 today` per identity. Client cannot claim the stamp.

This is baseline civic trust, not a pentest. We are not building a bank. We are making sure the collection is not a cheat sheet.

---

## Frontend & visual skills (for agents)

When we write UI, **read these before coding:**

1. [visual-system.md](../design/visual-system.md) — palette, frame, rarity, pack beats. **This brief wins.**
2. Project skill `.cursor/skills/frontend-design` — Anthropic **frontend-design**: distinctive craft, not generic AI UI. Paper / ink / foil is already our look; do not reinvent a cream-and-terracotta template on top.
3. Do **not** use Awwwards “premium landing page” skills (magnetic cursors, full-bleed heroes) as the game UI. Those are for a promo site if we make one later.

Wireframes to implement first: [wireframes.html](../design/wireframes.html) (home, rip, back, binder). Quiz / energy / pledge screens exist as later frames.

---

## Weavy (Figma Weave) — assets, motion, promo

Weavy was acquired by Figma (Oct 2025) and ships as **Figma Weave**.

- Product: [Figma Weave](https://www.figma.com/solutions/figma-ai-tool-weave/)
- Canvas: [weave.figma.com](https://www.figma.com/solutions/figma-ai-tool-weave/) (account at Weave; Figma login works)
- Node docs still at [help.weavy.ai](https://help.weavy.ai)

Use it to **generate, then rip into the game:**

| Output | Use |
|---|---|
| Still cards / pack wrapper / UI chrome | Drop into `docs/design/assets/` then the client |
| Rip / tear / foil animation | Short loops, WebM/MP4, CSS-clipped |
| Binder slot motion | Reference, then implement in CSS |
| Promo / trailer | Social seed. Vertical for TikTok/Reels |

Generate more than we ship. Cut. Do not paste a raw video node into the Alpha.

Same AI-art argument as the deck: deadline + full-set volume. Civic objects and letters, not scraped press faces.

---

## Alpha build order (completed)

1. [x] Static HTML shell that follows the wireframes.
2. [x] Card renderer (front/back) from the 28 PoC cards.
3. [x] **Server pack endpoint** + atomic JSON persistence. Rip animation on returned ids.
4. [x] Binder from server inventory.
5. [x] Share image (static).
6. [ ] Next: quiz, faction tally, verified volunteer bundle, survey pack, Hebrew pass.

If leftover time fights a framework, we already lost. Stay HTML.

---

## What we will not do in Alpha

- Trust the client for RNG or inventory.
- IAP, hourglasses, live polls.
- A React/Unity rewrite “for later.”
- Outing a pledged list on a public profile.
