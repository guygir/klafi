import assert from "node:assert/strict";
import test from "node:test";
import { EARLY_UNIQUE_TARGETS, levelThresholds } from "../server/progression.js";

test("early ranks need a handful of unique cards, not a catalog percentage", () => {
  const thresholds = levelThresholds(290, 10, 1.2);
  assert.equal(thresholds[0], 0);
  assert.equal(thresholds[1], 2);
  assert.equal(thresholds[2], 4);
  assert.equal(thresholds[3], 7);
  assert.ok(thresholds[1] <= EARLY_UNIQUE_TARGETS[1]);
  assert.equal(thresholds.at(-1), 290);
  assert.equal(Math.max(0, thresholds[1] - 1), 1, "a first card leaves one unique to rank 2");
});

test("two-rank fixtures still finish at the full idle pool", () => {
  assert.deepEqual(levelThresholds(14, 2, 1.2), [0, 14]);
});
