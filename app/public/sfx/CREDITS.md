# Klafi SFX credits

Each clip ships as `.ogg` (Vorbis q4, mono) plus an `.m4a` (AAC 80 kbps) fallback.
Processing: mono, source sample rate kept. Rips had sub -50 dBFS lead-in trimmed (20 ms kept, 5 ms fade in).
Trailing audio under -60 dBFS was trimmed (30 ms kept, 20 ms fade out). For the rarity clips that tail was digital silence.
Levels are unchanged from the locked kit.

| File | Role | Source | License |
|------|------|--------|---------|
| `rip-pc4` | pack rip (cycle 1/3) | Pixabay, "Paper Rip Fast" by TanwerAman (id 252617), https://pixabay.com/sound-effects/film-special-effects-paper-rip-fast-252617/ | Pixabay Content License (free commercial use, no attribution required; don't resell unmodified) |
| `rip-pc7` | pack rip (cycle 2/3) | BigSoundBank / La Sonothèque, "Torn paper #6" (#3243) by Joseph Sardin, https://bigsoundbank.com/s3243.html | CC0 |
| `rip-pc11` | pack rip (cycle 3/3) | Mixkit #2378 "Scissors cutting paper", trimmed to the first two snips, https://mixkit.co/free-sound-effects/scissors-cutting-paper/ | Mixkit Sound Effects Free License (https://mixkit.co/license/#sfxFree) |
| `click` | primary button click (G5) | Mixkit, derived (warmer variant) | Mixkit Sound Effects Free License |
| `reveal-quote` | quote reveal (K, confirmation_001 pitched -2) | Kenney Interface Sounds, confirmation_001, https://kenney.nl/assets/interface-sounds | CC0 |
| `reveal-party` | party reveal (I, pitched +2) | Kenney Interface Sounds, confirmation_001 | CC0 |
| `rarity-1` | common reveal (J, pitched +4) | Kenney Interface Sounds, confirmation_001 | CC0 |
| `rarity-2` | uncommon reveal (J stacked) | derived from J | CC0 |
| `rarity-3` | rare reveal (R3: 3 J stacks at 120/280/550 ms) | derived from J | CC0 |
| `rarity-4` | holo/numbered reveal (T4d3b: J stacks, hit, card-land thud, brass C-E-G-C5) | original synthesis + J | CC0 source; the synthesis is original to Klafi |

Pack-rip clips cycle in order (PC4, PC7, PC11, then repeat). The cycle is not random. The index is kept in `localStorage` (`klafi:sfx-rip-index`).
