export function factionLetters(party) {
  const listed = (party?.finalLetters || party?.requestedLetters || [])[0] || "";
  if (listed) return listed;
  if (party?.id === "LIK") return "מחל";
  return "";
}

export function factionLetterArt(party) {
  if (party?.letterChip) return party.letterChip;
  if (party?.id === "LIK") return "ballot-letter-lik.png";
  return "";
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
