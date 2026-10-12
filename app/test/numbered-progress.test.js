import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createKalpiApp, progressionState } from "../server/app.js";
import { runtimePaths } from "../server/runtime.js";
import { progressionUnique } from "../server/numbered.js";
import { numberedHeldByCard } from "../server/stars.js";
import { slimPublicState } from "../server/slim-state.js";
import { achievementState, undeservedAchievementStamps } from "../server/achievements.js";
import { takeNumberedBoard } from "../server/collector-board.js";

const cards = ["A", "B", "C", "D", "E", "F", "G", "H"].map((id) => ({ id, set: "S", releaseSetId: "set-5", idleEligible: true, rarity: "Common", stars: 1 }));
const rankNames = ["r1", "r2", "r3", "r4", "r5", "r6"];
const numbered = (instanceId, cardId, seenAt = "2026-10-12T08:00:00Z") => ({ instanceId, cardId, numberedIndex: 1, numberedOf: 5, seenAt });

function player({ unseenNumbered = false } = {}) {
  return {
    inventory: { A: 1, B: 2, C: 1 },
    instances: [
      { instanceId: "a", cardId: "A" }, { instanceId: "b1", cardId: "B" },
      numbered("b2", "B"), numbered("c", "C"),
      ...(unseenNumbered ? [numbered("d", "D", null)] : []),
    ],
    unseenPulls: unseenNumbered ? ["d"] : [],
    highestRank: 1,
  };
}

test("progressionUnique: regular distinct cards plus one per opened numbered copy", () => {
  assert.equal(progressionUnique({ A: 1, B: 2, C: 1 }, { B: 1, C: 1 }), 4); // A, B regular + numbered B, numbered C
  assert.equal(progressionUnique({ A: 1 }, {}), 1);
  assert.equal(progressionUnique({ C: 1 }, { C: 5 }), 1, "numbered never exceeds owned copies");
  assert.equal(progressionUnique({ A: 1, X: 1 }, { X: 1 }, (id) => id !== "X"), 1, "ineligible cards do not count");
});

test("fast (slim) and full paths give identical progression", () => {
  for (const session of [player(), player({ unseenNumbered: true }), { inventory: {}, instances: [], unseenPulls: [] }]) {
    const full = progressionState(session, cards, { rankNames }, Date.parse("2026-10-12T09:00:00Z"));
    const slim = slimPublicState({ ...session, numberedByCard: numberedHeldByCard(session) }, {
      idleCardIds: cards.map(({ id }) => id), gameConfig: { progression: { rankNames } },
    }).progression;
    for (const key of ["unique", "level", "start", "target", "remaining"]) assert.equal(slim[key], full[key], key);
  }
  assert.equal(progressionState(player(), cards, { rankNames }).unique, 4);
});

test("numbered badge: earned only once opened, count = opened numbered copies; early stamp revoked while waiting", () => {
  const catalog = [{ id: "numbered-first", rule: "numbered", target: 1, hidden: true, tier: "hard" }];
  const waitingOnly = { inventory: {}, instances: [numbered("d", "D", null)], unseenPulls: ["d"], achievementsEarned: { "numbered-first": "2026-10-12T07:00:00Z" } };
  assert.deepEqual(undeservedAchievementStamps(waitingOnly, cards, catalog), ["numbered-first"]);
  assert.equal(achievementState({ ...waitingOnly, achievementsEarned: {} }, cards, catalog).achievements[0].earned, false);
  const badge = achievementState(player({ unseenNumbered: true }), cards, catalog).achievements[0];
  assert.equal(badge.earned, true);
  assert.equal(badge.hidden, true);
  assert.equal(badge.count, 2, "two opened; the waiting one does not count");
  // A player who opened one keeps the stamp.
  assert.deepEqual(undeservedAchievementStamps({ ...player(), achievementsEarned: { "numbered-first": "x" } }, cards, catalog), []);
});

