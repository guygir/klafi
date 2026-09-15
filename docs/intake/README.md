# Kalpi PoC intake

This folder is the handoff point for the ping-pong implementation process.

## How each round works

1. `current-step.md` names the active round, requested inputs, blockers, and acceptance gate.
2. Put files for that round under `incoming/<round>/`.
3. Put short written decisions in that round's `answers.md`.
4. Tell the agent that the packet is ready.
5. The agent validates the packet, implements only that round, updates review artifacts and tests, and writes the next request.

## Status meanings

- `awaiting-user` — the requested packet is not complete.
- `ready-for-agent` — the user says the packet is complete.
- `in-progress` — implementation or review is running.
- `awaiting-approval` — deliverables are ready for user acceptance or revision.
- `complete` — the round's gate was explicitly accepted.

## Rules

- Do not treat missing factual or rights information as approved.
- Layout placeholders are allowed only when clearly labeled.
- Keep original assets; create derived crops beside them rather than overwriting them.
- Put URLs and provenance in `answers.md`, not only in filenames.
- The current step is authoritative; later-round material may be deposited early but does not change scope.
