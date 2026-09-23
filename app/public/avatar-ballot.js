export const KNOWN_PARTY_LETTERS = {
  YSR: "דרך",
  LIK: "מחל",
  BYD: "ב",
  YB: "ל",
  DEM: "אמת",
  RZ: "ט",
  OTZ: "ב",
  SHS: "שס",
  UTJ: "ג",
  JNT: "ום",
  RAM: "עם",
  AMH: "ך",
  RSE: "די",
  BW: "כן",
};

export const LETTER_CHIP_FILES = ["ballot-letter-lik.png", "ballot-paper.png"];

export function factionLetters(party) {
  const listed = (party?.finalLetters || party?.requestedLetters || [])[0] || "";
  if (listed) return listed;
  if (party?.id && KNOWN_PARTY_LETTERS[party.id]) return KNOWN_PARTY_LETTERS[party.id];
  return "";
}

export function factionLetterArt(party) {
  if (party?.letterChip) return party.letterChip;
  if (party?.id === "LIK") return "ballot-letter-lik.png";
  return "";
}

export function letterChipFiles(parties = []) {
  const files = new Set(LETTER_CHIP_FILES);
  for (const party of parties) {
    const art = factionLetterArt(party);
    if (art) files.add(art);
  }
  return [...files];
}

export function letterChipUrl(file) {
  return `/design-assets/${encodeURIComponent(file)}`;
}

export function avatarBallotState(party) {
  const letters = factionLetters(party);
  const art = factionLetterArt(party);
  const hasFaction = Boolean(party?.id);
  return {
    letters,
    art,
    showLetterArt: Boolean(art),
    showLetterText: Boolean(letters) && !art,
    showBlankSeal: hasFaction && !art && !letters,
    visible: hasFaction,
  };
}
