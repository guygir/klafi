import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createKalpiApp } from "../server/app.js";
import {
  COPY_COUNT_RULES,
  achievementState,
  expandAchievementCatalog,
  revokeUndeservedAchievements,
  stampAchievements,
  undeservedAchievementStamps,
} from "../server/achievements.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const projectRoot = path.resolve(appRoot, "..");

// Three-card set; M6 is the card some players hold only as a numbered copy.
const cards = ["M1", "M2", "M6"].map((id) => ({ id, set: "MOM", releaseSetId: "set-5", idleEligible: true, rarity: "Common" }));
const catalog = expandAchievementCatalog([
  { id: "set-complete", rule: "setComplete", tier: "hard" },
  { id: "register-three", rule: "unique", target: 3 },
  { id: "first-double", rule: "duplicate", target: 2 },
  { id: "twenty-stars", rule: "stars", target: 3 },
], cards, [{ id: "set-5", nameHe: "רגעים" }]);
const SET = "set-complete:set-5";
const STAMP = "2026-09-01T00:00:00.000Z";
const numbered = (cardId = "M6") => ({ instanceId: `n-${cardId}`, cardId, numberedIndex: 2, numberedOf: 4, seenAt: STAMP });

function player({ inventory, instances, stamps }) {
  return { inventory, instances, unseenPulls: [], achievementsEarned: { ...stamps } };
}
// Stamped while the numbered M6 counted as a regular copy.
const numberedOnly = () => player({
  inventory: { M1: 1, M2: 1, M6: 1 },
  instances: [{ instanceId: "r1", cardId: "M1" }, { instanceId: "r2", cardId: "M2" }, numbered()],
  stamps: { [SET]: STAMP, "register-three": STAMP, "twenty-stars": STAMP },
});
const fullSet = () => player({
  inventory: { M1: 1, M2: 1, M6: 1 },
  instances: [{ instanceId: "r1", cardId: "M1" }, { instanceId: "r2", cardId: "M2" }, { instanceId: "r6", cardId: "M6" }],
  stamps: { [SET]: STAMP, "register-three": STAMP },
});
// Completed the set with regular copies, then traded M6 away: no numbered copy involved.
const tradedAway = () => player({
  inventory: { M1: 1, M2: 1 },
  instances: [{ instanceId: "r1", cardId: "M1" }, { instanceId: "r2", cardId: "M2" }],
  stamps: { [SET]: STAMP, "register-three": STAMP },
});

test("copy-count rules are the ones the numbered bug could meet; stars are not", () => {
  for (const rule of ["setComplete", "unique", "duplicate", "ownCards", "leaders", "leaderParties", "bestSet", "binderHalf", "rare"]) {
    assert.ok(COPY_COUNT_RULES.has(rule), rule);
  }
  assert.equal(COPY_COUNT_RULES.has("stars"), false);
  assert.equal(COPY_COUNT_RULES.has("numbered"), false);
});

test("numbered-only owner: the set stamp is undeserved, shown not earned, and removed on write", () => {
  const session = numberedOnly();
  assert.deepEqual(undeservedAchievementStamps(session, cards, catalog).sort(), [SET, "register-three"].sort());
  const before = achievementState(session, cards, catalog);
  const badge = before.achievements.find(({ id }) => id === SET);
  assert.equal(badge.earned, false, "a read already shows it unearned");
  assert.equal(badge.progress, 2);
  assert.equal(badge.target, 3);
  assert.equal(badge.earnedAt, null);
  assert.equal(before.achievements.find(({ id }) => id === "twenty-stars").earned, true, "stars keep the numbered +4");
  const hard = before.achievementPages.find(({ tier }) => tier === "hard");
  assert.equal(hard.earned, 0, "the hard page count drops");
  assert.deepEqual(revokeUndeservedAchievements(session, cards, catalog).sort(), [SET, "register-three"].sort());
  assert.equal(session.achievementsEarned[SET], undefined);
  assert.equal(session.achievementsEarned["twenty-stars"], STAMP, "unrelated stamps stay");
  assert.deepEqual(stampAchievements(session, cards, catalog), [], "not re-stamped");
  assert.deepEqual(revokeUndeservedAchievements(session, cards, catalog), [], "idempotent");
});

