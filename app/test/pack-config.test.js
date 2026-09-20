import assert from "node:assert/strict";
import test from "node:test";
import {
  cardPullOdds,
  effectiveRarities,
  rarityOrderReport,
  rarityWeightsForCounts,
  resolvePackTable,
  validPackConfig,
} from "../server/pack-config.js";
import { generateIdlePull } from "../server/pack-engine.js";

const now = Date.parse("2026-09-20T12:00:00.000Z");
const releaseSets = [
  { id: "party-leaders", runtimeState: "active", runtimeAvailableFrom: "2026-09-10T00:00:00+03:00" },
  { id: "party-slot-2", runtimeState: "held", plannedPublishAt: "2026-09-24T06:00:00.000Z" },
  { id: "decisions", runtimeState: "held", plannedPublishAt: "2026-10-20T06:00:00.000Z" },
  { id: "records", runtimeState: "held", plannedPublishAt: "2026-10-23T06:00:00.000Z" },
  { id: "set-5", runtimeState: "held", plannedPublishAt: "2026-09-20T06:00:00.000Z" },
];
const cards = [
  { id: "L-C", releaseSetId: "party-leaders", rarity: "Common" },
  { id: "L-R", releaseSetId: "party-leaders", rarity: "Rare" },
  { id: "S-C", releaseSetId: "party-slot-2", rarity: "Common" },
  { id: "D-C", releaseSetId: "decisions", rarity: "Common", eventOnly: true },
];

test("current time only opens dated active sets", () => {
  const table = resolvePackTable({ pack: {}, releaseSets, cards, now });
  assert.deepEqual(table.sets.map(({ id }) => id), ["party-leaders"]);
  assert.equal(table.sets[0].percent, 100);
  assert.equal(table.sets[0].effectiveRarities.Uncommon, 0);
  assert.ok(table.sets[0].effectiveRarities.Common > table.sets[0].effectiveRarities.Rare);
});

test("held future sets stay out even when they have weight", () => {
  const table = resolvePackTable({
    pack: { sets: [{ id: "party-slot-2", weight: 30 }] },
    releaseSets,
    cards,
    now,
  });
  assert.ok(!table.sets.some(({ id }) => id === "party-slot-2"));
});

test("activating a dated set adds it to the current percent table", () => {
  const table = resolvePackTable({
    pack: {
      sets: [
        { id: "party-leaders", weight: 70 },
        { id: "party-slot-2", weight: 30 },
      ],
    },
    releaseSets: releaseSets.map((set) => (
      set.id === "party-slot-2"
        ? { ...set, runtimeState: "active", runtimeAvailableFrom: "2026-09-10T00:00:00+03:00" }
        : set
    )),
    cards,
    now,
  });
  assert.deepEqual(table.sets.map(({ id, percent }) => [id, percent]), [
    ["party-leaders", 70],
    ["party-slot-2", 30],
  ]);
});

test("missing rarity weight redistributes across cards that exist", () => {
  assert.deepEqual(
    effectiveRarities({ Common: 70, Uncommon: 25, Rare: 5 }, { Common: 13, Uncommon: 0, Rare: 1 }),
    { Common: 93.3, Uncommon: 0, Rare: 6.7 },
  );
});

test("idle pull uses set weight then rarity weight", () => {
  const pull = generateIdlePull({
    cards,
    inventory: {},
    pack: {
      sets: [
        { id: "party-leaders", weight: 1, rarities: { Common: 0, Uncommon: 0, Rare: 1 } },
        { id: "party-slot-2", weight: 0, rarities: { Common: 1, Uncommon: 0, Rare: 0 } },
      ],
    },
    releaseSets,
    now,
    rng: () => 0,
  });
  assert.equal(pull.cardId, "L-R");
  assert.equal(pull.finish, "Rare");
});

test("event cards stay out until the set opts them in", () => {
  const table = resolvePackTable({
    pack: { sets: [{ id: "decisions", weight: 100, includeEventCards: true }] },
    releaseSets: releaseSets.map((set) => (
      set.id === "decisions"
        ? { ...set, runtimeState: "active", runtimeAvailableFrom: "2026-09-01T00:00:00.000Z" }
        : set
    )),
    cards,
    now,
  });
  assert.equal(table.sets.find(({ id }) => id === "decisions")?.cardCount, 1);
});

test("specific-card weights keep R : UC : C near 1 : 1.5 : 2", () => {
  const rarities = rarityWeightsForCounts({ Common: 8, Uncommon: 4, Rare: 2 });
  const pR = rarities.Rare / 2;
  const pU = rarities.Uncommon / 4;
  const pC = rarities.Common / 8;
  assert.ok(Math.abs(pU / pR - 1.5) < 0.15);
  assert.ok(Math.abs(pC / pR - 2) < 0.15);
});

test("pack config validation rejects bad weights", () => {
  assert.equal(validPackConfig(undefined), true);
  assert.equal(validPackConfig({ sets: [{ id: "party-leaders", weight: 70 }] }), true);
  assert.equal(validPackConfig({ sets: [{ id: "party-leaders", weight: -1 }] }), false);
  assert.equal(validPackConfig({ pityAfter: 0 }), false);
});

test("any specific Rare is harder to pull than any specific Common in the current table", () => {
  const odds = cardPullOdds({ pack: {}, releaseSets, cards, now });
  const report = rarityOrderReport(odds);
  assert.equal(report.holds, true);
  assert.ok(report.minCommon > report.maxRare);
  const deri = odds.find(({ id }) => id === "L-R");
  const common = odds.find(({ id }) => id === "L-C");
  assert.ok(deri.expectedPulls > common.expectedPulls);
});
