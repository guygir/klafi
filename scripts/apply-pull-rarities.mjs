import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rarityWeightsForCounts } from "../app/server/pack-config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PULL_RARITY = {
  "YSR-M01-Q01": "Common",
  "LIK-M01-Q01": "Uncommon",
  "BYD-M01-Q01": "Common",
  "YB-M01-Q01": "Uncommon",
  "DEM-M01-Q01": "Common",
  "RZ-M01-Q01": "Uncommon",
  "OTZ-M01-Q01": "Rare",
  "SHS-M01-Q03": "Rare",
  "UTJ-M01-Q01": "Common",
  "JNT-M01-Q01": "Common",
  "RAM-M01-Q01": "Common",
  "AMH-M01-Q01": "Uncommon",
  "RSE-M01-Q01": "Common",
  "BW-M01-Q01": "Common",
  "YSR-M02-Q01": "Common",
  "BYD-M02-Q01": "Common",
  "YB-M02-Q01": "Uncommon",
  "DEM-M02-Q01": "Common",
  "RZ-M02-Q01": "Rare",
  "OTZ-M02-Q01": "Rare",
  "SHS-M02-Q03": "Uncommon",
  "UTJ-M02-Q01": "Uncommon",
  "JNT-M02-Q01": "Common",
  "RAM-M02-Q01": "Common",
  "AMH-M02-Q01": "Uncommon",
  "RSE-M02-Q01": "Common",
  "BW-M02-Q01": "Common",
};

const SPECIAL_RARITY = {
  "MIN-KISCH-TIMSS-01": "Common",
  "MIN-REGEV-TRAVEL-01": "Common",
  "GOV-NORTH-PLAN-01": "Common",
  "GOV-TAX-BURDEN-2025-01": "Common",
  "MIN-BEN-GVIR-HOMICIDES-01": "Uncommon",
  "GOV-MENTAL-HEALTH-GAP-01": "Uncommon",
  "GOV-CIVIL-COMMAND-01": "Uncommon",
  "GOV-REASONABLENESS-2023-01": "Rare",
  "GOV-OCT7-INQUIRY-GAP-01": "Rare",
  "REC-ABBAS-COALITION-2021-01": "Common",
  "REC-BENNETT-RELIGIOUS-PM-2021-01": "Common",
  "REC-SMOTRICH-BUDGET-2025-01": "Uncommon",
  "REC-GAFNI-LONGEVITY-2026-01": "Uncommon",
  "REC-DERI-DISQUALIFICATION-2023-01": "Rare",
};

const SET5_RARITY = {
  1: "Common",
  2: "Uncommon",
  3: "Common",
  4: "Common",
  5: "Uncommon",
  6: "Rare",
  7: "Uncommon",
  8: "Uncommon",
  9: "Uncommon",
  10: "Common",
  11: "Rare",
  12: "Common",
  13: "Common",
  14: "Common",
  15: "Common",
  16: "Common",
  17: "Common",
  18: "Common",
  19: "Common",
  20: "Rare",
  21: "Uncommon",
  22: "Rare",
};

const studioPath = path.join(root, "app/data/studio-content.json");
const specialsPath = path.join(root, "app/data/specials-content.json");
const set5Path = path.join(root, "docs/intake/research/set5-wip-pool.json");
const rosterPath = path.join(root, "docs/intake/research/set5-wip-roster.md");

const studio = JSON.parse(await readFile(studioPath, "utf8"));
let studioHits = 0;
for (const member of studio.members) {
  for (const card of member.quoteSlots) {
    if (!PULL_RARITY[card.id]) continue;
    card.pullRarity = PULL_RARITY[card.id];
    studioHits += 1;
  }
}
if (studioHits !== Object.keys(PULL_RARITY).length) {
  throw new Error(`Studio pullRarity hits ${studioHits}, expected ${Object.keys(PULL_RARITY).length}`);
}

studio.gameConfig.pack = {
  pityAfter: 4,
  sets: [
    { id: "party-leaders", weight: 70, includeEventCards: false, rarities: rarityWeightsForCounts({ Common: 8, Uncommon: 4, Rare: 2 }) },
    { id: "party-slot-2", weight: 20, includeEventCards: false, rarities: rarityWeightsForCounts({ Common: 7, Uncommon: 4, Rare: 2 }) },
    { id: "decisions", weight: 8, includeEventCards: false, rarities: rarityWeightsForCounts({ Common: 4, Uncommon: 3, Rare: 2 }) },
    { id: "records", weight: 2, includeEventCards: false, rarities: rarityWeightsForCounts({ Common: 2, Uncommon: 2, Rare: 1 }) },
    { id: "set-5", weight: 10, includeEventCards: false, rarities: rarityWeightsForCounts({ Common: 12, Uncommon: 6, Rare: 4 }) },
  ],
};

const specials = JSON.parse(await readFile(specialsPath, "utf8"));
let specialHits = 0;
for (const card of specials.cards) {
  if (!SPECIAL_RARITY[card.id]) continue;
  card.rarity = SPECIAL_RARITY[card.id];
  specialHits += 1;
}
if (specialHits !== Object.keys(SPECIAL_RARITY).length) {
  throw new Error(`Special rarity hits ${specialHits}, expected ${Object.keys(SPECIAL_RARITY).length}`);
}

const set5 = JSON.parse(await readFile(set5Path, "utf8"));
for (const candidate of set5.candidates) {
  candidate.rarity = SET5_RARITY[candidate.n];
  if (!candidate.rarity) throw new Error(`Set 5 missing rarity for n=${candidate.n}`);
}
const set5Counts = { Common: 0, Uncommon: 0, Rare: 0 };
for (const candidate of set5.candidates) set5Counts[candidate.rarity] += 1;
if (set5Counts.Common !== 12 || set5Counts.Uncommon !== 6 || set5Counts.Rare !== 4) {
  throw new Error(`Set 5 rarity mix ${JSON.stringify(set5Counts)}`);
}

let roster = await readFile(rosterPath, "utf8");
if (!roster.includes("## Assigned pull rarities")) {
  const lines = [
    "",
    "## Assigned pull rarities (2026-09-20)",
    "",
    "Crisp / unique-image cards sit rarer. Within the set, specific R : UC : C is about 1 : 1.5 : 2.",
    "",
    "| # | Rarity | Person | Quote |",
    "|---|---|---|---|",
    ...set5.candidates.map((candidate) =>
      `| ${candidate.n} | ${candidate.rarity[0]} | ${candidate.nameHe} | ${candidate.displayText.replace(/\|/g, "/")} |`),
    "",
  ];
  roster = `${roster.trimEnd()}\n${lines.join("\n")}\n`;
}

await writeFile(studioPath, `${JSON.stringify(studio, null, 2)}\n`);
await writeFile(specialsPath, `${JSON.stringify(specials, null, 2)}\n`);
await writeFile(set5Path, `${JSON.stringify(set5, null, 2)}\n`);
await writeFile(rosterPath, roster);
console.log("Applied pull rarities", { studioHits, specialHits, set5: set5Counts, pack: studio.gameConfig.pack.sets });
