import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_NUMBERED_COPIES_BY_RARITY,
  normalizeNumberedCopiesByRarity,
  numberedCopiesFor,
} from "../public/numbered-copies.js";
import { stampEligible, stampKey, stampMax } from "../server/numbered.js";

const sets = ["set-5", "set-7", "set-8"];

test("sets 7 and 8: UC has 2 numbered copies, R has 1, C none, regardless of list slot", () => {
  for (const releaseSetId of ["set-7", "set-8"]) {
    const base = { set: "LIK", listSlot: 40, releaseSetId };
    assert.equal(stampMax({ ...base, id: "a", rarity: "Uncommon" }), 2);
    assert.equal(stampMax({ ...base, id: "b", rarity: "Rare" }), 1);
    assert.equal(stampMax({ ...base, id: "c", rarity: "Common" }), 0);
    assert.equal(stampMax({ ...base, id: "d", rarity: "Rare", listSlot: null }), 1);
    assert.equal(stampEligible({ ...base, id: "c", rarity: "Common" }, sets), false);
    assert.equal(stampEligible({ ...base, id: "a", rarity: "Uncommon" }, sets), true);
  }
});

test("set 5 keeps list-slot print runs and card-id serial keys", () => {
  const card = { id: "SET5-04", set: "LIK", listSlot: 6, rarity: "Common", releaseSetId: "set-5" };
  assert.equal(stampMax(card), 6);
  assert.equal(stampKey(card), "SET5-04");
});

test("cards sharing a list slot get separate serial pools", () => {
  const a = { id: "SET7-01", set: "LIK", listSlot: 5, rarity: "Uncommon", releaseSetId: "set-7" };
  const b = { id: "SET7-02", set: "LIK", listSlot: 5, rarity: "Uncommon", releaseSetId: "set-7" };
  assert.notEqual(stampKey(a), stampKey(b));
});

test("copy table normalizes and the studio default matches the code default", () => {
  assert.deepEqual(normalizeNumberedCopiesByRarity(undefined), DEFAULT_NUMBERED_COPIES_BY_RARITY);
  assert.deepEqual(normalizeNumberedCopiesByRarity({ "set-7": { Uncommon: "3", Rare: -1 }, "BAD ID": {} }),
    { "set-7": { Common: 0, Uncommon: 3, Rare: 0 } });
  assert.equal(numberedCopiesFor({ releaseSetId: "set-9", listSlot: 3 }, {}), 3);
  const studio = JSON.parse(readFileSync(new URL("../data/studio-content.json", import.meta.url), "utf8"));
  assert.deepEqual(studio.gameConfig.progression.numberedSets, sets);
  assert.deepEqual(normalizeNumberedCopiesByRarity(studio.gameConfig.progression.numberedCopiesByRarity), DEFAULT_NUMBERED_COPIES_BY_RARITY);
});

test("live catalog: 20 numbered copies in set 7, 23 in set 8", () => {
  const catalog = JSON.parse(readFileSync(new URL("../public/catalog.json", import.meta.url), "utf8"));
  const cards = catalog.cards || catalog;
  const total = (id) => cards.filter((card) => card.releaseSetId === id && stampEligible(card, sets))
    .reduce((sum, card) => sum + stampMax(card), 0);
  assert.equal(total("set-7"), 20);
  assert.equal(total("set-8"), 23);
});
