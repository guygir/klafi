#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const sourcePath = path.join(root, "docs/content/poc-cards.md");
const outputPath = path.join(root, "app/data/cards.json");
const sourceRegistryPath = path.join(root, "app/data/sources.json");
const sequencePath = path.join(root, "app/data/editorial-sequences.json");
const auditPath = path.join(root, "app/data/content-audit.json");

const setNames = {
  SYS: "Commons",
  LIK: "Likud",
  DEM: "The Democrats",
  RAM: "Ra'am",
};

const partyPips = {
  SYS: "#1F4F4A",
  LIK: "#1B3A6B",
  DEM: "#C43B3B",
  RAM: "#2E7D4F",
};

const artKeys = {
  "SYS-C-01": "hero-art-knesset.png",
  "SYS-C-02": "hero-art-kalpi.png",
  "SYS-C-03": "hero-art-threshold.png",
  "LIK-S-01": "hero-art-memchetlammed.png",
  "LIK-P-02": "hero-art-broad-government.png",
  "DEM-M-01": "hero-art-yair-golan.png",
  "DEM-M-02": "hero-art-naama-lazimi.png",
  "DEM-P-01": "hero-art-state-inquiry.png",
  "DEM-Q-01": "hero-art-yair-golan.png",
};

const sourceIds = {
  "SYS-C-01": "basic-law-knesset",
  "SYS-C-02": "idi-seats",
  "SYS-C-03": "idi-seats",
  "SYS-C-04": "cec-calendar",
  "LIK-M-01": "party-lists-2026",
  "LIK-M-02": "party-lists-2026",
  "LIK-M-03": "party-lists-2026",
  "LIK-M-04": "party-lists-2026",
  "LIK-S-01": "party-lists-2026",
  "LIK-P-01": "party-platforms-2026",
  "LIK-P-02": "party-platforms-2026",
  "LIK-Q-01": "party-platforms-2026",
  "DEM-M-01": "democrats-primary-2026",
  "DEM-M-02": "democrats-primary-2026",
  "DEM-M-03": "democrats-primary-2026",
  "DEM-M-04": "democrats-primary-2026",
  "DEM-S-01": "party-lists-2026",
  "DEM-P-01": "party-platforms-2026",
  "DEM-P-02": "party-platforms-2026",
  "DEM-Q-01": "democrats-primary-2026",
  "RAM-M-01": "raam-list-2026",
  "RAM-M-02": "raam-list-2026",
  "RAM-M-03": "raam-list-2026",
  "RAM-M-04": "raam-list-2026",
  "RAM-S-01": "party-lists-2026",
  "RAM-P-01": "party-platforms-2026",
  "RAM-P-02": "party-platforms-2026",
  "RAM-Q-01": "raam-list-2026",
};

const quoteWalkouts = {
  "LIK-Q-01": {
    text: "“A broad national government.”",
    speaker: "Likud 2026 campaign frame",
    date: "2026 campaign period",
    context: "A campaign phrase about the government Likud says it wants to form; it is not a signed coalition agreement.",
  },
  "DEM-Q-01": {
    text: "“Only a strong Democrats team in the Knesset and in the next government can save the country and restore to Israel the security, democracy, and hope that it so desperately needs.”",
    speaker: "Yair Golan",
    date: "Opening of the 2026 Democrats primaries",
    context: "Spoken by the party chair while asking registered members to vote in the party primary.",
  },
  "RAM-Q-01": {
    text: "“Hope won out” over fear.",
    speaker: "Mansour Abbas",
    date: "31 August 2026",
    context: "Said in Nazareth while welcoming Yoav Segalovitz to the Ra'am list; it is not a coalition promise.",
  },
};

function clean(value = "") {
  return value
    .replaceAll("**", "")
    .replaceAll(/\\[(.*?)\\]\\(.*?\\)/g, "$1")
    .trim();
}

function parseHeading(raw) {
  const heading = clean(raw.replace(/^###\s+/, ""));
  const [idAndTitle, ...dotParts] = heading.split(" · ");
  const match = idAndTitle.match(/^([A-Z]{3}-[A-Z]-\d{2})\s+—\s+(.+)$/);
  if (!match) return null;

  const [, id, title] = match;
  const hebrewTitle = dotParts.find((part) => /[\u0590-\u05ff]/.test(part)) ?? "";
  return { id, title, hebrewTitle };
}

function extractField(block, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`\\*\\*${escaped}:\\*\\*\\s*([^\\n]+)`));
  return clean(match?.[1] ?? "");
}

function walkoutFor(card, source) {
  const quote = quoteWalkouts[card.id];
  const releasePhase = card.set === "SYS" || ["Member", "Symbol"].includes(card.type)
    ? "orientation"
    : card.type === "Platform"
      ? "issue-contrast"
      : "decision-readiness";

  return {
    kind: quote ? "quote" : "fact",
    text: quote?.text ?? card.whyItMatters,
    speaker: quote?.speaker ?? "Kalpi sourced fact",
    date: quote?.date ?? "Source date on full card",
    sourceId: source.id,
    sourceLabel: source.label,
    sourceUrl: source.url,
    context: quote?.context ?? card.body,
    selectionRationale: quote
      ? "Selected because the speaker’s own language creates a memorable identity walkout; full context follows."
      : `Selected to introduce ${card.type.toLowerCase()} knowledge before revealing the identity.`,
    releasePhase,
    editorialRole: "orientation",
    contentStatus: source.status,
  };
}

