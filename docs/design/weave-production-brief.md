# Kalpi PoC — Figma Weave production brief

Use Weave for reusable still and motion pipelines. Export finished assets into `docs/design/assets/`; the app does not depend on a live Weave graph.

Copy-ready prompts for all 12 PoC politicians: [weave-member-prompts.html](weave-member-prompts.html)

## What created the Naama Lazimi image

Cursor generated `hero-art-naama-lazimi.png` at 3:4 with this exact prompt:

> Vertical 3:4 illustrated collectible-card portrait of Israeli politician Naama Lazimi for a civic election game. Recognizable but deliberately non-photoreal editorial portrait, confident direct gaze, waist-up at a parliamentary lectern, expressive ink-and-gouache brushwork on aged parchment, dark ink linework, restrained red party pip accent only, subtle brass and teal reflected light, serious contemporary civic mood, ample crop room, no logos, no flags, no readable text, no photorealism, no card border, no caricature.

Cursor did not expose its model or seed, so those cannot be copied exactly. In Weave, record the selected model/version and seed beside every approved output.

## Style-anchor bundle

Yes—examples are required if the full set is expected to look authored rather than like 36 unrelated generations. Use each reference only for the layer it controls:

1. **Portrait style anchor:** `hero-art-naama-lazimi.png` controls ink-and-gouache texture, parchment, facial simplification, lighting restraint, and crop density.
2. **Packaging anchor:** `pack-wrapper.png` controls ballot-paper material, civic teal, brass accents, folds, and print wear for pack/rip assets. It must not control facial style or card composition.
3. **Card chrome anchor:** a current rendered Kalpi card or `hero-cards.html` controls the 63:88 frame, insets, pip, typography zones, rarity edge, and footer. Weave produces art only; live HTML renders text and chrome.

Keep these anchors fixed for the whole production run. Generate the first four politicians, place all twelve variants in one contact sheet, and reject the batch if paper tone, line weight, facial realism, crop density, or lighting reads as a different collection. Once approved, lock the model/version, style-reference strength, negative prompt, grade, and export settings. Identity images change per politician; the three style anchors do not.

## Inputs needed for every politician

Create one folder per person:

`<party>/<member-rank>-<slug>/`

Provide:

- Exact English and Hebrew name.
- Party and list rank.
- One clear identity reference is the PoC minimum. A second or third angle is optional and recommended only when identity drifts across variants.
- Source URL, copyright owner where known, and permission/status for using every reference as model input. Reference permission does not imply permission to ship the photograph.
- Three exact, different quotations.
- Speaker, date/date-status, primary or closest source URL, surrounding context, and editorial role for each quotation.
- Any physical detail the illustration must not get wrong.
- Any forbidden treatment.

References may guide identity without being shipped. Do not use a press photograph as the final card image unless its rights are cleared.

## Reusable portrait graph

Recommended node shape:

1. Image inputs: identity references.
2. Image input: approved Naama image as one style reference.
3. Image Describer: extract texture, palette, lighting, and composition from the style reference.
4. Text inputs: politician identity, party pip color, pose variant, setting variant, constraints.
5. Prompt concatenation.
6. Image model comparison: test two suitable models before locking one.
7. Seed node: record a stable base seed per politician.
8. Identity/style reference conditioning available in the chosen model.
9. Upscale.
10. Color grade to the shared paper/ink/brass/teal palette.
11. 3:4 crop.
12. Export PNG.

Use a List Selector or text iterator for the three variants:

- `01`: direct gaze, waist-up, formal lectern or neutral civic setting.
- `02`: three-quarter view while speaking, one restrained hand gesture.
- `03`: seated or standing with a document, committee, field, or issue-specific setting.

Keep identity references and style description fixed. Vary pose and setting. If a fixed seed prevents meaningful pose variation, use three recorded seeds while keeping the same references, model, style text, palette, crop, and grading.

## Reusable portrait prompt

