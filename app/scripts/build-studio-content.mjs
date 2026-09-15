#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const projectRoot = path.resolve(appRoot, "..");
const researchDir = path.join(projectRoot, "docs/intake/research");
const outputPath = path.join(appRoot, "data/studio-content.json");

const parties = [
  { id: "YSR", displayNameHe: "ישר!", displayNameEn: "Yashar", requestedLetters: ["דרך"], letterStatus: "requested", treatment: "favorable", pip: "#4B6C8B", members: [["Gadi Eisenkot", "גדי איזנקוט", 1], ["Yoram Cohen", "יורם כהן", 2], ["Orit Farkash-Hacohen", "אורית פקאש הכהן", 3], ["Adi Altschuler", "עדי אלטשולר", 4], ["Hili Tropper", "חילי טרופר", 6]] },
  { id: "LIK", displayNameHe: "הליכוד", displayNameEn: "Likud", requestedLetters: ["מחל"], letterStatus: "protected", treatment: "critical", pip: "#1B3A6B", members: [["Benjamin Netanyahu", "בנימין נתניהו", 1], ["Amir Ohana", "אמיר אוחנה", 3], ["Yariv Levin", "יריב לוין", 4], ["Miri Regev", "מירי רגב", 5], ["Israel Katz", "ישראל כץ", 6], ["Yaakov Bardugo", "יעקב ברדוגו", 11], ["Miki Zohar", "מיקי זוהר", 12]] },
  { id: "BYD", displayNameHe: "ביחד", displayNameEn: "Beyachad", requestedLetters: ["ב", "רק"], letterStatus: "disputed", treatment: "favorable", pip: "#365F9D", members: [["Naftali Bennett", "נפתלי בנט", 1], ["Yair Lapid", "יאיר לפיד", 2], ["Merav Ben Ari", "מירב בן ארי", 4], ["Eitan Ginzburg", "איתן גינצבורג", 8], ["Yonatan Shalev", "יונתן שלו", 10]] },
  { id: "YB", displayNameHe: "ישראל ביתנו", displayNameEn: "Yisrael Beiteinu", requestedLetters: ["ל"], letterStatus: "protected", treatment: "favorable", pip: "#345C91", members: [["Avigdor Lieberman", "אביגדור ליברמן", 1], ["Rafi Ben Shitrit", "רפי בן שטרית", 2], ["Talia Lankri", "טליה לנקרי", 3]] },
  { id: "DEM", displayNameHe: "הדמוקרטים", displayNameEn: "The Democrats", requestedLetters: ["אמת"], letterStatus: "protected", treatment: "favorable", pip: "#C43B3B", members: [["Yair Golan", "יאיר גולן", 1], ["Naama Lazimi", "נעמה לזימי", 2], ["Gilad Kariv", "גלעד קריב", 3], ["Efrat Rayten", "אפרת רייטן", 4], ["Yaya Fink", "יאיר פינק", 5]] },
  { id: "RZ", displayNameHe: "הציונות הדתית וזהות", displayNameEn: "Religious Zionism–Zehut", requestedLetters: ["ט"], letterStatus: "protected", treatment: "critical", pip: "#6B4A8B", members: [["Bezalel Smotrich", "בצלאל סמוטריץ", 1], ["Moshe Feiglin", "משה פייגלין", 2], ["Orit Strock", "אורית סטרוק", 3], ["Simcha Rothman", "שמחה רוטמן", 4], ["Zvi Sukkot", "צבי סוכות", 7]] },
  { id: "OTZ", displayNameHe: "עוצמה יהודית", displayNameEn: "Otzma Yehudit", requestedLetters: ["ב"], letterStatus: "disputed", treatment: "critical", pip: "#243B70", members: [["Itamar Ben Gvir", "איתמר בן גביר", 1], ["Tally Gotliv", "טלי גוטליב", 2], ["Amichai Eliyahu", "עמיחי אליהו", 4]] },
  { id: "SHS", displayNameHe: "ש״ס", displayNameEn: "Shas", requestedLetters: ["שס"], letterStatus: "protected", treatment: "critical", pip: "#3C6B82", members: [["Aryeh Deri", "אריה דרעי", 1], ["Yinon Azoulay", "ינון אזולאי", 2]] },
  { id: "UTJ", displayNameHe: "יהדות התורה", displayNameEn: "United Torah Judaism", requestedLetters: ["ג"], letterStatus: "protected", treatment: "critical", pip: "#4A4A4A", members: [["Yaakov Asher", "יעקב אשר", 1], ["Yitzhak Goldknopf", "יצחק גולדקנופף", 2], ["Yitzhak Pindrus", "יצחק פינדרוס", 3]] },
  { id: "JNT", displayNameHe: "הרשימה המשותפת", displayNameEn: "Joint List", requestedLetters: ["ודם"], letterStatus: "requested", treatment: "favorable", pip: "#A13A3A", members: [["Yousef Jabareen", "יוסף ג׳בארין", 1], ["Ahmad Tibi", "אחמד טיבי", 2], ["Sami Abu Shehadeh", "סאמי אבו שחאדה", 3]] },
  { id: "RAM", displayNameHe: "רע״מ", displayNameEn: "Ra’am", requestedLetters: ["עם"], letterStatus: "protected", treatment: "favorable", pip: "#2E7D4F", members: [["Mansour Abbas", "מנסור עבאס", 1], ["Yoav Segalovitz", "יואב סגלוביץ", 2], ["Walid Taha", "ואליד טאהא", 3]] },
  { id: "AMH", displayNameHe: "עמך ישראל", displayNameEn: "Amcha Yisrael", requestedLetters: ["ך"], letterStatus: "requested", treatment: "critical", pip: "#84623B", members: [["Ofer Winter", "עופר וינטר", 1], ["Yoseph Haddad", "יוסף חדאד", 2], ["Netali Shem Tov", "נטעלי שם טוב", 3]] },
  { id: "RSE", displayNameHe: "המילואימניקים והכלכלית", displayNameEn: "Reservists–Economic", requestedLetters: ["די", "צ", "י"], letterStatus: "requested", treatment: "favorable", pip: "#506A70", members: [["Yoaz Hendel", "יועז הנדל", 1], ["Yaron Zelekha", "ירון זליכה", 2]] },
  { id: "BW", displayNameHe: "כחול לבן", displayNameEn: "Blue and White", requestedLetters: ["כן"], letterStatus: "protected", treatment: "favorable", pip: "#315C8A", members: [["Benny Gantz", "בני גנץ", 1], ["Pnina Tamano-Shata", "פנינה תמנו שטה", 2]] },
];

