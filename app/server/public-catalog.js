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

function runtimePromoCard(card, specials) {
  const set = (specials.sets || []).find((item) => item.id === card.setId);
  return {
    id: card.id,
    set: "special-promo",
    setName: set?.nameHe || "אסים",
    setNameHe: set?.nameHe || "אסים",
    title: card.nameHe,
    titleHe: card.nameHe,
    subtitle: "",
    subtitleHe: "",
    type: "Promo",
    typeHe: "פרומו",
    rarity: "Promotion",
    pip: "#c4a35a",
    artKey: card.artKey,
    body: "",
    whyItMatters: card.flavor || "Election Day promo card.",
    source: "",
    letters: "אס",
    displayCode: card.displayCode || "אס-01",
    walkout: {
      kind: "promo",
      text: "",
      speaker: card.nameHe,
      date: card.date || "",
      quoteStatus: "none",
      sourceUrl: "",
      sourceLabel: "",
      contentStatus: card.contentStatus || "approved",
      editorialRole: "promo",
      releasePhase: "event",
      flavorDisclosure: "editorial-symbolism-not-evidence",
    },
    eventOnly: true,
    packEligible: false,
    idleEligible: false,
    releaseSetId: "special-events",
    releaseOrder: 99,
    releaseTier: "event",
    availableFrom: null,
    binderGroup: "special-events",
    subjectSet: null,
    fullartFrame: true,
  };
}

export function runtimeSpecialCard(card, specials) {
  if (card.kind === "promo" || card.quoteStatus === "none") return runtimePromoCard(card, specials);
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
  // An explicit candidate party wins over the members list (e.g. a set 7 placeholder line).
  const partyId = candidate.partyId
    || member?.partyId
    || SET5_PARTY_FALLBACK[candidate.nameHe]
    || SET5_PARTY_FALLBACK[candidate.nameEn];
  return {
    member: member || null,
    party: parties.find((party) => party.id === partyId) || null,
  };
}

const MOMENT_SETS = Object.freeze({
  "set-5": {
    idPrefix: "SET5",
    letters: SET5_LETTERS,
    nameHe: SET5_NAME_HE,
    nameEn: SET5_NAME_EN,
    releaseSetId: "set-5",
    releaseOrder: 5,
    binderGroup: "set-5",
    sourceIdPrefix: "set5",
    indexField: "set5Index",
    fallbackSet: "set-5",
    why: "Selected for Set 5 from the accepted quote pool.",
    rationale: "Accepted Set 5 quote with approved art.",
  },
  "set-6": {
    idPrefix: "SET6",
    letters: "ליכוד",
    nameHe: "ליכודיאדה",
    nameEn: "Likudiada",
    releaseSetId: "set-6",
    releaseOrder: 12,
    binderGroup: "set-6",
    sourceIdPrefix: "set6",
    indexField: "set6Index",
    fallbackSet: "LIK",
    why: "Selected for Set 6 from the accepted Likud quote pool.",
    unplacedLine: true,
    rationale: "Accepted Set 6 quote with approved art.",
  },
  "set-7": {
    idPrefix: "SET7",
    letters: "נשית",
    nameHe: "העצמה נשית",
    nameEn: "Women Empowerment",
    releaseSetId: "set-7",
    releaseOrder: 13,
    binderGroup: "set-7",
    sourceIdPrefix: "set7",
    indexField: "set7Index",
    fallbackSet: "LIK",
    unplacedLine: true,
    why: "Selected for Set 7 (העצמה נשית) from the handoff quote pool.",
    rationale: "Set 7 quote with supplied art.",
  },
  "set-8": {
    idPrefix: "SET8",
    letters: "צדיק",
    nameHe: "צדיקים",
    nameEn: "Religious men",
    releaseSetId: "set-8",
    releaseOrder: 14,
    binderGroup: "set-8",
    sourceIdPrefix: "set8",
    indexField: "set8Index",
    fallbackSet: "RZ",
    unplacedLine: true,
    why: "Selected for Set 8 (צדיקים) from the accepted quote pool.",
    rationale: "Set 8 quote with supplied art.",
  },
});

