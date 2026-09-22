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
  decisions: { type: "Government account", typeHe: "חשבון הממשלה" },
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
    rarity: card.rarity || "Promotion",
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
    releaseSetId: card.setId === "decisions" ? "decisions" : card.setId === "records" || card.setId === "current-ministers" ? "records" : "special-events",
    releaseOrder: card.setId === "decisions" ? 3 : card.setId === "records" || card.setId === "current-ministers" ? 4 : 10,
    releaseTier: "event",
    availableFrom: null,
    binderGroup: card.setId === "decisions" ? "decisions" : card.setId === "records" || card.setId === "current-ministers" ? "records" : "specials",
    subjectSet: null,
  };
}

const SET5_LETTERS = "רגע";
const SET5_NAME_HE = "רגעים";
const SET5_NAME_EN = "Moments";
const SET5_PARTY_FALLBACK = Object.freeze({
  "מאי גולן": "LIK",
  "May Golan": "LIK",
});

function normalizePersonName(value) {
  return String(value || "").replace(/[׳'ʼ`״"]/g, "").replace(/\s+/g, " ").trim();
}

function findSet5Match(candidate, parties = [], members = []) {
  const nameHe = normalizePersonName(candidate.nameHe);
  const nameEn = normalizePersonName(candidate.nameEn);
  const member = members.find((item) =>
    normalizePersonName(item.nameHe) === nameHe
    || normalizePersonName(item.nameEn) === nameEn);
  const partyId = member?.partyId
    || SET5_PARTY_FALLBACK[candidate.nameHe]
    || SET5_PARTY_FALLBACK[candidate.nameEn];
  return {
    member: member || null,
    party: parties.find((party) => party.id === partyId) || null,
  };
}

export function runtimeSet5Card(candidate, extras = {}) {
  const { party, member } = findSet5Match(candidate, extras.parties, extras.members);
  const critical = new Set(extras.criticalBloc || []);
  const treatment = party && critical.has(party.id) ? "critical" : "favorable";
  const index = Number(candidate.n) || 0;
  const slot = Number(member?.slot);
  const listSlot = Number.isInteger(slot) && slot > 0 ? slot : null;
  const sourceUrl = (candidate.sources || []).find(Boolean) || "";
  const context = candidate.notes || candidate.art?.note || "";
  return {
    id: `SET5-${String(index).padStart(2, "0")}`,
    set: party?.id || "set-5",
    setName: party?.displayNameEn || SET5_NAME_EN,
    setNameHe: party?.displayNameHe || SET5_NAME_HE,
    letters: (party?.finalLetters || party?.requestedLetters || [SET5_LETTERS])[0],
    displayCode: `${SET5_LETTERS}-${String(index).padStart(2, "0")}`,
    pip: party?.pip || "#1B3A6B",
    title: candidate.nameEn,
    titleHe: candidate.nameHe,
    hebrewTitle: candidate.nameHe,
    type: "Quote",
    typeHe: "ציטוט",
    rarity: candidate.rarity || "Common",
    subtitle: listSlot ? `מקום ${listSlot} · ${party?.displayNameHe || SET5_NAME_HE}` : `${SET5_NAME_HE} · ${party?.displayNameHe || ""}`.replace(/ · $/, ""),
    subtitleHe: listSlot ? `מקום ${listSlot}` : SET5_NAME_HE,
    body: context,
    whyItMatters: candidate.notes || "Selected for Set 5 from the accepted quote pool.",
    source: sourceUrl || "Source pending",
    listSlot,
    set5Index: index,
    artKey: candidate.art?.artKey || null,
    walkout: {
      kind: "quote",
      text: candidate.displayText,
      speaker: candidate.nameHe,
      date: "",
      sourceId: `set5-${String(index).padStart(2, "0")}`,
      sourceLabel: sourceUrl || "Source pending",
      sourceUrl,
      context,
      quoteStatus: candidate.quoteStatus || "exact",
      selectionRationale: candidate.notes || "Accepted Set 5 quote with approved art.",
      flavorDisclosure: "editorial-symbolism-not-evidence",
      releasePhase: treatment === "critical" ? "contrast" : "constructive",
      editorialRole: treatment,
      contentStatus: candidate.art?.status === "approved" ? "approved" : "research-needed",
    },
    eventOnly: false,
    packEligible: true,
    idleEligible: false,
    releaseSetId: "set-5",
    releaseOrder: 5,
    releaseTier: "objective",
    releaseState: "active",
    availableFrom: null,
    binderGroup: "set-5",
    subjectSet: null,
  };
}

export function catalogExtrasFromStudio(studio, set5) {
  return {
    set5: set5 || { candidates: [] },
    parties: studio?.parties || [],
    members: studio?.members || [],
    criticalBloc: studio?.editorialPolicy?.criticalBloc || [],
  };
}

export function expandPublicCatalog(cards, specials = { sets: [], cards: [] }, extras = {}) {
  const set5Cards = (extras.set5?.candidates || []).map((candidate) => runtimeSet5Card(candidate, extras));
  return [
    ...cards,
    ...(specials.cards || []).map((card) => runtimeSpecialCard(card, specials)),
    ...set5Cards,
  ];
}