> Vertical 3:4 illustrated collectible-card portrait of {{politician_name}}, an Israeli politician, for the Kalpi civic election game. Recognizable and identity-consistent with the supplied references, but deliberately non-photoreal. {{pose_variant}} in {{setting_variant}}. Expressive ink-and-gouache brushwork on aged parchment, dark ink linework, restrained {{party_pip_color}} accent only, subtle aged-brass details and teal reflected light, serious contemporary civic mood, tactile archival finish, ample crop room around head and shoulders. No logos, no flags, no readable text, no photorealism, no card border, no caricature, no invented medals or insignia, no changed age, no face distortion, no extra fingers.

Generate at least four candidates for each variant; approve one. Do not automatically publish the first output.

## Pack-rip image-to-video graph

Input:

- `pack-wrapper.png`
- Optional clean mask isolating the pack from its dark background.

Graph:

1. Image input.
2. Mask/background separation.
3. Image-to-video model comparison using Kling, Runway, Luma, or another currently available model.
4. Motion prompt.
5. Optional paper-fiber/debris layer.
6. Color grade matching the source frame.
7. Trim to the clean action.
8. Export silent WebM for the app and MP4 for review.

Motion prompt:

> Locked camera. Preserve the exact Kalpi wrapper, seal, lettering, ballot-box drawing, paper texture, and proportions. The top gold serrated seam pulls apart from the center, paper fibers stretch and tear, and the wrapper opens with believable physical resistance. A restrained teal light appears from inside. The two paper lips peel back and six card backs begin to rise together. No hands. No camera move. No new text. No warped letters or logo. No melting package. No explosion. End on a stable open-wrapper frame suitable for cutting to the live HTML card fan.

Configuration target:

- 2.0–2.8 seconds.
- 24 or 30 fps.
- Locked camera and low motion strength first.
- Preserve first-frame composition.
- 9:16 with generous safe area if exact source ratio is unavailable.
- Silent.
- WebM under roughly 2 MB after final compression; MP4 review master may be larger.
- Export a poster PNG and reduced-motion fallback.

The video ends before card identities appear. The server-selected cards and live fan remain HTML.

## Rare-card ambient motion

Use only for the final identity beat of Rare/Holo cards. Do not pre-render quotation, source, party, or name.

Motion prompt:

> Locked portrait crop. Preserve identity and facial structure exactly. Minimal natural breathing, one subtle blink at most, slight fabric movement, and a narrow teal-to-gold light sweep across the illustrated paper texture. No speech, no lip movement, no head turn, no face morphing, no camera orbit, no background replacement, no new objects.

Target 1.2–1.8 seconds, silent WebM. CSS supplies entrance, labels, quote timing, flip, and reduced-motion behavior.

## Binder landing

The actual card-to-slot movement stays in HTML/CSS because the destination depends on server inventory and screen layout. Weave may produce a motion reference:

> One finished paper collectible card moves forward, scales down with physical depth, and settles precisely into an empty binder well. A restrained dust displacement and brief gold edge glint mark contact. Locked top-down camera, no bounce loop, no text changes, no extra cards.

Use the reference to tune a 500–700ms CSS FLIP transition. Do not ship a generic landing video over the live binder.

## Naming

- Portrait stills: `portrait-<party>-<rank>-<slug>-01.png` through `03.png`
- Rare motion: `portrait-<party>-<rank>-<slug>-rare.webm`
- Pack motion: `pack-rip-v01.webm`
- Review masters: same stem with `.mp4`
- Poster/fallback: same stem with `-poster.png`

## Delivery checklist

- Model and version recorded.
- Seed recorded.
- Prompt stored with output.
- Identity references and URLs stored.
- Rights/review status stored.
- Three variants visibly differ in pose or setting but retain identity and style.
- No generated text or party logo baked into portrait art.
- 3:4 crop tested inside the actual card.
- WebM, MP4 master, and reduced-motion fallback supplied for motion assets.
