import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isStaleState, keepDailyRaceLeaders, overlayPendingSeen, stateRevision } from "../public/state-sync.js";
import { idleCountdownCopy, resumeClockAfterCap } from "../public/idle-countdown.js";
import { IDLE_INTERVAL_MS, resumeIdleClockAfterCap } from "../server/idle-config.js";
import { bumpStateRevision } from "../server/store.js";
import { dailyRaceScore, scoresInDailyRace } from "../server/daily-race.js";

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

test("the daily race scores a card on the Jerusalem day it is opened", () => {
  const cardsById = new Map([["LIK-1", { set: "LIK" }], ["DEM-1", { set: "DEM" }]]);
  const day = "2026-09-27";
  const openedToday = { cardId: "LIK-1", acquiredBy: "idle", pulledAt: "2026-09-26T20:00:00.000Z", seenAt: "2026-09-27T06:00:00.000Z" };
  const unopened = { cardId: "LIK-1", acquiredBy: "idle", pulledAt: "2026-09-27T05:00:00.000Z", seenAt: null };
  const openedYesterday = { cardId: "LIK-1", acquiredBy: "idle", seenAt: "2026-09-26T20:59:00.000Z" }; // 23:59 Jerusalem
  const justAfterMidnight = { cardId: "LIK-1", acquiredBy: "idle", seenAt: "2026-09-26T21:01:00.000Z" }; // 00:01 Jerusalem
  const traded = { cardId: "LIK-1", acquiredBy: "trade-accepted", seenAt: "2026-09-27T06:00:00.000Z" };
  const otherParty = { cardId: "DEM-1", acquiredBy: "idle", seenAt: "2026-09-27T06:00:00.000Z" };
  assert.equal(scoresInDailyRace(openedToday, day), true, "collected yesterday, opened today: scores today");
  assert.equal(scoresInDailyRace(unopened, day), false);
  assert.equal(scoresInDailyRace(openedYesterday, day), false);
  assert.equal(scoresInDailyRace(justAfterMidnight, day), true);
  assert.equal(scoresInDailyRace(traded, day), false);
  assert.equal(dailyRaceScore([openedToday, unopened, openedYesterday, justAfterMidnight, traded, otherParty], day, "LIK", cardsById), 2);
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

test("leaderboards (daily race + collectors) read the live catalog, including set-5 cards", async () => {
  const serverJs = await readFile(path.join(here, "../server/app.js"), "utf8");
  assert.doesNotMatch(serverJs, /leaderboardSummary\(cards,/, "cards.json lacks set-5: those cards would never score");
  assert.equal((serverJs.match(/leaderboardSummary\(allCards,/g) || []).length, 3);
});

test("the slim community board never wipes the race leaders of the same day", () => {
  const full = { collectors: [{ label: "a" }], dailyChallenge: { day: "2026-09-27", targetPartyId: "YB", leaders: [{ label: "me", current: true, cards: 2 }] } };
  const slim = { collectors: [{ label: "b" }], dailyChallenge: { day: "2026-09-27", targetPartyId: "YB", leaders: [] } };
  const merged = keepDailyRaceLeaders(full, slim);
  assert.equal(merged.dailyChallenge.leaders[0].cards, 2);
  assert.equal(merged.collectors[0].label, "b", "the rest of the slim board still applies");
  const nextDay = { ...slim, dailyChallenge: { ...slim.dailyChallenge, day: "2026-09-28" } };
  assert.deepEqual(keepDailyRaceLeaders(full, nextDay).dailyChallenge.leaders, [], "a new day starts empty");
  const fresh = { ...slim, dailyChallenge: { ...slim.dailyChallenge, leaders: [{ label: "me", cards: 3 }] } };
  assert.equal(keepDailyRaceLeaders(full, fresh).dailyChallenge.leaders[0].cards, 3);
});

test("postgres daily race reads a sargable Jerusalem-day seen_at range backed by migration 007", async () => {
  const { PostgresStore } = await import("../server/postgres-store.js");
  const store = new PostgresStore("postgres://qa@127.0.0.1:1/none");
  const queries = [];
  store.pool.query = async (sql, params = []) => { queries.push({ sql, params }); return { rows: [], rowCount: 0 }; };
  const cards = [{ id: "SET5-01", set: "LIK", rarity: "Common" }, { id: "YB-01", set: "YB", rarity: "Common" }];
  // 23:30 UTC on Sep 26 is already Sep 27 in Jerusalem.
  await store.leaderboardSummary(cards, Date.parse("2026-09-26T23:30:00.000Z"), null);
  const race = queries.find(({ sql }) => /FROM kalpi_instances i/.test(sql) && /seen_at/.test(sql));
  assert.ok(race, "the race query ran");
  assert.deepEqual(race.params, ["2026-09-27"]);
  assert.match(race.sql, /i\.seen_at >= \(\$1::date\)::timestamp AT TIME ZONE 'Asia\/Jerusalem'/);
  assert.match(race.sql, /i\.seen_at < \(\$1::date \+ 1\)::timestamp AT TIME ZONE 'Asia\/Jerusalem'/);
  assert.doesNotMatch(race.sql, /\(i\.seen_at AT TIME ZONE[^)]*\)::date/, "wrapping seen_at in a function defeats the index");
  await store.pool.end().catch(() => {});

  const storeJs = await readFile(path.join(here, "../server/postgres-store.js"), "utf8");
  assert.match(storeJs, /\["007_instances_seen_at_index", "007_instances_seen_at_index\.sql"\]/);
  const migration = await readFile(path.join(here, "../server/migrations/007_instances_seen_at_index.sql"), "utf8");
  assert.match(migration, /CREATE INDEX IF NOT EXISTS kalpi_instances_seen_at_idx\s+ON kalpi_instances \(seen_at\)\s+WHERE seen_at IS NOT NULL/);
  assert.doesNotMatch(migration, /^\s*CREATE INDEX CONCURRENTLY/m, "the session-pooler runner wraps migrations in BEGIN");
});
