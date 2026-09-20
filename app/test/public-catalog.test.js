import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { expandPublicCatalog } from "../server/public-catalog.js";
import { slimPublicState } from "../server/slim-state.js";
import { LIVE_RELEASE_SET_IDS, visiblePlayerCards } from "../server/visible-sets.js";
import { emptyCommunity, slimDailyChallenge } from "../server/slim-community.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, "../public");

test("static catalog.json matches the public card expansion", async () => {
  const [cards, specials, catalog] = await Promise.all([
    readFile(path.resolve(here, "../data/cards.json"), "utf8").then(JSON.parse),
    readFile(path.resolve(here, "../data/specials-content.json"), "utf8").then(JSON.parse),
    readFile(path.join(publicDir, "catalog.json"), "utf8").then(JSON.parse),
  ]);
  const expanded = expandPublicCatalog(cards, specials);
  const visible = visiblePlayerCards(expanded);
  assert.equal(catalog.cards.length, visible.length);
  assert.deepEqual([...new Set(catalog.cards.map(({ releaseSetId }) => releaseSetId))].sort(), [...LIVE_RELEASE_SET_IDS].sort());
  assert.ok(catalog.cards.every(({ releaseSetId }) => LIVE_RELEASE_SET_IDS.includes(releaseSetId)));
  assert.ok(catalog.cards.some(({ idleEligible }) => idleEligible));
  assert.ok(catalog.cards.some(({ eventOnly }) => eventOnly));
  assert.ok(!catalog.cards.some(({ releaseSetId }) => releaseSetId === "editorial-backlog"));
  assert.ok(!catalog.cards.some(({ releaseSetId }) => String(releaseSetId).startsWith("party-position")));
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
  assert.equal(state.starCount, 0);
});

test("slim home counts stars from the visible card index", () => {
  const state = slimPublicState({
    displayName: "שחקן",
    avatarId: "kid-boy",
    createdAt: "2026-09-16T00:00:00.000Z",
    highestRank: 1,
    nextIdleAt: null,
    inventory: { "LIK-M01-Q01": 2, "DEC-01": 1 },
    unseenPulls: [],
    pendingRankRewards: [],
    favorites: [],
  }, {
    idleCardIds: ["LIK-M01-Q01"],
    cardIndex: [
      { id: "LIK-M01-Q01", rarity: "Common", set: "LIK" },
      { id: "DEC-01", rarity: "Rare", set: "special-decisions" },
    ],
    totals: { idleEligible: 14 },
    gameConfig: { progression: { rankNames: ["אזרח סקרן", "קורא כותרות"] } },
  });
  assert.equal(state.starCount, 4);
});

test("player shell only publishes the first four release sets", async () => {
  const shell = JSON.parse(await readFile(path.join(publicDir, "shell.json"), "utf8"));
  assert.deepEqual((shell.gameConfig.releaseSets || []).map(({ id }) => id), [...LIVE_RELEASE_SET_IDS]);
  assert.ok(shell.cardIndex?.length);
  assert.ok(shell.cardIndex.every(({ releaseSetId }) => LIVE_RELEASE_SET_IDS.includes(releaseSetId)));
  assert.equal(shell.totals.collectible, shell.cardIndex.length);
});

test("slim community payload stays off the fat catalog", () => {
  const payload = emptyCommunity({
    gameConfig: { parties: [{ id: "LIK", displayNameHe: "הליכוד" }] },
  }, Date.parse("2026-09-18T12:00:00+03:00"));
  assert.deepEqual(payload.trades, { trades: [], simulated: false });
  assert.equal(payload.leaderboards.collectors.length, 0);
  assert.equal(payload.activity.participatingSessions, 0);
  const challenge = slimDailyChallenge({
    gameConfig: { parties: [{ id: "LIK", displayNameHe: "הליכוד" }, { id: "YSR", displayNameHe: "יש עתיד" }] },
  }, Date.parse("2026-09-18T12:00:00+03:00"));
  assert.equal(challenge.targetPartyId, "LIK");
  assert.equal(challenge.targetPartyNameHe, "הליכוד");
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
  assert.deepEqual(leaders.map(({ displayCode }) => displayCode),
    Array.from({ length: 14 }, (_, index) => `ראש-${String(index + 1).padStart(2, "0")}`));
  assert.deepEqual(numberTwos.map(({ displayCode }) => displayCode),
    Array.from({ length: 13 }, (_, index) => `משנה-${String(index + 1).padStart(2, "0")}`));
  assert.ok([...leaders, ...numberTwos].every(({ artKey }) => artKey));
  await Promise.all([...leaders, ...numberTwos].map(({ artKey }) =>
    readFile(path.resolve(here, "../../docs/design/assets", artKey))));
});
