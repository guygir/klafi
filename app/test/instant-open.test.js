import assert from "node:assert/strict";
import test from "node:test";
import { canOpenFromLastSettle, confirmedIdleInstance, INSTANT_OPEN_WINDOW_MS, overlayPendingSeen } from "../public/state-sync.js";

const now = 1_000_000;
const settle = (cards = [{ instanceId: "a", cardId: "c1" }, { instanceId: "b", cardId: "c2" }], extra = {}) => ({
  payload: { cards, state: { stateRevision: 5, unseenCount: cards.length } },
  at: now - 1000, token: "t1", revision: 5, ...extra,
});
const base = (over = {}) => ({ lastSettle: settle(), now, pendingSeen: [], cachedId: "a", needsSettle: false, settleInFlight: false, token: "t1", revision: 5, queuedIds: ["a", "b"], ...over });

test("fresh settle containing the card opens instantly", () => {
  const d = canOpenFromLastSettle(base());
  assert.equal(d.fast, true);
  assert.equal(d.card.instanceId, "a");
});
test("slow cases", () => {
  const cases = {
    "pending-seen": base({ pendingSeen: ["a"] }),
    "clock-due": base({ needsSettle: true }),
    stale: base({ now: now + INSTANT_OPEN_WINDOW_MS }),
    "no-settle": base({ lastSettle: null }),
    "token-changed": base({ token: "t2" }),
    "in-flight": base({ settleInFlight: true }),
    "missing": base({ cachedId: "zzz" }),
    "empty": base({ lastSettle: settle([]) }),
    "no-cached": base({ cachedId: null }),
    "future-at": base({ now: now - 5000 }),
    "newer-state-not-queued": base({ revision: 9, queuedIds: ["b"] }),
  };
  for (const [name, input] of Object.entries(cases)) {
    const d = canOpenFromLastSettle(input);
    assert.equal(d.fast, false, name);
    assert.equal(d.card, null, name);
  }
  assert.equal(canOpenFromLastSettle(base({ pendingSeen: ["a"] })).reason, "already-opened");
});
test("newer state is OK while the card is still queued locally", () => {
  assert.equal(canOpenFromLastSettle(base({ revision: 9, cachedId: "b", pendingSeen: ["a"], queuedIds: ["b"] })).fast, true);
});
test("custom window honoured", () => {
  assert.equal(canOpenFromLastSettle(base({ windowMs: 500 })).fast, false);
  assert.equal(canOpenFromLastSettle(base({ windowMs: 5000 })).fast, true);
});
test("slow-path pending-seen filter stops a stale settle re-revealing an opened card", () => {
  const settled = { state: { unseenCount: 2 }, cards: [{ instanceId: "a" }, { instanceId: "b" }] };
  assert.equal(confirmedIdleInstance(settled.cards, "a")?.instanceId, "a");
  const unopened = overlayPendingSeen(settled, ["a"]).cards;
  assert.equal(confirmedIdleInstance(unopened, "a"), null);
  assert.equal(confirmedIdleInstance(unopened, "b").instanceId, "b");
});