test("legit full-set owner keeps the stamp", () => {
  const session = fullSet();
  assert.deepEqual(undeservedAchievementStamps(session, cards, catalog), []);
  assert.deepEqual(revokeUndeservedAchievements(session, cards, catalog), []);
  assert.equal(achievementState(session, cards, catalog).achievements.find(({ id }) => id === SET).earned, true);
  // Holding a numbered copy as well as a regular one changes nothing.
  const both = fullSet();
  both.inventory.M6 = 2;
  both.instances.push(numbered());
  assert.deepEqual(undeservedAchievementStamps(both, cards, catalog), []);
});

test("traded-away (no numbered copy involved) keeps the stamp: earned badges stay earned", () => {
  const session = tradedAway();
  assert.deepEqual(undeservedAchievementStamps(session, cards, catalog), []);
  assert.deepEqual(revokeUndeservedAchievements(session, cards, catalog), []);
  const badge = achievementState(session, cards, catalog).achievements.find(({ id }) => id === SET);
  assert.equal(badge.earned, true);
  assert.equal(badge.earnedAt, STAMP);
});

test("duplicate badge stamped on numbered + regular copy of one card is revoked", () => {
  const session = player({
    inventory: { M1: 2 },
    instances: [{ instanceId: "r1", cardId: "M1" }, numbered("M1")],
    stamps: { "first-double": STAMP },
  });
  assert.deepEqual(revokeUndeservedAchievements(session, cards, catalog), ["first-double"]);
});

// ---- Through the app (file store): GET /api/achievements and the write path.

