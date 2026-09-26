import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isStaleState, overlayPendingSeen, stateRevision } from "../public/state-sync.js";
import { idleCountdownCopy, resumeClockAfterCap } from "../public/idle-countdown.js";
import { IDLE_INTERVAL_MS, resumeIdleClockAfterCap } from "../server/idle-config.js";
import { bumpStateRevision } from "../server/store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const NOW = Date.parse("2026-09-26T09:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();

test("an older server state never overwrites a newer one", () => {
  assert.equal(stateRevision({ revision: 7 }), 7);
  assert.equal(stateRevision({}), null);
  assert.equal(isStaleState({ revision: 4 }, 5), true);
  assert.equal(isStaleState({ revision: 5 }, 5), false, "equal revision is the same server data");
  assert.equal(isStaleState({ revision: 6 }, 5), false);
  assert.equal(isStaleState({}, 5), false, "payloads without a revision (old server/cache) still apply");
  const session = {};
  assert.equal(bumpStateRevision(session), 1);
  assert.equal(bumpStateRevision(session), 2);
});

test("opened cards stay hidden while their seen ack is in flight", () => {
  const cards = [{ instanceId: "a" }, { instanceId: "b" }, { instanceId: "c" }];
  const settled = overlayPendingSeen({ state: { unseenCount: 8 }, cards }, ["a"]);
  assert.equal(settled.state.unseenCount, 7);
  assert.deepEqual(settled.cards.map(({ instanceId }) => instanceId), ["b", "c"]);
  // /api/state style payloads: only instances the server still counts as unseen are subtracted.
  const state = { unseenCount: 7, instances: [{ instanceId: "a", seenAt: iso(NOW) }, { instanceId: "b", seenAt: null }] };
  assert.equal(overlayPendingSeen({ state }, ["a"]).state.unseenCount, 7, "already acked: no double count");
  assert.equal(overlayPendingSeen({ state }, ["b"]).state.unseenCount, 6);
  assert.equal(overlayPendingSeen({ state: { unseenCount: 3 } }, []).state.unseenCount, 3);
});

test("client acks the seen card when the reveal starts and guards every server state write", async () => {
  const appJs = await readFile(path.join(here, "../public/app.js"), "utf8");
  const walkout = appJs.slice(appJs.indexOf("function startWalkout()"), appJs.indexOf("function applyCardStage"));
  assert.match(walkout, /acknowledgeRevealedPack\(model\.currentPack\)/);
  assert.match(appJs, /const SEEN_ACK_MODES = new Set\(\["idle-return", "level-reward", "quiz"\]\)/);
  // No raw assignment of a server response: all go through setServerState / applyHomePayload.
  assert.doesNotMatch(appJs, /model\.serverState = await request\(/);
  assert.doesNotMatch(appJs, /model\.serverState = \{ \.\.\.model\.serverState, \.\.\.\(await request/);
  assert.match(appJs, /if \(home\.state && isStaleState\(home\.state, model\.stateRevision\)\) return false;/);
  const settle = appJs.slice(appJs.indexOf("async function hydrateIdleQueue"), appJs.indexOf("function scheduleIdleRefill"));
  assert.doesNotMatch(settle, /model\.idleQueue = settled\.cards/, "the settle queue only lands through the revision guard");
  // Level-up dialog waits for the reveal to finish.
  assert.match(appJs, /pending\.length && !elements\.levelDialog\.open && revealInProgress\(\)/);
});

test("postgres saves advance the session revision only when something was written", async () => {
  const { PostgresStore } = await import("../server/postgres-store.js");
  const store = new PostgresStore("postgres://qa@127.0.0.1:1/none");
  const queries = [];
  store.executor = () => ({ query: async (sql, params) => { queries.push({ sql, params }); return { rows: [{ token: "t" }], rowCount: 1 }; } });
  const base = { displayName: "p", inventory: {}, instances: [], packs: [], unseenPulls: ["a"], preparedPulls: [], stateRevision: 4 };
  const unchanged = structuredClone(base);
  await store.saveSession("t", unchanged, structuredClone(base));
  assert.equal(unchanged.stateRevision, 4);
  assert.equal(queries.length, 0, "a no-op settle stays a zero-write request");
  const changed = { ...structuredClone(base), unseenPulls: [] };
  await store.saveSession("t", changed, structuredClone(base));
  assert.equal(changed.stateRevision, 5);
  assert.equal(JSON.parse(queries[0].params[14]).stateRevision, 5, "revision is persisted in extras");
  await store.pool.end().catch(() => {});
});

test("leaving a full warehouse resumes the paused idle clock instead of paying out the missed slot", () => {
  const dueWhileFull = { unseenPulls: new Array(7).fill("x"), preparedPulls: [], nextIdleAt: iso(NOW - (2 * 60 + 56) * 60_000) };
  assert.equal(resumeIdleClockAfterCap(dueWhileFull, NOW), true);
  assert.equal(dueWhileFull.nextIdleAt, iso(NOW + IDLE_INTERVAL_MS));
  const notYetDue = { preparedPulls: [], nextIdleAt: iso(NOW + 4 * 60_000) };
  assert.equal(resumeIdleClockAfterCap(notYetDue, NOW), false);
  assert.equal(notYetDue.nextIdleAt, iso(NOW + 4 * 60_000), "a slot still in the future keeps its time");
  const withPrepared = { preparedPulls: [{ availableAt: iso(NOW - 60_000) }, { availableAt: iso(NOW - 60_000 + IDLE_INTERVAL_MS) }], nextIdleAt: iso(NOW - 60_000) };
  resumeIdleClockAfterCap(withPrepared, NOW);
  assert.deepEqual(withPrepared.preparedPulls.map(({ availableAt }) => availableAt), [iso(NOW + IDLE_INTERVAL_MS), iso(NOW + 2 * IDLE_INTERVAL_MS)]);
  // The client mirror (display-only) lands on the same schedule, so the timer shows 3h, not a phantom slot.
  const view = resumeClockAfterCap({ unseenCount: 7, idleCapacity: 8, preparedPulls: [], nextIdleAt: iso(NOW - 176 * 60_000) }, NOW);
  assert.equal(view.nextIdleAt, iso(NOW + IDLE_INTERVAL_MS));
  const copy = idleCountdownCopy({ serverState: view, now: NOW });
  assert.equal(copy.needsSettle, false);
  assert.equal(copy.text, "הבא בעוד 03:00:00");
});
