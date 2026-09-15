# קְלָפִי v2 backlog

This file is the explicit boundary for features that must not leak into launch as half-working UI.

## Launch-mandatory, implemented after production identity and database

- WhatsApp sharing with a generated card image and link fallback.
- Instagram Story handoff where the platform supports it; otherwise download the card image and open Instagram.
- Transactional trading with owned-card validation, reservation, cancellation and a 24-hour default expiry.
- Account recovery, moderation hooks, rate limits and abuse reporting for public names and trades.

## v2 candidates

- Quiz rewards and quote comprehension checks.
- Streaks beyond the capped idle-return queue.
- Survey-based political matching.
- Real gifting.
- Expanded factions, leagues and seasonal ladders.
- Holo treatments and numbered unique cards.
- PWA installation and push notifications.
- Prize campaigns:
  - prize for the first verified full-set completion;
  - weighted draw where a player’s chance is their distinct-card count divided by the total distinct-card count of all eligible entrants.

## Gate

Moving an item out of this file requires an owner, abuse analysis, data model, player-facing Hebrew copy, analytics event, tests, rollback path and release window.
