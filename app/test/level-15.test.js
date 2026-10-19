import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createKalpiApp, progressionState, RANK_TITLES } from "../server/app.js";
import { levelThresholds, rankAt } from "../server/progression.js";
import { runtimePaths } from "../server/runtime.js";
import { slimPublicState } from "../server/slim-state.js";

const { appRoot } = runtimePaths();
const readJson = async (rel) => JSON.parse(await readFile(path.join(appRoot, rel), "utf8"));
const FIFTEEN = [0, 2, 5, 9, 14, 20, 27, 35, 44, 54, 65, 77, 90, 104, 120];

test("15 levels: 104 for סגן רוה״מ, exactly 120 for ראש הממשלה", () => {
  assert.deepEqual(levelThresholds(120, 15), FIFTEEN);
  assert.deepEqual(levelThresholds(120, 14), FIFTEEN.slice(0, 14), "a 14-level config never sees the level-15 override");
  assert.deepEqual(levelThresholds(14, 2), [0, 2]);
  assert.deepEqual(levelThresholds(120, 15, {}), [...FIFTEEN.slice(0, 14), 119], "an empty override map falls back to the +n formula");
  assert.equal(rankAt(103), 13);
  assert.equal(rankAt(104), 14);
  assert.equal(rankAt(119), 14);
  assert.equal(rankAt(120), 15);
  assert.equal(rankAt(217), 15, "a full catalog stays at 15");
});

test("titles: 15 names with סגן רוה״מ at 14, in code and in studio-content", async () => {
  const studio = await readJson("data/studio-content.json");
  for (const names of [RANK_TITLES, studio.gameConfig.progression.rankNames]) {
    assert.equal(names.length, 15);
    assert.equal(new Set(names).size, 15);
    assert.equal(names[13], "סגן רוה״מ");
    assert.equal(names[14], "ראש הממשלה");
  }
  assert.deepEqual(studio.gameConfig.progression.thresholdOverrides, { 15: 120 });
  assert.equal(studio.gameConfig.progression.teaser, "האם תגיעו לדרגת ראש הממשלה?");
  const shell = await readJson("public/shell.json");
  assert.deepEqual(shell.gameConfig.progression.rankNames, studio.gameConfig.progression.rankNames);
  assert.deepEqual(shell.gameConfig.progression.thresholdOverrides, { 15: 120 });
});

test("slim and full progression agree at 104, 110, 119 and 120", async () => {
  const shell = await readJson("public/shell.json");
  const studio = await readJson("data/studio-content.json");
  const ids = shell.idleCardIds;
  const cards = ids.map((id) => ({ id, set: "S", releaseSetId: "set-5", idleEligible: true, rarity: "Common" }));
  for (const [owned, level, target, rank] of [[104, 14, 120, "סגן רוה״מ"], [110, 14, 120, "סגן רוה״מ"], [119, 14, 120, "סגן רוה״מ"], [120, 15, 120, "ראש הממשלה"]]) {
    const session = { inventory: Object.fromEntries(ids.slice(0, owned).map((id) => [id, 1])), instances: [], unseenPulls: [], highestRank: 1 };
    const full = progressionState(session, cards, studio.gameConfig.progression);
    const slim = slimPublicState(session, shell).progression;
    for (const p of [full, slim]) {
      assert.equal(p.level, level, `${owned} cards`);
      assert.equal(p.totalLevels, 15);
      assert.equal(p.target, target);
      assert.equal(p.rank, rank);
      assert.equal(p.unique, owned);
    }
    assert.equal(full.start, slim.start);
    assert.equal(full.remaining, slim.remaining);
    assert.equal(full.nextRank, slim.nextRank);
  }
});

test("prime-minister avatar: locked at 14, unlocked at 15", async () => {
  const avatars = await readJson("data/avatars.json");
  assert.equal(avatars.avatars.find(({ id }) => id === "prime-minister").unlockLevel, 15);
  const shell = await readJson("public/shell.json");
  const ids = shell.idleCardIds;
  const at = (owned) => slimPublicState({ inventory: Object.fromEntries(ids.slice(0, owned).map((id) => [id, 1])), instances: [], unseenPulls: [] }, shell)
    .avatars.find(({ id }) => id === "prime-minister");
  assert.equal(at(119).unlocked, false);
  assert.equal(at(120).unlocked, true);
});

test("server: reaching 120 queues and grants the level-15 bonus card once, never level 14 again", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "level-15-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const clock = { value: Date.now() };
  const make = () => createKalpiApp({ ...runtimePaths(), dataDir, databaseUrl: null, debugEnabled: false, now: () => clock.value });
  let server;
  const boot = async (handler) => {
    server = createServer(handler);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  };
  const stop = () => new Promise((resolve) => server.close(resolve));
  const api = async (p, token, body, headers = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${p}`, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  };
  await boot(await make());
  const token = (await api("/api/home")).body.token;
  const catalog = (await api("/api/catalog")).body.cards;
  await stop();
  const shell = await readJson("public/shell.json");
  const ids = shell.idleCardIds;
  assert.ok(catalog.length > 100);
  const file = path.join(dataDir, "state.json");
  const state = JSON.parse(await readFile(file, "utf8"));
  const session = state.sessions[token];
  const iso = new Date(clock.value).toISOString();
  session.inventory = Object.fromEntries(ids.slice(0, 119).map((id) => [id, 1]));
  session.instances = ids.slice(0, 119).map((cardId, i) => ({ instanceId: `seed-${i}`, cardId, finish: "Common", pulledAt: iso, isNew: false, acquiredBy: "idle", seenAt: iso }));
  session.highestRank = 14;
  session.claimedRankRewards = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  session.pendingRankRewards = [];
  session.avatarId = "prime-minister";
  await writeFile(file, JSON.stringify(state));
  await boot(await make());
  try {
    const at119 = (await api("/api/state", token)).body;
    assert.equal(at119.progression.level, 14);
    assert.equal(at119.progression.rank, "סגן רוה״מ");
    assert.equal(at119.progression.target, 120);
    assert.equal(at119.progression.remaining, 1);
    assert.deepEqual(at119.progression.pendingRewards, []);
    assert.equal(at119.avatars.find(({ id }) => id === "prime-minister").unlocked, false);
    assert.equal(at119.avatarId, "prime-minister", "a selected-but-locked avatar is kept as is (no silent fallback)");
    await stop();
    const s2 = JSON.parse(await readFile(file, "utf8"));
    s2.sessions[token].instances.push({ instanceId: "the-120th", cardId: ids[119], finish: "Common", pulledAt: iso, isNew: true, acquiredBy: "idle", seenAt: null });
    s2.sessions[token].unseenPulls = ["the-120th"];
    await writeFile(file, JSON.stringify(s2));
    await boot(await make());
    const opened = (await api("/api/idle/seen", token, { instanceIds: ["the-120th"] })).body;
    assert.equal(opened.progression.level, 15);
    assert.equal(opened.progression.rank, "ראש הממשלה");
    assert.deepEqual(opened.progression.pendingRewards, [15]);
    assert.equal(opened.avatars.find(({ id }) => id === "prime-minister").unlocked, true);
    const reward = await api("/api/rewards/level", token, {}, { "x-idempotency-key": "level-reward-15" });
    assert.equal(reward.status, 201);
    assert.equal(reward.body.rank, 15);
    assert.equal(reward.body.cards.length, 1, "one instant bonus card");
    assert.equal((await api("/api/rewards/level", token, {})).status, 409, "no second reward");
    assert.deepEqual((await api("/api/state", token)).body.progression.pendingRewards, []);
  } finally {
    await stop();
  }
});
