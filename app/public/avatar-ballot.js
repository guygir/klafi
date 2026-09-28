export const PARTY_BALLOTS = Object.freeze({
  YSR: { letters: "דרך", chip: "ballot-letter-ysr.png" },
  LIK: { letters: "מחל", chip: "ballot-letter-lik.png" },
  BYD: { letters: "רק", chip: "ballot-letter-byd.png" },
  YB: { letters: "ל", chip: "ballot-letter-yb.png" },
  DEM: { letters: "אמת", chip: "ballot-letter-dem.png" },
  RZ: { letters: "ט", chip: "ballot-letter-rz.png" },
  OTZ: { letters: "ב", chip: "ballot-letter-otz.png" },
  SHS: { letters: "שס", chip: "ballot-letter-shs.png" },
  UTJ: { letters: "ג", chip: "ballot-letter-utj.png" },
  JNT: { letters: "ום", chip: "ballot-letter-jnt.png" },
  RAM: { letters: "עם", chip: "ballot-letter-ram.png" },
  AMH: { letters: "ך", chip: "ballot-letter-amh.png" },
  BW: { letters: "כן", chip: "ballot-letter-bw.png" },
  RSE: { letters: "די", chip: "ballot-letter-rse.png" },
});

export function partyLetterChipNames() {
  return [...new Set(Object.values(PARTY_BALLOTS).map((entry) => entry.chip))];
}

export function factionLetters(party) {
  const official = (party?.finalLetters || [])[0] || "";
  if (official) return official;
  const designed = PARTY_BALLOTS[party?.id]?.letters || "";
  if (designed) return designed;
  return (party?.requestedLetters || [])[0] || "";
}

export function factionLetterArt(party) {
  if (party?.letterChip) return party.letterChip;
  return PARTY_BALLOTS[party?.id]?.chip || "";
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
