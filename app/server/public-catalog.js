const SPECIAL_LETTERS_BY_SET = {
  "legendary-aces": "אס",
  "prestige-legacy": "מורשת",
  mouthpieces: "שופר",
  "satire-imitations": "סאטירה",
  records: "רקורד",
  "current-ministers": "שר",
};

const SPECIAL_TYPE_BY_SET = {
  records: { type: "Record", typeHe: "רקורד" },
  "current-ministers": { type: "Ministerial record", typeHe: "שר בתפקיד" },
};

export function runtimeSpecialCard(card, specials) {
  const set = (specials.sets || []).find((item) => item.id === card.setId);
  const setIndex = (specials.cards || []).filter((candidate) => candidate.setId === card.setId).findIndex(({ id }) => id === card.id) + 1;
  const specialLetters = SPECIAL_LETTERS_BY_SET[card.setId] || "מיוחד";
  const specialType = SPECIAL_TYPE_BY_SET[card.setId] || { type: "Special", typeHe: "מיוחד" };
  return {
    id: card.id,
    set: `special-${card.setId}`,
    setName: set?.nameHe || card.setId,
    setNameHe: set?.nameHe || card.setId,
    title: card.nameHe,
    titleHe: card.nameHe,
    subtitle: card.displayText,
    subtitleHe: card.displayText,
    type: specialType.type,
    typeHe: specialType.typeHe,
    rarity: "Promotion",
    pip: "#c4a35a",
    artKey: card.artKey,
    body: card.context,
    whyItMatters: card.flavor,
    source: card.sourceTitle,
    letters: specialLetters,
    displayCode: `${specialLetters}-${String(setIndex).padStart(2, "0")}`,
    walkout: {
      kind: card.quoteStatus === "fact-record" ? "fact" : "quote",
      text: card.displayText,
      speaker: card.nameHe,
      date: card.date,
      quoteStatus: card.quoteStatus,
      sourceUrl: card.sourceUrl,
      sourceLabel: card.sourceTitle,
      contentStatus: card.contentStatus,
      editorialRole: card.setId,
      releasePhase: "event",
    },
    eventOnly: true,
    packEligible: false,
    idleEligible: false,
    releaseSetId: card.setId === "records" || card.setId === "current-ministers" ? "records" : "special-events",
    releaseOrder: card.setId === "records" || card.setId === "current-ministers" ? 4 : 10,
    releaseTier: "event",
    availableFrom: null,
    binderGroup: card.setId === "records" || card.setId === "current-ministers" ? "records" : "specials",
    subjectSet: null,
  };
}

export function expandPublicCatalog(cards, specials = { sets: [], cards: [] }) {
  return [...cards, ...(specials.cards || []).map((card) => runtimeSpecialCard(card, specials))];
}
