import assert from "node:assert/strict";
import test from "node:test";
import { climbCost, levelThresholds } from "../server/progression.js";

test("each climb costs one more unique card: +2, +3, +4…", () => {
  assert.equal(climbCost(1), 2);
  assert.equal(climbCost(2), 3);
  assert.deepEqual(levelThresholds(49, 14), [0, 2, 5, 9, 14, 20, 27, 35, 44, 54, 65, 77, 90, 104]);
  assert.deepEqual(levelThresholds(14, 2), [0, 2]);
  assert.equal(levelThresholds(49, 14)[8], 44, "rank 9 חבר כנסת at 44 unique");
  assert.ok(49 >= 44 && 49 < 54, "current idle pool finishes rank 9 and sits on the way to 10");
});
