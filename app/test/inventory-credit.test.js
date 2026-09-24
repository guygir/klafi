import assert from "node:assert/strict";
import test from "node:test";
import { creditSeenInstances, grantedCopyCounts } from "../server/inventory-credit.js";

test("granted copies count unseen instances so warehouse cards block pity rerolls", () => {
  assert.deepEqual(grantedCopyCounts({
    inventory: {},
    instances: [{ cardId: "A" }, { cardId: "A" }, { cardId: "B" }],
  }), { A: 2, B: 1 });
  assert.deepEqual(grantedCopyCounts({
    inventory: { LEGACY: 1, A: 1 },
    instances: [{ cardId: "A" }],
  }), { A: 1, LEGACY: 1 });
});

test("seen credits inventory for new grants and skips already-counted legacy copies", () => {
  const fresh = {
    inventory: {},
    unseenPulls: ["new-1", "new-2"],
    instances: [
      { instanceId: "new-1", cardId: "A", acquiredBy: "idle", seenAt: null },
      { instanceId: "new-2", cardId: "B", acquiredBy: "quiz", seenAt: null },
    ],
  };
  const first = creditSeenInstances(fresh, ["new-1", "ignored"], "2026-09-24T12:00:00.000Z");
  assert.equal(first.credited, 1);
  assert.equal(first.idleCredited, 1);
  assert.deepEqual(fresh.inventory, { A: 1 });
  assert.deepEqual(fresh.unseenPulls, ["new-2"]);
  assert.equal(fresh.instances[0].seenAt, "2026-09-24T12:00:00.000Z");

  const quiz = creditSeenInstances(fresh, ["new-2"], "2026-09-24T12:01:00.000Z");
  assert.equal(quiz.credited, 1);
  assert.equal(quiz.idleCredited, 0);
  assert.deepEqual(fresh.inventory, { A: 1, B: 1 });

  const legacy = {
    inventory: { A: 1 },
    unseenPulls: ["old-1"],
    instances: [{ instanceId: "old-1", cardId: "A", acquiredBy: "idle", seenAt: null }],
  };
  const skipped = creditSeenInstances(legacy, ["old-1"], "2026-09-24T12:02:00.000Z");
  assert.equal(skipped.credited, 0);
  assert.equal(skipped.idleCredited, 0);
  assert.deepEqual(legacy.inventory, { A: 1 });
  assert.deepEqual(legacy.unseenPulls, []);
  assert.equal(legacy.instances[0].seenAt, "2026-09-24T12:02:00.000Z");
});