const bibiSeed = [
  {
    rarity: "Common",
    originalText: "אמרתי לכם ואני חוזר ואומר לכם — לא יהיה כלום כי אין כלום.",
    displayText: "אמרתי לכם ואני חוזר ואומר לכם — לא יהיה כלום כי אין כלום.",
    translation: "I told you, and I repeat: There will be nothing, because there is nothing.",
    quoteStatus: "exact",
    speaker: "Benjamin Netanyahu",
    date: "2017-01-02",
    sourceUrl: "https://news.walla.co.il/item/3028022",
    sourceTitle: "Recorded Likud faction remarks",
    publisher: "Walla",
    sourceType: "closest-primary",
    sourceQuality: "A",
    context: "Likud faction remarks shortly before questioning under caution over suspected gifts.",
    editorialRole: "critical",
    selectionRationale: "A recognizable denial tied to the investigations.",
    scene: "Off-centre seated three-quarter portrait at a plain faction-room table with restrained vertical room panels.",
    flavor: "One clearly visible unlit cigar resting in a plain ashtray on the table.",
    contentStatus: "reviewed",
    artKey: "hero-art-benjamin-netanyahu-01.png",
  },
  {
    rarity: "Uncommon",
    originalText: "שלטון הימין בסכנה. המצביעים הערבים נעים בכמויות אדירות לקלפי. עמותות השמאל מביאות אותם באוטובוסים.",
    displayText: "שלטון הימין בסכנה. המצביעים הערבים נעים בכמויות אדירות לקלפי.",
    translation: "Right-wing rule is in danger. Arab voters are moving to the polling station in enormous numbers.",
    quoteStatus: "shortened",
    speaker: "Benjamin Netanyahu",
    date: "2015-03-17",
    sourceUrl: "https://www.youtube.com/watch?v=Q2cUoglR1yk",
    sourceTitle: "Election-day mobilization video",
    publisher: "Benjamin Netanyahu",
    sourceType: "primary",
    sourceQuality: "A",
    context: "Recorded election-day Likud video; the omitted sentence alleges left-wing NGOs brought voters by bus.",
    editorialRole: "critical",
    selectionRationale: "A widely recognized election-day mobilization statement.",
    scene: "Slightly elevated three-quarter speaking pose with cool overhead light and compressed institutional perspective.",
    flavor: "A small group of four generic distant silhouettes moving toward him at the far image edge.",
    contentStatus: "reviewed",
    artKey: "hero-art-benjamin-netanyahu-02.png",
  },
  {
    rarity: "Rare",
    originalText: "מי שרוצה לסכל הקמה של מדינה פלסטינית צריך לתמוך בחיזוק החמאס ובהעברת כסף לחמאס.",
    displayText: "מי שרוצה לסכל הקמה של מדינה פלסטינית צריך לתמוך בחיזוק החמאס ובהעברת כסף לחמאס.*",
    translation: "Anyone who wants to thwart a Palestinian state should support strengthening Hamas and transferring money to Hamas.",
    quoteStatus: "attributed-paraphrase",
    speaker: "Benjamin Netanyahu",
    date: "2019-03-11",
    sourceUrl: "https://lahav.substack.com/p/i-reported-on-netanyahu-green-lighting",
    sourceTitle: "Reporter provenance explanation",
    publisher: "Lahav Harkov",
    sourceType: "secondary",
    sourceQuality: "B",
    context: "Participant-attributed policy paraphrase from a Likud faction meeting; no verbatim recording is known.",
    editorialRole: "critical",
    selectionRationale: "The strongest sourced statement of the separation strategy, visibly classified as paraphrase.",
    scene: "Tight frontal crop, hard lateral light, dark government-chamber geometry receding into shadow.",
    flavor: "One small closed dark suitcase resting on the edge of a table or podium.",
    contentStatus: "reviewed-adapted",
    artKey: "hero-art-benjamin-netanyahu-03.png",
  },
];