export function runtimeMomentCard(candidate, extras = {}, setId = "set-5") {
  const meta = MOMENT_SETS[setId] || MOMENT_SETS["set-5"];
  const matched = findSet5Match(candidate, extras.parties, extras.members);
  const member = matched.member;
  const party = matched.party
    || (extras.parties || []).find((item) => item.id === meta.fallbackSet)
    || null;
  const critical = new Set(extras.criticalBloc || []);
  const treatment = party && critical.has(party.id) ? "critical" : "favorable";
  const index = Number(candidate.n) || 0;
  const fromCandidate = Number(candidate.listSlot);
  // A member's list slot only applies when the card shows that member's party.
  const fromMember = !party || member?.partyId === party.id ? Number(member?.slot) : NaN;
  const slot = Number.isInteger(fromCandidate) && fromCandidate > 0 ? fromCandidate : fromMember;
  const listSlot = Number.isInteger(slot) && slot > 0 ? slot : null;
  const sourceUrls = (candidate.sources || []).filter(Boolean);
  const sourceUrl = sourceUrls[0] || "";
  // A card built from more than one event lists every receipt; the first stays the main one.
  const extraSources = sourceUrls.slice(1).map((url, i) => ({
    url,
    label: String(candidate.extraSourceLabels?.[i] || "").trim() || url,
  }));
  // Human-readable receipt label (usually the source headline); fall back to the raw URL.
  const sourceLabel = String(candidate.sourceLabel || "").trim() || sourceUrl || "Source pending";
  const context = candidate.notes || candidate.art?.note || "";
  // A printed list name (נעם) can differ from the 14 game parties. card.set stays the game party.
  const setNameHe = String(candidate.partyNameHe || "").trim() || party?.displayNameHe || meta.nameHe;
  const setName = String(candidate.partyNameEn || "").trim() || party?.displayNameEn || meta.nameEn;
  const ballot = String(candidate.ballotLetters || "").trim();
  const letters = ballot || (party?.finalLetters || party?.requestedLetters || [meta.letters])[0];
  const setLabel = setNameHe;
  const unplacedHe = candidate.gender === "f" ? "לא ממוקמת" : "לא ממוקם";
  return {
    id: `${meta.idPrefix}-${String(index).padStart(2, "0")}`,
    set: party?.id || meta.fallbackSet,
    setName,
    setNameHe,
    letters,
    displayCode: `${meta.letters}-${String(index).padStart(2, "0")}`,
    pip: party?.pip || "#1B3A6B",
    title: candidate.nameEn,
    titleHe: candidate.nameHe,
    hebrewTitle: candidate.nameHe,
    type: "Quote",
    typeHe: "ציטוט",
    rarity: candidate.rarity || "Common",
    subtitle: listSlot ? `מקום ${listSlot} · ${setLabel}` : (meta.unplacedLine ? unplacedHe : `${meta.nameHe} · ${party?.displayNameHe || ""}`.replace(/ · $/, "")),
    subtitleHe: listSlot ? `מקום ${listSlot}` : (meta.unplacedLine ? unplacedHe : meta.nameHe),
    body: context,
    whyItMatters: candidate.notes || meta.why,
    source: sourceLabel,
    listSlot,
    [meta.indexField]: index,
    membershipNote: candidate.partyId ? "" : String(member?.membershipNote || "").trim(),
    // An explicit party line on the card: the members-list "former party" note does not apply.
    partyOverride: Boolean(candidate.partyId),
    artKey: candidate.art?.artKey || null,
    walkout: {
      kind: "quote",
      text: candidate.displayText,
      speaker: candidate.nameHe,
      date: candidate.date || "",
      sourceId: `${meta.sourceIdPrefix}-${String(index).padStart(2, "0")}`,
      sourceLabel,
      sourceUrl,
      ...(extraSources.length ? { extraSources } : {}),
      context,
      quoteStatus: candidate.quoteStatus || "exact",
      selectionRationale: candidate.notes || meta.rationale,
      flavorDisclosure: "editorial-symbolism-not-evidence",
      releasePhase: treatment === "critical" ? "contrast" : "constructive",
      editorialRole: treatment,
      contentStatus: candidate.art?.status === "approved" ? "approved" : "research-needed",
    },
    eventOnly: false,
    packEligible: true,
    idleEligible: false,
    releaseSetId: meta.releaseSetId,
    releaseOrder: meta.releaseOrder,
    releaseTier: "objective",
    releaseState: "active",
    availableFrom: null,
    binderGroup: meta.binderGroup,
    subjectSet: null,
  };
}

export function runtimeSet5Card(candidate, extras = {}) {
  return runtimeMomentCard(candidate, extras, "set-5");
}

export function runtimeSet6Card(candidate, extras = {}) {
  return runtimeMomentCard(candidate, extras, "set-6");
}

export function runtimeSet7Card(candidate, extras = {}) {
  return runtimeMomentCard(candidate, extras, "set-7");
}

export function runtimeSet8Card(candidate, extras = {}) {
  return runtimeMomentCard(candidate, extras, "set-8");
}

export function catalogExtrasFromStudio(studio, set5, set6, set7, set8) {
  return {
    set5: set5 || { candidates: [] },
    set6: set6 || { candidates: [] },
    set7: set7 || { candidates: [] },
    set8: set8 || { candidates: [] },
    parties: studio?.parties || [],
    members: studio?.members || [],
    criticalBloc: studio?.editorialPolicy?.criticalBloc || [],
  };
}

export function memberIdFromCardId(cardId) {
  const match = /^([A-Z]+-M\d{2})/.exec(String(cardId || ""));
  return match ? match[1] : "";
}

export function attachMembershipNotes(cards, members = []) {
  const byMemberId = new Map();
  const byName = new Map();
  for (const member of members) {
    const note = String(member.membershipNote || "").trim();
    if (!note) continue;
    byMemberId.set(member.id, note);
    const nameHe = normalizePersonName(member.nameHe);
    const nameEn = normalizePersonName(member.nameEn);
    if (nameHe) byName.set(nameHe, note);
    if (nameEn) byName.set(nameEn, note);
  }
  for (const card of cards) {
    if (String(card.membershipNote || "").trim() || card.partyOverride) continue;
    const note = byMemberId.get(memberIdFromCardId(card.id))
      || byName.get(normalizePersonName(card.titleHe || card.hebrewTitle))
      || byName.get(normalizePersonName(card.title));
    if (note) card.membershipNote = note;
  }
  return cards;
}

export function expandPublicCatalog(cards, specials = { sets: [], cards: [] }, extras = {}) {
  const set5Cards = (extras.set5?.candidates || []).map((candidate) => runtimeSet5Card(candidate, extras));
  const set6Cards = (extras.set6?.candidates || []).map((candidate) => runtimeSet6Card(candidate, extras));
  const set7Cards = (extras.set7?.candidates || []).map((candidate) => runtimeSet7Card(candidate, extras));
  const set8Cards = (extras.set8?.candidates || []).map((candidate) => runtimeSet8Card(candidate, extras));
  const expanded = [
    ...cards,
    ...(specials.cards || []).map((card) => runtimeSpecialCard(card, specials)),
    ...set5Cards,
    ...set6Cards,
    ...set7Cards,
    ...set8Cards,
  ];
  return attachMembershipNotes(expanded, extras.members || []);
}