test("numbered board: holders only, by count then stars, top-N plus your rank", () => {
  const all = Array.from({ length: 14 }, (_, i) => ({ label: `p${i}`, numbered: i % 4, stars: 100 - i, ownedUnique: 1, current: i === 13 }));
  const board = takeNumberedBoard(all, 10);
  assert.equal(board.numberedCollectorCount, 10);
  assert.ok(board.numberedCollectors.every((e) => e.numbered > 0));
  assert.deepEqual(board.numberedCollectors.slice(0, 3).map((e) => e.label), ["p3", "p7", "p11"]);
  assert.equal(board.yourNumberedRank, board.numberedCollectors.find((e) => e.current).rank);
  assert.deepEqual(takeNumberedBoard([{ numbered: 0, stars: 5 }]), { numberedCollectors: [], numberedCollectorCount: 0, yourNumberedRank: null });
});

test("server: badge waits for the open, level counts opened numbered copies, rank reward queued once", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "numbered-progress-"));
  const clock = { value: Date.parse("2026-10-12T09:00:00Z") };
  const handler = await createKalpiApp({ ...runtimePaths(), dataDir, databaseUrl: null, debugEnabled: false, now: () => clock.value });
  const boot = async () => {
    const server = createServer(handler);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    return server;
  };
  let server = await boot();
  const base = () => `http://127.0.0.1:${server.address().port}`;
  const api = async (p, token, body) => (await fetch(base() + p, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })).json();
  const token = (await api("/api/home")).token;
  await new Promise((resolve) => server.close(resolve));
  const add = async (id, cardId) => {
    const file = path.join(dataDir, "state.json");
    const state = JSON.parse(await readFile(file, "utf8"));
    const session = state.sessions[token];
    session.instances.push({ instanceId: id, cardId, finish: "Common", pulledAt: new Date(clock.value).toISOString(), isNew: true, acquiredBy: "idle", seenAt: null, numberedIndex: 1, numberedOf: 5 });
    session.unseenPulls = [...(session.unseenPulls || []), id];
    await writeFile(file, JSON.stringify(state));
  };
  const read = async () => {
    const state = await api("/api/state", token);
    const badge = (await api("/api/achievements", token)).achievements.find(({ id }) => id === "numbered-first");
    return { badge, progression: state.progression };
  };
  try {
    const fresh = await (async () => { server = await boot(); return read(); })();
    await new Promise((resolve) => server.close(resolve));
    await add("n1", "SET5-03");
    // A fresh handler re-reads state.json.
    const again = await createKalpiApp({ ...runtimePaths(), dataDir, databaseUrl: null, debugEnabled: false, now: () => clock.value });
    server = createServer(again);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const waiting = await read();
    assert.equal(waiting.badge.earned, false, "not earned while waiting in the warehouse");
    assert.equal(waiting.progression.unique, fresh.progression.unique);
    await api("/api/idle/seen", token, { instanceIds: ["n1"] });
    const opened = await read();
    assert.equal(opened.badge.earned, true);
    assert.equal(opened.badge.count, 1);
    assert.equal(opened.progression.unique, fresh.progression.unique + 1);
    await new Promise((resolve) => server.close(resolve));
    await add("n2", "SET5-04");
    const third = await createKalpiApp({ ...runtimePaths(), dataDir, databaseUrl: null, debugEnabled: false, now: () => clock.value });
    server = createServer(third);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    await api("/api/idle/seen", token, { instanceIds: ["n2"] });
    const two = await read();
    assert.equal(two.badge.count, 2);
    assert.equal(two.progression.unique, fresh.progression.unique + 2);
    assert.deepEqual(two.progression.pendingRewards, [2], "rank 2 queued once");
    await api("/api/state", token);
    await api("/api/idle/settle", token, {});
    assert.deepEqual((await api("/api/state", token)).progression.pendingRewards, [2], "no duplicate after more syncs");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