function parseCards(markdown, sources) {
  const headings = [...markdown.matchAll(/^###\s+.+$/gm)];
  const cards = [];

  for (let index = 0; index < headings.length; index += 1) {
    const parsed = parseHeading(headings[index][0]);
    if (!parsed) continue;

    const start = headings[index].index + headings[index][0].length;
    const end = headings[index + 1]?.index ?? markdown.length;
    const block = markdown.slice(start, end);
    const set = parsed.id.slice(0, 3);
    const typeRaw = extractField(block, "Type");
    const rarityRaw = extractField(block, "Rarity");
    const subtitle = extractField(block, "Subtitle");
    const slotMatch = subtitle.match(/\bslot\s+(\d+)/i);

    const card = {
      ...parsed,
      set,
      setName: setNames[set],
      pip: partyPips[set],
      type: typeRaw.replace(/\s*·.*$/, "") || "Unknown",
      rarity: rarityRaw.replace(/\s*·.*$/, "") || "Common",
      subtitle,
      body: extractField(block, "Body"),
      whyItMatters: extractField(block, "Why it matters"),
      source: extractField(block, "Source"),
      listSlot: slotMatch ? Number(slotMatch[1]) : null,
      artKey: artKeys[parsed.id] ?? null,
    };

    const sourceId = sourceIds[card.id];
    const source = sources.get(sourceId);
    if (!source) throw new Error(`${card.id} has no registered source`);
    card.walkout = walkoutFor(card, source);

    const required = ["id", "title", "setName", "type", "rarity", "subtitle", "body", "whyItMatters", "source", "walkout"];
    const missing = required.filter((field) => !card[field]);
    if (missing.length) {
      throw new Error(`${card.id} is missing: ${missing.join(", ")}`);
    }
    const walkoutRequired = [
      "kind",
      "text",
      "speaker",
      "date",
      "sourceId",
      "sourceLabel",
      "sourceUrl",
      "context",
      "selectionRationale",
      "releasePhase",
      "editorialRole",
      "contentStatus",
    ];
    const missingWalkout = walkoutRequired.filter((field) => !card.walkout[field]);
    if (missingWalkout.length) {
      throw new Error(`${card.id} walkout is missing: ${missingWalkout.join(", ")}`);
    }
    if (!["orientation", "supporting-case", "critical-contrast"].includes(card.walkout.editorialRole)) {
      throw new Error(`${card.id} has an invalid editorial role`);
    }
    if (!["draft", "fact-checked", "approved"].includes(card.walkout.contentStatus)) {
      throw new Error(`${card.id} has an invalid content status`);
    }
    new URL(card.walkout.sourceUrl);

    cards.push(card);
  }

  if (cards.length !== 28) {
    throw new Error(`Expected 28 PoC cards, found ${cards.length}`);
  }

  const ids = new Set(cards.map(({ id }) => id));
  if (ids.size !== cards.length) {
    throw new Error("Card ids must be unique");
  }

  return cards;
}

const markdown = await readFile(sourcePath, "utf8");
const sourceRegistry = JSON.parse(await readFile(sourceRegistryPath, "utf8"));
const sources = new Map(sourceRegistry.map((source) => [source.id, source]));
const cards = parseCards(markdown, sources);
const sequences = JSON.parse(await readFile(sequencePath, "utf8"));
const cardIds = new Set(cards.map(({ id }) => id));
for (const sequence of sequences) {
  const missingCards = sequence.cards.filter((id) => !cardIds.has(id));
  if (missingCards.length) throw new Error(`${sequence.id} references missing cards: ${missingCards.join(", ")}`);
}

const countBy = (items, key) => items.reduce((counts, item) => {
  const value = key.split(".").reduce((current, part) => current[part], item);
  counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}, {});
const audit = {
  generatedAt: new Date().toISOString(),
  totalCards: cards.length,
  byContentStatus: countBy(cards, "walkout.contentStatus"),
  byReleasePhase: countBy(cards, "walkout.releasePhase"),
  byEditorialRole: countBy(cards, "walkout.editorialRole"),
  directQuoteWalkouts: cards.filter(({ walkout }) => walkout.kind === "quote").map(({ id }) => id),
  blockedCards: cards
    .filter(({ walkout }) => walkout.contentStatus !== "approved")
    .map(({ id, walkout }) => ({ id, status: walkout.contentStatus, sourceId: walkout.sourceId })),
  blockedSequences: sequences
    .filter(({ publicationBlockedBy }) => publicationBlockedBy)
    .map(({ id, publicationBlockedBy }) => ({ id, reason: publicationBlockedBy })),
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(cards, null, 2)}\n`);
await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`Wrote ${cards.length} cards + content audit → ${outputPath}`);
