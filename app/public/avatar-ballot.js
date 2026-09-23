export function factionLetters(party) {
  return (party?.finalLetters || party?.requestedLetters || [])[0] || "";
}

export function factionLetterArt(party) {
  if (party?.letterArt) return party.letterArt;
  if (party?.id === "LIK") return "hero-art-memchetlammed.png";
  return party?.letterChip || "";
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
