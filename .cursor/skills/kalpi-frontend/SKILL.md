---
name: kalpi-frontend
description: Build Kalpi UI. Use when writing or restyling the game frontend, pack rip, binder, cards, or promo pages. HTML-first, visual-system tokens, server-authoritative pulls, Weavy for generated motion.
---

# Kalpi frontend

Read before writing UI:

1. `docs/design/visual-system.md` — tokens, frame, rarity, pack beats. **The brief wins.**
2. `docs/design/wireframes.html` and `docs/design/hero-cards.html`
3. `docs/implementation/part-2.md` — HTML, security, Weavy
4. `.cursor/skills/frontend-design/SKILL.md` — craft (avoid generic AI UI)

## Rules

- **HTML + CSS + a little JS.** No framework unless the user asks.
- Palette, type, and card chrome come from the visual system. Do not invent a new cream/terracotta or acid-green default.
- Party color is an **8px pip** only. Never a full-bleed wash.
- Pack open: tear → spread → **hook → source cue → faction/type → silhouette → identity → full back**. The FIFA-style walkout buys reading time; never skip provenance or context as the default.
- The feedback-focused PoC is a **disclosed advocacy edition**. Keep the advocacy strip visible, selection rationale inspectable, game rules common, and activity totals real.
- The client **displays** pack results. It does not invent them. Wire to a server pull; never persist inventory from the client as source of truth.
- Motion: CSS first. Respect `prefers-reduced-motion` (keep the flip, drop shimmer).
- RTL-ready frames even when copy is still English.
- Weavy / Figma Weave for stills, rip loops, and promo videos — generate, then cut into `docs/design/assets/`. Civic objects and letters, not scraped press faces.
