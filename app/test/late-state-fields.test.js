import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isStaleState, LATE_STATE_FIELDS, withLateFields } from "../public/state-sync.js";

const badges = [{ id: "set-complete:set-5", tier: "hard", earned: false, progress: 22, target: 23 }];
const pages = [{ tier: "hard", total: 1, earned: 0 }];
const home = (revision, extra = {}) => ({
  revision, inventory: { A: 1 }, unseenCount: 3, packCount: 2, achievements: badges, achievementPages: pages, ...extra,
});
const settle = (revision, extra = {}) => ({ revision, inventory: { A: 1, B: 1 }, unseenCount: 1, ...extra });

/** The client's order of operations (applyHomePayload / setServerState) as a pure model. */
function apply(model, incoming) {
  if (isStaleState(incoming, model.revision)) {
    const late = withLateFields(model.state, model.state, incoming, model.fieldRevisions);
    return { ...model, state: late.state, fieldRevisions: late.revisions, applied: false };
  }
  const merged = { ...model.state, ...incoming };
  const late = withLateFields(model.state, merged, incoming, model.fieldRevisions);
  return { revision: Math.max(model.revision, incoming.revision ?? 0), state: late.state, fieldRevisions: late.revisions, applied: true };
}
const fresh = () => ({ revision: 0, state: {}, fieldRevisions: {} });

test("late fields are the achievements list only", () => {
  assert.deepEqual([...LATE_STATE_FIELDS], ["achievements", "achievementPages"]);
});

test("settle first, then an older home: achievements land, cards and counts stay the settle's", () => {
  let model = apply(fresh(), settle(17));
  assert.equal(model.state.achievements, undefined);
  model = apply(model, home(16));
  assert.equal(model.applied, false, "home is still stale for cards");
  assert.deepEqual(model.state.achievements, badges);
  assert.deepEqual(model.state.achievementPages, pages);
  assert.deepEqual(model.state.inventory, { A: 1, B: 1 }, "inventory not rolled back");
  assert.equal(model.state.unseenCount, 1, "opened cards not re-shown");
  assert.equal(model.state.packCount, undefined, "pack count not resurrected from the stale home");
  assert.equal(model.revision, 17);
});

test("home first, then settle: achievements kept", () => {
  let model = apply(fresh(), home(16));
  model = apply(model, settle(17));
  assert.deepEqual(model.state.achievements, badges);
  assert.deepEqual(model.state.inventory, { A: 1, B: 1 });
  assert.equal(model.state.unseenCount, 1);
});

test("a stale home never rolls back inventory, unseen count or a newer achievements list", () => {
  const newer = [{ ...badges[0], progress: 23, earned: true }];
  let model = apply(fresh(), home(20, { achievements: newer, inventory: { A: 1, B: 1, C: 1 }, unseenCount: 0, packCount: 0 }));
  model = apply(model, home(18));
  assert.equal(model.applied, false);
  assert.deepEqual(model.state.inventory, { A: 1, B: 1, C: 1 });
  assert.equal(model.state.unseenCount, 0);
  assert.equal(model.state.packCount, 0);
  assert.deepEqual(model.state.achievements, newer, "an older list does not replace a newer one");
});

test("a cached list (no revision on record) is replaced by any server list; an empty list never wipes one", () => {
  const cached = [{ id: "old", earned: true }];
  let model = { revision: 20, state: { achievements: cached }, fieldRevisions: {} };
  model = apply(model, home(5));
  assert.deepEqual(model.state.achievements, badges);
  model = apply(model, settle(21, { achievements: [] }));
  assert.deepEqual(model.state.achievements, badges);
});

test("client: stale home/state payloads fill late fields; achievements never fall back to a local list", async () => {
  const js = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(js, /if \(home\.state && isStaleState\(home\.state, model\.stateRevision\)\) \{\n\s+fillLateFieldsFromStale\(home\.state\);\n\s+return false;/);
  assert.match(js, /if \(isStaleState\(state, model\.stateRevision\)\) \{\n\s+fillLateFieldsFromStale\(state\);\n\s+return false;/);
  assert.match(js, /function achievementList\(\) \{\n\s+ensureServerAchievements\(\);\n\s+if \(!hasServerAchievements\(\)\) return \[\];/);
  assert.doesNotMatch(js, /if \(!server\.length\) return local;/);
  assert.match(js, /request\("\/api\/achievements"\)/);
  // The list is fetched only where badges show, and nothing awaits it.
  assert.match(js, /if \(!badgeViewActive\(\)\) return;/);
  assert.doesNotMatch(js, /await [^;\n]*\/api\/achievements/);
  assert.match(js, /if \(name === "achievements" \|\| name === "binder"\) ensureServerAchievements\(\);/);
  assert.match(js, /setEmptyNote\(elements\.achievementsEmpty, "טוענים את התגים…"/);
});
