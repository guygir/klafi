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
