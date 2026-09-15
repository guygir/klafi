export const PROMPT_TEMPLATE_VERSION = "klafi-weave-card-v2";

const MEMBER_POSES = [
  "Near-frontal direct gaze, shoulders mostly square to camera; quiet, iconic introduction.",
  "Three-quarter speaking orientation with a restrained natural hand gesture; clear change from image 01.",
  "Contextual three-quarter portrait, seated or standing as the scene requires; clear change from images 01 and 02.",
];

export function cardFilename(party, member, card) {
  const person = member.nameEn
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `portrait-${party.id.toLowerCase()}-${String(member.slot).padStart(2, "0")}-${person}-${card.slot.toLowerCase()}.png`;
}

export function buildWeavePrompt({ party, member, card }) {
  if (!card?.quote?.displayText?.trim()) return "";
  const reference = member.identityReference?.url || "ADD_APPROVED_IDENTITY_REFERENCE";
  const license = member.identityReference?.license || member.identityReference?.status || "record-status";
  const scene = card.editorial?.scene || "restrained contemporary civic setting";
  const flavor = card.editorial?.flavor?.trim()
    ? `Added editorial symbolism: ${card.editorial.flavor.trim()}. This is symbolic framing, not documentary evidence.`
    : "No added symbolic prop.";
  const quoteStatus = card.quote.status || "researching";

  return `KLAFI WEAVE CARD · ${card.id}

SUBJECT
${member.nameEn} · ${member.nameHe}
${party.displayNameEn} · ${party.displayNameHe} · candidate slot ${member.slot}
Identity reference: ${reference}
Reference license/status: ${license}

QUOTE CONTEXT — DO NOT RENDER TEXT
${card.quote.displayText}
Classification: ${quoteStatus}
Date/context: ${card.quote.date || "research-needed"} · ${card.quote.context || "research-needed"}
Editorial treatment: ${member.treatment}

COMPOSITION
${scene}
${flavor}
Any generated prop, lighting cue, or scene treatment is editorial symbolic framing, not documentary evidence.

SHARED KLAFI STYLE
Use hero-art-naama-lazimi.png only as the fixed style anchor: recognizable but deliberately non-photoreal editorial portrait, expressive ink-and-gouache brushwork on aged parchment, dark ink linework, tactile archival paper, restrained aged-brass detail, subtle teal reflected light, serious civic mood, and ample crop room. Preserve the politician's facial geometry, age, hair, and recognizable identity from the identity reference. Party identity is rendered later in HTML; do not wash the image in party color.

OUTPUT
One vertical 3:4 PNG portrait. No card chrome or text in the image. Record model/version, seed, identity-reference strength, style-reference strength, prompt, and output review status.
Filename: ${cardFilename(party, member, card)}
Model/version: ${card.art?.modelVersion || "RECORD_AFTER_GENERATION"}
Seed: ${card.art?.seed || "RECORD_AFTER_GENERATION"}
Identity-reference strength: ${card.art?.identityReferenceStrength || "RECORD_AFTER_GENERATION"}
Style-reference strength: ${card.art?.styleReferenceStrength || "RECORD_AFTER_GENERATION"}
Export review: ${card.art?.outputReviewStatus || "pending"}

GLOBAL CONSTRAINTS
No readable text, logos, flags, campaign marks, card border, photorealism, caricature, changed age, face distortion, invented medals or insignia, extra fingers, lip movement, documentary claim, ethnic coding, defamatory visual allegation, invented recipient, or literal reconstruction not supported by the source.`;
}

function memberImageBrief(party, member, card, index) {
  const quote = card.quote || {};
  const editorial = card.editorial || {};
  const populated = Boolean(quote.displayText?.trim());
  const flavor = editorial.flavor?.trim()
    ? `${editorial.flavor.trim()} This is editorial symbolism, not documentary evidence.`
    : "No added symbolic prop.";

  return `IMAGE ${String(index + 1).padStart(2, "0")} · ${card.rarity.toUpperCase()} · ${card.id}
Output filename: ${cardFilename(party, member, card)}
Orientation: ${MEMBER_POSES[index]}
Quote to interpret — NEVER render as text: ${populated ? quote.displayText : "[No quote selected — keep the treatment neutral]"}
Full quote: ${quote.originalText?.trim() || "[not selected]"}
English translation: ${quote.translation?.trim() || "[not available]"}
Date: ${quote.date || "[not available]"}
Source: ${quote.sourceUrl || "[not available]"}
Context: ${quote.context?.trim() || "[not available]"}
Scene direction: ${editorial.scene?.trim() || "restrained contemporary civic setting"}
Additional visual flavor: ${flavor}`;
}