async function startApp(dataDir, achievementsPath) {
  const handler = await createKalpiApp({
    dataDir,
    publicDir: path.join(appRoot, "public"),
    cardsPath: path.join(appRoot, "data/cards.json"),
    advocacyPath: path.join(appRoot, "data/advocacy.json"),
    sourcesPath: path.join(appRoot, "data/sources.json"),
    sequencesPath: path.join(appRoot, "data/editorial-sequences.json"),
    samplesPath: path.join(appRoot, "data/editorial-samples.json"),
    demoPackPath: path.join(appRoot, "data/demo-pack.json"),
    studioContentPath: path.join(appRoot, "data/studio-content.json"),
    specialsPath: path.join(appRoot, "data/specials-content.json"),
    presentationContentPath: path.join(appRoot, "data/presentation-content.json"),
    eventsPath: path.join(appRoot, "data/events.json"),
    achievementsPath,
    avatarsPath: path.join(appRoot, "data/avatars.json"),
    assetsDir: path.join(projectRoot, "docs/design/assets"),
    docsDir: path.join(projectRoot, "docs"),
    debugEnabled: true,
    now: () => Date.parse("2026-09-20T09:00:00.000Z"),
    rng: () => 0,
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function api(base, route, { token, method = "GET", body } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

test("server: an undeserved set stamp reads as not earned and the next write removes it; legit and traded-away stamps stay", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-revoke-"));
  const achievementsPath = path.join(dataDir, "achievements.json");
  await copyFile(path.join(appRoot, "data/achievements.json"), achievementsPath);
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const cardData = JSON.parse(await readFile(path.join(appRoot, "data/cards.json"), "utf8"));
  const allCards = Array.isArray(cardData) ? cardData : cardData.cards;
  // party-slot-2 is a pullable set in data/cards.json (רגעים lives in the release pools).
  const SLOT = "set-complete:party-slot-2";
  const setCards = allCards.filter((card) => card.releaseSetId === "party-slot-2" && card.idleEligible && !card.eventOnly).map(({ id }) => id);
  assert.ok(setCards.length > 2);
  const [numberedCard, missingCard] = [setCards[5], setCards[1]];

  let app = await startApp(dataDir, achievementsPath);
  const tokens = {};
  for (const name of ["numbered", "legit", "traded"]) {
    tokens[name] = (await api(app.base, "/api/session", { method: "POST" })).body.token;
    for (const cardId of setCards) await api(app.base, "/api/debug/unlock-card", { token: tokens[name], method: "POST", body: { cardId } });
  }
  const earned = await api(app.base, "/api/achievements", { token: tokens.legit });
  assert.equal(earned.status, 200);
  assert.equal(earned.body.achievements.find(({ id }) => id === SLOT).earned, true, "full set earned by the unlock writes");
  await app.close();

  // Seed what the bug left behind: numbered-only copy with the stamp; and a traded-away copy.
  const statePath = path.join(dataDir, "state.json");
  const state = JSON.parse(await readFile(statePath, "utf8"));
  const bad = state.sessions[tokens.numbered];
  Object.assign(bad.instances.find((item) => item.cardId === numberedCard), { numberedIndex: 2, numberedOf: 4, seenAt: STAMP });
  const traded = state.sessions[tokens.traded];
  delete traded.inventory[missingCard];
  traded.instances = traded.instances.filter((item) => item.cardId !== missingCard);
  for (const name of ["numbered", "legit", "traded"]) assert.ok(state.sessions[tokens[name]].achievementsEarned[SLOT], `${name} stamped`);
  await writeFile(statePath, JSON.stringify(state));

  app = await startApp(dataDir, achievementsPath);
  t.after(() => app.close());
  const read = await api(app.base, "/api/achievements", { token: tokens.numbered });
  const badge = read.body.achievements.find(({ id }) => id === SLOT);
  assert.equal(badge.earned, false);
  assert.equal(badge.progress, setCards.length - 1);
  assert.equal(badge.target, setCards.length);
  assert.equal(typeof read.body.revision, "number");
  const legit = (await api(app.base, "/api/achievements", { token: tokens.legit })).body;
  const earnedHard = (body) => body.achievements.filter((item) => item.tier === "hard" && item.earned).map(({ id }) => id).sort();
  // Same collection, but the numbered copy loses the set badge (and earns the numbered one).
  assert.deepEqual(earnedHard(read.body), [...earnedHard(legit).filter((id) => id !== SLOT), "numbered-first"].sort());
  const hardCount = (body) => body.achievementPages.find(({ tier }) => tier === "hard").earned;
  assert.equal(hardCount(read.body), earnedHard(read.body).length, "the hard page count follows the list");
  // A read never writes: the stamp is still on disk.
  assert.ok(JSON.parse(await readFile(statePath, "utf8")).sessions[tokens.numbered].achievementsEarned[SLOT]);
  const full = await api(app.base, "/api/state", { token: tokens.numbered });
  assert.equal(full.body.achievements.find(({ id }) => id === SLOT).earned, false, "/api/state agrees");

  // Any session write removes it (store.withSession, the same wrapper the Postgres store gets).
  const write = (token) => api(app.base, "/api/debug/unlock-card", { token, method: "POST", body: { cardId: setCards[0] } });
  await write(tokens.numbered);
  const after = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(after.sessions[tokens.numbered].achievementsEarned[SLOT], undefined, "stamp removed");
  await write(tokens.legit);
  await write(tokens.traded);
  const kept = JSON.parse(await readFile(statePath, "utf8"));
  assert.ok(kept.sessions[tokens.legit].achievementsEarned[SLOT], "legit keeps it");
  assert.ok(kept.sessions[tokens.traded].achievementsEarned[SLOT], "traded-away keeps it");
  const tradedBadge = (await api(app.base, "/api/achievements", { token: tokens.traded })).body.achievements.find(({ id }) => id === SLOT);
  assert.equal(tradedBadge.earned, true);
});
