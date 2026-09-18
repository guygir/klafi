import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { expandPublicCatalog } from "../server/public-catalog.js";
import { slimPublicState } from "../server/slim-state.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, "../public");

test("static catalog.json matches the public card expansion", async () => {
  const [cards, specials, catalog] = await Promise.all([
    readFile(path.resolve(here, "../data/cards.json"), "utf8").then(JSON.parse),
    readFile(path.resolve(here, "../data/specials-content.json"), "utf8").then(JSON.parse),
    readFile(path.join(publicDir, "catalog.json"), "utf8").then(JSON.parse),
  ]);
  const expanded = expandPublicCatalog(cards, specials);
  assert.equal(catalog.cards.length, expanded.length);
  assert.ok(catalog.cards.some(({ idleEligible }) => idleEligible));
  assert.ok(catalog.cards.some(({ eventOnly }) => eventOnly));
});

test("slim home state includes inventory for binder reads", () => {
  const state = slimPublicState({
    displayName: "שחקן",
    avatarId: "kid-boy",
    createdAt: "2026-09-16T00:00:00.000Z",
    highestRank: 1,
    nextIdleAt: null,
    inventory: { "LIK-M01-Q01": 2 },
    unseenPulls: [],
    pendingRankRewards: [],
    favorites: ["LIK-M01-Q01"],
  }, {
    idleCardIds: ["LIK-M01-Q01"],
    totals: { idleEligible: 14 },
    gameConfig: { progression: { rankNames: ["אזרח סקרן", "קורא כותרות"] } },
  });
  assert.equal(state.inventory["LIK-M01-Q01"], 2);
  assert.deepEqual(state.favorites, ["LIK-M01-Q01"]);
  assert.equal(state.ownedUnique, 1);
});


test("Sets 3 and 4 ship complete art-backed catalogs with their collectible rarities", async () => {
  const [cards, specials] = await Promise.all([
    readFile(path.resolve(here, "../data/cards.json"), "utf8").then(JSON.parse),
    readFile(path.resolve(here, "../data/specials-content.json"), "utf8").then(JSON.parse),
  ]);
  const expanded = expandPublicCatalog(cards, specials);
  const decisions = expanded.filter(({ releaseSetId }) => releaseSetId === "decisions");
  const records = expanded.filter(({ releaseSetId }) => releaseSetId === "records");
  assert.equal(decisions.length, 9);
  assert.equal(records.length, 10);
  assert.ok([...decisions, ...records].every(({ artKey }) => artKey));
  assert.deepEqual(
    Object.fromEntries(["Common", "Uncommon", "Rare"].map((rarity) => [rarity, decisions.filter((card) => card.rarity === rarity).length])),
    { Common: 4, Uncommon: 3, Rare: 2 },
  );
});


test("Sets 1 and 2 ship complete art-backed catalogs", async () => {
  const [cards, specials] = await Promise.all([
    readFile(path.resolve(here, "../data/cards.json"), "utf8").then(JSON.parse),
    readFile(path.resolve(here, "../data/specials-content.json"), "utf8").then(JSON.parse),
  ]);
  const expanded = expandPublicCatalog(cards, specials);
  const leaders = expanded.filter(({ releaseSetId }) => releaseSetId === "party-leaders");
  const numberTwos = expanded.filter(({ releaseSetId }) => releaseSetId === "party-slot-2");
  assert.equal(leaders.length, 14);
  assert.equal(numberTwos.length, 13);
  assert.ok([...leaders, ...numberTwos].every(({ artKey }) => artKey));
  await Promise.all([...leaders, ...numberTwos].map(({ artKey }) =>
    readFile(path.resolve(here, "../../docs/design/assets", artKey))));
});
