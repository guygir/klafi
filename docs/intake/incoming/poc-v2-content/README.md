# PoC v2 content intake

The 49-card code/data migration starts after these two manifests are complete enough to validate.

## 1. `roster-and-quotes.csv`

For every party:

- Confirm or replace the four member names.
- Review the two exact platform excerpts now researched for each party. Likud uses its July 2015 constitution, the Democrats use their August 2026 policy plan, and Ra’am temporarily uses two dated party-policy statements because no current official manifesto was located.
- Supply three exact, different quotations for each of four members.
- Add dates, source URLs, context, and editorial roles.
- Confirm the official ballot symbol and source.

Do not translate first and source later. Store the exact original-language text, then add a reviewed English translation if needed.

## 2. `portrait-references.csv`

The agent owns this research; no user-supplied photographs are required. For each of the 12 members:

- Add one clear identity-reference path or URL. A second or third angle is optional and only needed if the generated likeness drifts.
- Record who owns the required reference and whether it may be used as a generation reference. This is separate from permission to publish the photograph itself.
- Add any identity detail the generation must not get wrong.
- Approve or revise the three pose/setting concepts.

References may guide generated art without becoming the shipped image. The current rows use explicitly licensed Wikimedia Commons file pages and mark every photograph `internal-reference-only`.

## Completion signal

Tell the agent “PoC v2 content packet ready.” Draft rows may remain, but every empty field must be deliberately marked `research-needed`, not silently omitted.
