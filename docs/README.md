# Kalpi — artifacts

Civic collectible TCG for Israeli Elections 2026. Product/design artifacts live here; the first playable implementation lives in [`../app/`](../app/). Next steps and run instructions live in the root [README.md](../README.md).

| Artifact | Path |
|---|---|
| **Playable Alpha** | [`../app/`](../app/) · run at `http://127.0.0.1:4173` |
| **Current ping-pong handoff** | [intake/current-step.md](intake/current-step.md) |
| **PoC implementation review map** | [product/poc-implementation-review.md](product/poc-implementation-review.md) |
| **PoC feedback response** | [product/poc-feedback-response.md](product/poc-feedback-response.md) |
| **Reproducible six-card demo** | [content/poc-demo-sequence.md](content/poc-demo-sequence.md) |
| **Locked 49-card PoC v2 structure** | [content/poc-set-structure-v2.md](content/poc-set-structure-v2.md) |
| **PoC art and rights manifest** | [design/poc-asset-manifest.md](design/poc-asset-manifest.md) |
| **Figma Weave production brief** | [design/weave-production-brief.md](design/weave-production-brief.md) |
| **Per-member Weave prompt library** | [design/weave-member-prompts.html](design/weave-member-prompts.html) |
| **First external test kit** | [growth/poc-test-kit.md](growth/poc-test-kit.md) |
| **Bootstrap playbook** | [growth/bootstrap-playbook.md](growth/bootstrap-playbook.md) |
| **Editorial pipeline** | [content/editorial-pipeline.md](content/editorial-pipeline.md) |
| **PoC presentation holding notes** | [presentation/poc-pitch-notes.md](presentation/poc-pitch-notes.md) |
| **Product hat / alignment** | [product/alignment.md](product/alignment.md) |
| **Idea inventory** (everything discussed; on-pitch or not) | [product/idea-inventory.md](product/idea-inventory.md) |
| Strategy one-pager | [strategy/one-pager.md](strategy/one-pager.md) |
| Product / GDD lite | [product/gdd-lite.md](product/gdd-lite.md) |
| Why digital collectibles (Pocket + musts) | [product/digital-collectibles.md](product/digital-collectibles.md) |
| Part 2: HTML, security, Weavy, skills | [implementation/part-2.md](implementation/part-2.md) |
| Card bible (anatomy, rarity, neutrality) | [content/card-bible.md](content/card-bible.md) |
| PoC roster + 28 card backs | [content/poc-cards.md](content/poc-cards.md) |
| Quiz (10 items) | [content/quiz.md](content/quiz.md) |
| Source list | [content/sources.md](content/sources.md) |
| Visual system | [design/visual-system.md](design/visual-system.md) |
| Step 14 design review (holos / streaks / CEC pulse) | [open the HTML](https://klafi-git-cursor-hebrew-trust-a11y-025e-guygirs-projects.vercel.app/design/step-14-holos-streaks-cec.html) · [source](design/step-14-holos-streaks-cec.html) |
| Step 15 design review (PWA / leagues / Specials / seeding) | [open the HTML](https://klafi-git-cursor-hebrew-trust-a11y-025e-guygirs-projects.vercel.app/design/step-15-platform-liveops.html) · [source](design/step-15-platform-liveops.html) |
| Mobile wireframes | [design/wireframes.html](design/wireframes.html) |
| Hero cards | [design/hero-cards.html](design/hero-cards.html) |
| Pitch C (~10 min) | [presentation/pitch/index.html](presentation/pitch/index.html) |
| Pitch D (~20 min if you use the notes; cut later) | [presentation/pitch-d/index.html](presentation/pitch-d/index.html) |
| Speaker notes C | [presentation/pitch/speaker-notes.md](presentation/pitch/speaker-notes.md) |
| Pitch PPTX | [presentation/pitch/kalpi-pitch.pptx](presentation/pitch/kalpi-pitch.pptx) |
| A — product brief | [presentation/index.html](presentation/index.html) |
| B — story only, no ask | [presentation/story/index.html](presentation/story/index.html) |
| Citation card | [presentation/citations.md](presentation/citations.md) |

**C** is 23 slides (civic spine). **D** is 22 **dense** slides, strategy and product **intertwined on purpose** (each civic claim earns a product line), plus long speaker notes. Cut later. Theme tags on D. A and B are references.

**Review in the browser, one page at a time:** [review/index.html](review/index.html) — the final four pages hold the current PoC feedback decision; earlier pitch neutrality language is historical.

Open HTML decks in a browser (arrow keys). Rebuild PPTX with `python3 docs/presentation/pitch/build_pptx.py` and `python3 docs/presentation/pitch-d/build_pptx.py`. Rebuild the review site with `python3 docs/review/build.py`.