function blankQuote(partyId, slot, rarity) {
  const number = { Common: "01", Uncommon: "02", Rare: "03" }[rarity];
  return {
    id: `${partyId}-M${String(slot).padStart(2, "0")}-Q${number}`,
    slot: rarity,
    rarity,
    publicationState: "blank",
    quote: {
      originalText: "",
      displayText: "",
      translation: "",
      status: "researching",
      speaker: "",
      date: "",
      sourceUrl: "",
      sourceTitle: "",
      publisher: "",
      sourceType: "",
      sourceQuality: "",
      context: "",
      sourceLocation: "",
      discoverySources: [],
    },
    editorial: {
      role: "",
      selectionRationale: "",
      scene: "",
      flavor: "",
      flavorDisclosure: "editorial-symbolism-not-evidence",
    },
    art: {
      artKey: "",
      modelVersion: "",
      seed: "",
      identityReferenceStrength: "",
      styleReferenceStrength: "",
      outputReviewStatus: "missing",
    },
    review: { contentStatus: "blank", revision: 0 },
  };
}

function normalizeQuoteStatus(candidate) {
  const raw = String(candidate.quoteStatus || "").toLowerCase();
  if (raw.includes("paraphrase")) return "attributed-paraphrase";
  const original = String(candidate.originalText || "").replace(/\s+/g, " ").trim();
  const display = String(candidate.displayText || candidate.originalText || "").replace(/\s+/g, " ").trim();
  if (raw.includes("short") || raw.includes("condens") || display !== original) return "shortened";
  return "exact";
}

function normalizeSourceType(value) {
  const raw = String(value || "").toLowerCase();
  if (["primary", "closest-primary", "secondary"].includes(raw)) return raw;
  if (/(official|direct interview|authored|self-published|speaker-published|candidate-statement|radio program page|primary broadcast)/.test(raw)) return "primary";
  if (/(recording|recorded|embedded|transcript|broadcast|reproducing|reproduction|near-primary|closest)/.test(raw)) return "closest-primary";
  return "secondary";
}