export function buildMemberWeavePrompt({ party, member }) {
  if (!party || !member?.quoteSlots?.length) return "";
  const reference = member.identityReference?.url || "ADD_APPROVED_IDENTITY_REFERENCE";
  const license = member.identityReference?.license || member.identityReference?.status || "record-status";
  const briefs = member.quoteSlots.slice(0, 3)
    .map((card, index) => memberImageBrief(party, member, card, index))
    .join("\n\n");

  return `KLAFI WEAVE · THREE-IMAGE POLITICIAN SET · ${member.id}

TASK
Generate exactly THREE separate vertical 3:4 portrait images in one run, one image for each numbered specification below. Do not combine them into a triptych, grid, contact sheet, or one wide canvas. Keep the politician's identity and the KLAFI finish consistent across all three outputs while making the pose, orientation, scene, quote interpretation, and filename distinct.

SUBJECT
${member.nameEn} · ${member.nameHe}
${party.displayNameEn} · ${party.displayNameHe} · candidate slot ${member.slot}
Identity reference: ${reference}
Reference license/status: ${license}
Editorial treatment: ${member.treatment}

UPLOAD WITH THIS PROMPT
Identity reference for ${member.nameEn}.
Style anchor: hero-art-naama-lazimi.jpg (hero-art-naama-lazimi.webp is an alternate upload format).

SHARED STYLE AND IDENTITY LOCK
Use the Naama Lazimi artwork only as the fixed visual-style anchor. Preserve ${member.nameEn}'s facial geometry, age, hair, eyes, skin tone, and recognizable identity from the politician identity reference; never borrow Naama Lazimi's face. Deliberately non-photoreal editorial portraiture: expressive ink-and-gouache brushwork on aged parchment, dark ink linework, tactile archival paper, restrained aged-brass detail, subtle teal reflected light, serious civic mood, and ample crop room. Party identity is rendered later in HTML; do not wash the portrait in party color.

THREE REQUIRED OUTPUTS
${briefs}

OUTPUT RULES
Return three separate 3:4 image files together. Portrait art only: no card chrome and no rendered quotation. Preserve a consistent face, age, palette, paper texture, crop scale, and finish across the set. Record model/version, seed, identity-reference strength, style-reference strength, prompt, and review status for each image.

GLOBAL CONSTRAINTS
No readable text, logos, flags, campaign marks, party symbols, card border, UI, stars, photorealism, caricature, changed age, face distortion, invented medals or insignia, extra fingers, lip movement, documentary claim, ethnic coding, defamatory visual allegation, invented recipient, or unsupported literal reconstruction. Any prop, lighting cue, or setting treatment is editorial symbolic framing, not documentary evidence.`;
}

export function buildPackImagePrompt() {
  return `KLAFI WEAVE · NEW PACK STILL · ONE CARD

TASK
Generate a front-facing premium paper wrapper for the KLAFI civic card game. This is a one-card pack, not a six-card booster.

BRAND
The Latin wordmark must read exactly KLAFI in clear uppercase Latin letters. Never render KALPI. Never invent KALPI as a watermark, stamp, faded underprint, or spine mark.

STYLE LOCK
Preserve parchment, deep umber, wax-seal teal, antique-gold print, ballot-box illustration, folds, and worn letterpress finish from pack-wrapper.png. Slim physical volume. Centered on a transparent background with generous safe area.

OUTPUT RULES
No hands. No cards outside the wrapper. No extra logos. No photoreal plastic. No modern neon. No additional text. No warped or misspelled lettering. Record model/version, seed, and review status.`;
}

export function buildPackRipPrompt() {
  return `KLAFI WEAVE · NEW PACK RIP VIDEO · ONE CARD

TASK
Image-to-video from the approved pack-wrapper-klafi.png first frame.

MOTION
Locked camera. The top gold serrated seam pulls apart from the center, paper fibers stretch and tear, and the wrapper opens with believable physical resistance. A restrained teal light appears from inside. The two paper lips peel back and exactly one card back rises from the wrapper.

BRAND
The Latin wordmark must remain exactly KLAFI throughout and must never become KALPI.

CONSTRAINTS
No hands. No camera move. No new text. No warped letters or logo. No melting package. No explosion. End on a stable open-wrapper frame suitable for cutting to the one live HTML card reveal.

TARGET
2.0–2.8 seconds, 24 or 30 fps, silent, 9:16 with generous safe area if needed.`;
}
