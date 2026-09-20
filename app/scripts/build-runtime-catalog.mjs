#!/usr/bin/env node

import { access, copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const dataDir = path.join(appRoot, "data");
const studio = JSON.parse(await readFile(path.join(dataDir, "studio-content.json"), "utf8"));
const activePath = path.join(dataDir, "cards.json");
const snapshotPath = path.join(dataDir, "cards-alpha-28-2026-09-09.json");
const demoPath = path.join(dataDir, "demo-pack.json");
const demoSnapshotPath = path.join(dataDir, "demo-pack-alpha-2026-09-09.json");

try {
  await access(snapshotPath);
} catch {
  await copyFile(activePath, snapshotPath);
}
try {
  await access(demoSnapshotPath);
} catch {
  await copyFile(demoPath, demoSnapshotPath);
}

const fallback = JSON.parse(await readFile(snapshotPath, "utf8"));
const commonHebrew = {
  "SYS-C-01": {
    titleHe: "הכנסת",
    subtitleHe: "120 מושבים · אזור בחירה ארצי",
    text: "מצביעים לרשימה ארצית — לא לנציג מקומי.",
  },
  "SYS-C-02": {
    titleHe: "הקלפי",
    subtitleHe: "פתק אחד לרשימה אחת",
    text: "המיקום ברשימה קובע מי עשוי להיכנס לכנסת.",
  },
  "SYS-C-03": {
    titleHe: "אחוז החסימה",
    subtitleHe: "3.25% מהקולות הכשרים",
    text: "רשימה שלא עוברת 3.25% לא מקבלת מושבים.",
  },
  "SYS-C-04": {
    titleHe: "ועדת הבחירות",
    subtitleHe: "רשימות, אותיות ותוצאות",
    text: "ועדת הבחירות מאשרת את הרשימות ואת אותיות הקלפי.",
  },
};

function inferSubjectSet(platform = {}) {
  const text = `${platform.documentName || ""} ${platform.originalText || ""} ${platform.context || ""}`;
  const rules = [
    ["security", /ביטחו|צבא|מלחמ|עזה|איראן|מדיני|ריבונות|חטופ/],
    ["democracy", /דמוקרט|משפט|ממשל|כהונ|נבצר|חוק|כנסת/],
    ["economy", /כלכל|יוקר|מחיר|שוק|תקציב|עובד|דיור|מס/],
    ["religion-state", /דת|יהוד|חרד|שבת|גיור|רבנות|זהות/],
    ["society-services", /חינוך|בריאות|רווחה|חברה|שירות|פשיעה|נגב/],
  ];
  return rules.find(([, pattern]) => pattern.test(text))?.[0] || "society-services";
}

function releaseMetadata({ releaseSetId, releaseOrder, releaseTier, idleEligible, binderGroup, subjectSet = null }) {
  const release = studio.gameConfig?.releaseSets?.find(({ id }) => id === releaseSetId);
  const runtimeActive = !release || release.runtimeState === "active";
  const activeForIdle = idleEligible && runtimeActive;
  return {
    releaseSetId,
    releaseOrder,
    releaseTier,
    releaseState: release?.runtimeState || (idleEligible ? "active" : "held"),
    availableFrom: activeForIdle ? (release?.runtimeAvailableFrom || release?.plannedPublishAt || null) : null,
    idleEligible: activeForIdle,
    binderGroup,
    subjectSet,
  };
}

const commons = fallback.filter(({ set }) => set === "SYS").map((card, index) => ({
  ...card,
  ...releaseMetadata({
    releaseSetId: "foundations",
    releaseOrder: 0,
    releaseTier: "objective",
    idleEligible: false,
    binderGroup: "foundations",
  }),
  titleHe: commonHebrew[card.id]?.titleHe || card.hebrewTitle,
  setNameHe: "יסודות",
  typeHe: "יסוד",
  subtitleHe: commonHebrew[card.id]?.subtitleHe || "",
  displayCode: `יסוד-${String(index + 1).padStart(2, "0")}`,
  rarity: card.rarity.startsWith("Rare") ? "Rare" : card.rarity,
  letters: "יסוד",
  walkout: {
    ...card.walkout,
    text: commonHebrew[card.id]?.text || card.walkout.text,
    speaker: "קלפי · מידע בדוק",
    date: "לפי המקור המצורף",
    sourceLabel: "מקור רשמי",
  },
}));
const membersByParty = new Map();
for (const member of studio.members) {
  if (!membersByParty.has(member.partyId)) membersByParty.set(member.partyId, []);
  membersByParty.get(member.partyId).push(member);
}

function sourceLabel(record) {
  return [record.documentName, record.sourceTitle, record.publisher].find(Boolean) || "Source pending";
}

function baseCard(party, values) {
  const letters = (party.finalLetters || party.requestedLetters || ["?"])[0];
  return {
    set: party.id,
    setName: party.displayNameEn,
    setNameHe: party.displayNameHe,
    letters,
    displayCode: `${letters}-${values.id.match(/(\d{2})$/)?.[1] || "01"}`,
    pip: party.pip,
    ...values,
  };
}

function quoteDisplayNumber(member, card) {
  const rarityOffset = card.rarity.startsWith("Common") ? 0 : card.rarity.startsWith("Uncommon") ? 1 : 2;
  return 4 + ((member.slot - 1) * 3) + rarityOffset;
}

const partyCards = studio.parties.flatMap((party) => {
  const cards = [];
  cards.push(baseCard(party, {
    ...releaseMetadata({
      releaseSetId: "party-symbols",
      releaseOrder: 3,
      releaseTier: "objective",
      idleEligible: false,
      binderGroup: "party-symbols",
    }),
    id: party.symbolCard?.id || `${party.id}-S-01`,
    displayCode: `${(party.finalLetters || party.requestedLetters)[0]}-01`,
    title: `${party.displayNameEn} · ${(party.finalLetters || party.requestedLetters)[0]}`,
    titleHe: `${party.displayNameHe} · ${(party.finalLetters || party.requestedLetters)[0]}`,
    hebrewTitle: `${party.displayNameHe} · ${(party.finalLetters || party.requestedLetters)[0]}`,
    type: "Symbol",
    typeHe: "סמל",
    rarity: "Common",
    subtitle: `${party.displayNameHe} · submitted-list identifier`,
    subtitleHe: "אותיות הרשימה",
    body: `Requested ballot letters: ${party.requestedLetters.join(" / ")}. Status: ${party.letterStatus}. Filing: ${party.filingStatus}.`,
    whyItMatters: party.membershipConstituentCaveat || party.membershipCaveat || "Ballot letters remain provisional until confirmed by the Central Elections Committee.",
    source: party.symbolCard?.sourceUrl || party.symbolSourceUrl || "CEC confirmation pending",
    listSlot: null,
    artKey: party.symbolCard?.artKey || null,
    walkout: {
      kind: "fact",
      text: `אותיות הקלפי: ${party.requestedLetters.join(" / ")}`,
      speaker: "קלפי · פנקס הרשימות",
      date: party.asOfDate,
      sourceId: `${party.id.toLowerCase()}-symbol`,
      sourceLabel: "פרטי הרשימה שהוגשה",
      sourceUrl: party.symbolCard?.sourceUrl || party.symbolSourceUrl || "https://www.gov.il/en/departments/units/central-elections-committee/govil-landing-page",
      context: `Letter status: ${party.letterStatus}; filing status: ${party.filingStatus}.`,
      selectionRationale: "Identifies the submitted list without implying final CEC confirmation.",
      releasePhase: "orientation",
      editorialRole: "identity",
      contentStatus: party.symbolCard?.contentStatus || "submitted-pending-cec",
    },
  }));

  for (const [index, platform] of (party.platformCards || []).slice(0, 2).entries()) {
    const subjectSet = platform.subjectSet || inferSubjectSet(platform);
    cards.push(baseCard(party, {
      ...releaseMetadata({
        releaseSetId: `party-position-${subjectSet}`,
        releaseOrder: 10,
        releaseTier: "objective",
        idleEligible: false,
        binderGroup: "party-positions",
        subjectSet,
      }),
      id: `${party.id}-P-0${index + 1}`,
      displayCode: `${(party.finalLetters || party.requestedLetters)[0]}-${String(index + 2).padStart(2, "0")}`,
      title: `${party.displayNameEn} policy ${index + 1}`,
      titleHe: `${party.displayNameHe} · מדיניות ${index + 1}`,
      hebrewTitle: `${party.displayNameHe} · מדיניות ${index + 1}`,
      type: "Platform",
      typeHe: "מדיניות",
      rarity: index === 0 ? "Common" : "Uncommon",
      subtitle: platform.documentName || "Dated party-policy statement",
      subtitleHe: platform.documentName || "מסמך מדיניות מתוארך",
      body: platform.originalText || "",
      whyItMatters: platform.context || "An exact published policy excerpt, dated to its source.",
      source: sourceLabel(platform),
      listSlot: null,
      artKey: null,
      walkout: {
        kind: "fact",
        text: platform.originalText || "",
        speaker: party.displayNameEn,
        date: platform.dateOrVersion || party.asOfDate,
        sourceId: `${party.id.toLowerCase()}-platform-${index + 1}`,
        sourceLabel: sourceLabel(platform),
        sourceUrl: platform.sourceUrl || "",
        context: platform.context || "",
        selectionRationale: "Exact platform or dated policy excerpt selected under the disclosed editorial treatment.",
        releasePhase: "platform",
        editorialRole: party.treatment,
        contentStatus: platform.contentStatus || "research-needed",
      },
    }));
  }
  return cards;
});

const releasedQuoteCodes = new Map();
for (const [prefix, slot] of [["ראש", 1], ["משנה", 2]]) {
  studio.members.filter((member) => member.slot === slot).forEach((member, index) => {
    const approved = member.quoteSlots.filter((card) => card.publicationState === "approved" && card.quote.displayText.trim());
    const entryCard = approved.find((card) => card.rarity.startsWith("Common")) || approved[0];
    if (entryCard) releasedQuoteCodes.set(entryCard.id, `${prefix}-${String(index + 1).padStart(2, "0")}`);
  });
}

const quoteCards = studio.members.flatMap((member) => {
  const party = studio.parties.find(({ id }) => id === member.partyId);
  const approved = member.quoteSlots.filter((card) => card.publicationState === "approved" && card.quote.displayText.trim());
  const eligible = approved.length === 3 ? approved : approved.filter((card) => card.rarity === "Rare");
  const entryCard = eligible.find((card) => card.rarity.startsWith("Common")) || eligible[0];
  return eligible
    .map((card) => {
      const isLeader = member.slot === 1 && card.id === entryCard?.id;
      const isSlotTwo = member.slot === 2 && card.id === entryCard?.id;
      const releaseSetId = isLeader ? "party-leaders" : isSlotTwo ? "party-slot-2" : "editorial-backlog";
      const releasedCode = releasedQuoteCodes.get(card.id);
      return baseCard(party, {
      ...releaseMetadata({
        releaseSetId,
        releaseOrder: isLeader ? 1 : isSlotTwo ? 2 : 90,
        releaseTier: isLeader || isSlotTwo ? "objective" : member.treatment === "critical" ? "critique" : "depth",
        idleEligible: isLeader || isSlotTwo,
        binderGroup: isLeader ? "leaders" : isSlotTwo ? "slot-2" : "people",
      }),
      id: card.id,
      displayCode: releasedCode
        || `${(party.finalLetters || party.requestedLetters)[0]}-${String(quoteDisplayNumber(member, card)).padStart(2, "0")}`,
      title: member.nameEn,
      titleHe: member.nameHe,
      hebrewTitle: member.nameHe,
      type: "Quote",
      typeHe: "ציטוט",
      rarity: card.rarity,
      subtitle: `מקום ${member.slot} · ${party.displayNameHe}`,
      subtitleHe: `מקום ${member.slot}`,
      body: card.quote.context,
      whyItMatters: card.editorial.selectionRationale || "Selected under the disclosed editorial treatment.",
      source: sourceLabel(card.quote),
      listSlot: member.slot,
      artKey: card.art?.artKey || null,
      walkout: {
        kind: "quote",
        text: card.quote.displayText,
        speaker: member.nameHe,
        date: card.quote.date,
        sourceId: card.id.toLowerCase(),
        sourceLabel: sourceLabel(card.quote),
        sourceUrl: card.quote.sourceUrl,
        context: card.quote.context,
        quoteStatus: card.quote.status,
        selectionRationale: card.editorial.selectionRationale,
        flavorDisclosure: card.editorial.flavorDisclosure,
        releasePhase: member.treatment === "critical" ? "contrast" : "constructive",
        editorialRole: member.treatment,
        contentStatus: card.review?.contentStatus || "approved",
      },
    });
    });
});

const cards = [...commons, ...partyCards, ...quoteCards];
const tierCounts = Object.fromEntries(["Common", "Uncommon", "Rare"].map((tier) => [
  tier,
  cards.filter((card) => card.rarity.startsWith(tier)).length,
]));
if (tierCounts.Common < 3 || tierCounts.Uncommon < 2 || tierCounts.Rare < 1) {
  throw new Error(`Expanded catalog cannot form 3C/2U/1R: ${JSON.stringify(tierCounts)}`);
}
const ids = cards.map(({ id }) => id);
if (new Set(ids).size !== ids.length) throw new Error("Expanded catalog contains duplicate card IDs");

const generatedPath = path.join(dataDir, "cards-expanded.json");
await writeFile(generatedPath, `${JSON.stringify(cards, null, 2)}\n`);
const demoCards = [
  ...cards.filter((card) => card.rarity.startsWith("Common")).slice(0, 3),
  ...cards.filter((card) => card.rarity.startsWith("Uncommon")).slice(0, 2),
  ...cards.filter((card) => card.rarity.startsWith("Rare")).slice(0, 1),
].map((card) => ({ cardId: card.id, finish: card.rarity.split(/\s|\//)[0] }));
const demo = {
  id: "expanded-review",
  label: "Expanded catalog guided demo",
  description: "Deterministic 3C / 2U / 1R preview generated from the active expanded catalog.",
  cards: demoCards,
};
await writeFile(path.join(dataDir, "demo-pack-expanded.json"), `${JSON.stringify(demo, null, 2)}\n`);
if (process.argv.includes("--activate")) {
  await writeFile(activePath, `${JSON.stringify(cards, null, 2)}\n`);
  await writeFile(demoPath, `${JSON.stringify(demo, null, 2)}\n`);
}
console.log(`${process.argv.includes("--activate") ? "Activated" : "Built"} ${cards.length} expanded cards (${JSON.stringify(tierCounts)})`);