function normalizeSourceQuality(candidate) {
  const raw = `${candidate.sourceQuality || ""} ${candidate.sourceType || ""}`.toLowerCase();
  if (candidate.sourceQuality === "A" || candidate.sourceQuality === "B" || candidate.sourceQuality === "C") return candidate.sourceQuality;
  if (/(unsubstantiated|low corroboration|no recording|disputed|weak)/.test(raw)) return "C";
  if (/(high|primary|direct|official|recording|recorded|exact)/.test(raw)) return "A";
  return "B";
}

function normalizeIdentityReference(reference, nameHe) {
  if (reference && typeof reference === "object") {
    return {
      url: reference.url || "",
      license: reference.license || "",
      status: reference.status || "research-reference",
    };
  }
  if (typeof reference === "string" && reference.startsWith("http")) {
    return {
      url: reference,
      license: reference.includes("commons.wikimedia.org") ? "Verify the selected Commons file-page license before export." : "Page reference; embedded-image license varies.",
      status: "research-reference",
    };
  }
  return {
    url: `https://he.wikipedia.org/wiki/${encodeURIComponent(nameHe.replace(/\s+/g, "_"))}`,
    license: "Page reference; inspect and record the selected image file license before export.",
    status: "identity-page-reference",
  };
}

function normalizeQuote(partyId, memberSlot, candidate, fallbackRarity) {
  const rarity = candidate.rarity || fallbackRarity;
  const card = blankQuote(partyId, memberSlot, rarity);
  const sourceQuality = normalizeSourceQuality(candidate);
  const quoteStatus = normalizeQuoteStatus(candidate);
  const isPlayable = Boolean(candidate.sourceUrl && candidate.scene && ["A", "B"].includes(sourceQuality));
  card.publicationState = isPlayable ? "approved" : "researching";
  card.quote = {
    originalText: candidate.originalText || "",
    displayText: candidate.displayText || candidate.originalText || "",
    translation: candidate.translation || "",
    status: quoteStatus,
    evidenceDescriptor: candidate.quoteStatus || "",
    speaker: candidate.speaker || "",
    date: candidate.date || "",
    sourceUrl: candidate.sourceUrl || "",
    sourceTitle: candidate.sourceTitle || "",
    publisher: candidate.publisher || "",
    sourceType: normalizeSourceType(candidate.sourceType),
    sourceQuality,
    sourceDescriptor: candidate.sourceType || "",
    qualityDescriptor: candidate.sourceQuality || "",
    context: candidate.context || "",
    sourceLocation: candidate.sourceLocation || "",
    discoverySources: candidate.discoverySources || [],
  };
  card.editorial = {
    role: candidate.editorialRole || "",
    selectionRationale: candidate.selectionRationale || "",
    scene: typeof candidate.scene === "string" ? candidate.scene : candidate.scene?.setting || "",
    flavor: candidate.flavor || "",
    flavorDisclosure: "editorial-symbolism-not-evidence",
    flavorDisclosureDetail: candidate.flavorDisclosure && candidate.flavorDisclosure !== "editorial-symbolism-not-evidence"
      ? candidate.flavorDisclosure
      : "",
  };
  card.art = {
    artKey: candidate.artKey || "",
    modelVersion: "",
    seed: "",
    identityReferenceStrength: "",
    styleReferenceStrength: "",
    outputReviewStatus: candidate.artKey ? "concept" : "missing",
  };
  card.review = { contentStatus: isPlayable ? "approved" : candidate.contentStatus || "review-needed", revision: 0 };
  return card;
}

