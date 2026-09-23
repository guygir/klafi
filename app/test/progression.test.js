import assert from "node:assert/strict";
import test from "node:test";
import { climbCost, levelThresholds, rankAt } from "../server/progression.js";

test("each climb costs one more unique card: +2, +3, +4…", () => {
  assert.equal(climbCost(1), 2);
  assert.equal(climbCost(2), 3);
  assert.deepEqual(levelThresholds(49, 14), [0, 2, 5, 9, 14, 20, 27, 35, 44, 54, 65, 77, 90, 104]);
  assert.deepEqual(levelThresholds(14, 2), [0, 2]);
  assert.equal(levelThresholds(49, 14)[8], 44, "rank 9 חבר כנסת at 44 unique");
  assert.equal(rankAt(49), 9, "current idle pool finishes rank 9");
  assert.ok(49 >= 44 && 49 < 54, "current idle pool sits on the way to rank 10");
  assert.equal(rankAt(65), 11);
  assert.equal(rankAt(77 - 1), 11);
  assert.equal(rankAt(104), 14);
  assert.equal(rankAt(217), 14, "a full catalog clears ראש הממשלה at 104");
});