async function readResearch() {
  const memberMap = new Map();
  const partyAliases = new Map([
    ["yashar", "YSR"],
    ["beyachad", "BYD"],
    ["joint-list", "JNT"],
    ["raam", "RAM"],
    ["reservists-economic", "RSE"],
  ]);
  let partyMetadata = null;
  try {
    const files = (await readdir(researchDir)).filter((file) => file.endsWith(".json"));
    for (const file of files) {
      const value = JSON.parse(await readFile(path.join(researchDir, file), "utf8"));
      if (Array.isArray(value.members)) {
        for (const member of value.members) {
          member.partyId = partyAliases.get(member.partyId) || member.partyId;
          memberMap.set(`${member.partyId}:${member.slot}`, member);
        }
      }
      if (Array.isArray(value.parties)) partyMetadata = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return { memberMap, partyMetadata };
}

const { memberMap, partyMetadata } = await readResearch();
const metadataById = new Map((partyMetadata?.parties || []).map((party) => [party.id, party]));

const canonicalParties = parties.map(({ members, ...baseline }) => {
  const researchedParty = metadataById.get(baseline.id) || {};
  return {
    ...baseline,
    ...researchedParty,
    requestedLetters: researchedParty.requestedLetters || baseline.requestedLetters,
    finalLetters: researchedParty.finalLetters ?? null,
    filingStatus: researchedParty.filingStatus || "submitted-pending-cec",
    asOfDate: researchedParty.asOfDate || "2026-09-09",
    symbolCard: researchedParty.symbolCard || {
      id: `${baseline.id}-S-01`,
      originalText: baseline.requestedLetters[0],
      contentStatus: "submitted-pending-cec",
      sourceUrl: researchedParty.symbolSourceUrl || "",
    },
    platformCards: researchedParty.platformCards || [],
  };
});

let canonicalMembers = parties.flatMap((party) => party.members.map(([nameEn, nameHe, slot]) => {
  const researched = memberMap.get(`${party.id}:${slot}`);
  let candidates = researched?.quotes || [];
  if (party.id === "LIK" && slot === 1 && !candidates.length) candidates = bibiSeed;
  const slots = ["Common", "Uncommon", "Rare"].map((rarity) => blankQuote(party.id, slot, rarity));
  if (candidates.length >= 3) {
    for (const [index, candidate] of candidates.slice(0, 3).entries()) {
      const rarity = ["Common", "Uncommon", "Rare"][index];
      slots[index] = normalizeQuote(party.id, slot, { ...candidate, rarity }, rarity);
    }
  } else if (candidates.length) {
    const best = candidates.find((quote) => quote.rarity === "Rare") || candidates.at(-1);
    slots[2] = normalizeQuote(party.id, slot, best, "Rare");
  }
  return {
    id: `${party.id}-M${String(slot).padStart(2, "0")}`,
    partyId: party.id,
    slot,
    nameHe,
    nameEn,
    treatment: party.treatment,
    treatmentRationale: party.treatment === "critical"
      ? "Disclosed critical selection for governing/right-bloc figures."
      : "Disclosed favorable selection for current-opposition figures.",
    identityReference: normalizeIdentityReference(researched?.identityReference, nameHe),
    membershipNote: researched?.membershipNote || "",
    researchNotes: researched?.researchNotes || "",
    alternateCandidates: researched?.alternateCandidates || [],
    visualMemeMoments: researched?.visualMemeMoments || [],
    quoteSlots: slots,
  };
}));

try {
  const existing = JSON.parse(await readFile(outputPath, "utf8"));
  const existingById = new Map(existing.members.map((member) => [member.id, member]));
  canonicalMembers = canonicalMembers.map((member) => {
    const prior = existingById.get(member.id);
    if (!prior) return member;
    const editedById = new Map(prior.quoteSlots
      .filter((card) => Number(card.review?.revision || 0) > 0)
      .map((card) => [card.id, card]));
    const hasStudioEdits = editedById.size > 0;
    return {
      ...member,
      identityReference: hasStudioEdits ? prior.identityReference : member.identityReference,
      quoteSlots: member.quoteSlots.map((card) => editedById.get(card.id) || card),
    };
  });
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

if (canonicalParties.length !== 14) throw new Error(`Expected 14 parties, received ${canonicalParties.length}`);
if (canonicalMembers.length !== 51) throw new Error(`Expected 51 members, received ${canonicalMembers.length}`);

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  asOfDate: "2026-09-09",
  editorialPolicy: {
    disclosure: "Governing/right figures are selected critically; current-opposition figures favorably. Quotations remain sourced and visibly classified.",
    criticalBloc: ["LIK", "RZ", "OTZ", "SHS", "UTJ", "AMH"],
    favorableBloc: ["YSR", "BYD", "YB", "DEM", "JNT", "RAM", "RSE", "BW"],
    sparseRule: "If fewer than three strong distinct quotes qualify, Common and Uncommon stay blank and only the best quote occupies Rare.",
  },
  parties: canonicalParties,
  members: canonicalMembers,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${output.parties.length} parties and ${output.members.length} members → ${outputPath}`);
