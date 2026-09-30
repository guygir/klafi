import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createKalpiApp } from "../server/app.js";
import { plainCopyCount, spendPlainCopies } from "../server/recycle.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const projectRoot = path.resolve(appRoot, "..");

function starsOf(card) {
  if (card?.rarity === "Promotion") return 5;
  if (card?.rarity?.startsWith("Rare")) return 3;
  if (card?.rarity?.startsWith("Uncommon")) return 2;
  return 1;
}

function bucketOf(card) {
  if (card?.rarity?.startsWith("Rare")) return "Rare";
  if (card?.rarity?.startsWith("Uncommon")) return "Uncommon";
  if (card?.rarity?.startsWith("Common")) return "Common";
  return null;
}

async function start(dataDir, clock) {
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
    achievementsPath: path.join(appRoot, "data/achievements.json"),
    avatarsPath: path.join(appRoot, "data/avatars.json"),
    assetsDir: path.join(projectRoot, "docs/design/assets"),
    docsDir: path.join(projectRoot, "docs"),
    debugEnabled: true,
    quizEnabled: false,
    databaseUrl: null,
    studioSecret: null,
    now: () => clock.value,
    numberedRandom: () => 0.99,
    rng: () => 0,
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function api(base, route, { token, method = "GET", body } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

function give(session, cardId, plain, numbered = 0) {
  session.inventory ??= {};
  session.instances ??= [];
  session.inventory[cardId] = (session.inventory[cardId] || 0) + plain + numbered;
  for (let index = 0; index < plain; index += 1) {
    session.instances.push({
      instanceId: `${cardId}-plain-${session.instances.length}`,
      cardId,
      acquiredBy: "test-seed",
      seenAt: "2026-09-17T12:00:00.000Z",
    });
  }
  for (let index = 0; index < numbered; index += 1) {
    session.instances.push({
      instanceId: `${cardId}-stamp-${session.instances.length}`,
      cardId,
      numberedIndex: index + 1,
      numberedOf: 10,
      finish: "Holo",
      acquiredBy: "idle",
      seenAt: "2026-09-17T12:00:00.000Z",
    });
  }
}

test("plain spend skips a numbered stamp and refuses a short remainder", () => {
  const session = {
    inventory: { "SET5-01": 3 },
    instances: [
      { instanceId: "p1", cardId: "SET5-01" },
      { instanceId: "p2", cardId: "SET5-01" },
      { instanceId: "stamp", cardId: "SET5-01", numberedIndex: 1, numberedOf: 1 },
    ],
    unseenPulls: [],
  };
  assert.equal(plainCopyCount(session, "SET5-01"), 2);
  assert.equal(spendPlainCopies(session, "SET5-01", 3), false);
  assert.equal(session.inventory["SET5-01"], 3);
  assert.equal(session.instances.find((item) => item.instanceId === "stamp").numberedIndex, 1);

  session.inventory["SET5-01"] = 4;
  session.instances.unshift({ instanceId: "p3", cardId: "SET5-01" });
  assert.equal(spendPlainCopies(session, "SET5-01", 3), true);
  assert.equal(session.inventory["SET5-01"], 1);
  assert.deepEqual(session.instances.map((item) => item.instanceId), ["stamp"]);
});

test("recycle spends three of one card, draws that rarity, and moves stars only on a real loss or gain", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-recycle-"));
  const clock = { value: Date.parse("2026-09-17T12:00:00.000Z") };
  let running = await start(dataDir, clock);
  const session = async () => (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const leftoverToken = await session();
  const lastToken = await session();
  const shortToken = await session();
  const keepStampToken = await session();
  const catalog = (await api(running.base, "/api/catalog")).body.cards;
  const commons = catalog.filter((card) => bucketOf(card) === "Common");
  const rare = catalog.find((card) => bucketOf(card) === "Rare");
  const cost = commons[0];
  assert.ok(cost && rare);
  await running.close();

  const stored = JSON.parse(await readFile(path.join(dataDir, "state.json"), "utf8"));
  const leftover = stored.sessions[leftoverToken];
  for (const card of commons) give(leftover, card.id, 1);
  give(leftover, cost.id, 3);
  give(stored.sessions[lastToken], cost.id, 3);
  give(stored.sessions[shortToken], cost.id, 2, 1);
  give(stored.sessions[keepStampToken], cost.id, 3, 1);
  await writeFile(path.join(dataDir, "state.json"), JSON.stringify(stored));
  running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const boardStars = async (token) => {
    const boards = await api(running.base, "/api/leaderboards", { token });
    return boards.body.collectors.find((entry) => entry.current)?.stars;
  };
  const ownedStars = (inventory) => Object.keys(inventory).reduce((sum, id) => {
    return sum + starsOf(catalog.find((card) => card.id === id));
  }, 0);

  const beforeLeftover = await api(running.base, "/api/state", { token: leftoverToken });
  const leftoverStars = ownedStars(beforeLeftover.body.inventory);
  assert.equal(beforeLeftover.body.inventory[cost.id], 4);
  assert.equal(beforeLeftover.body.starCount, leftoverStars);
  assert.equal(await boardStars(leftoverToken), leftoverStars);

  const recycled = await api(running.base, "/api/recycle", {
    token: leftoverToken,
    method: "POST",
    body: { cardId: cost.id, resultCardId: rare.id },
  });
  assert.equal(recycled.status, 200);
  const granted = catalog.find((card) => card.id === recycled.body.granted.cardId);
  assert.equal(bucketOf(granted), "Common");
  assert.notEqual(recycled.body.granted.cardId, rare.id);
  assert.equal(recycled.body.granted.acquiredBy, "recycle");
  assert.equal(recycled.body.granted.numberedIndex, undefined);
  assert.equal(recycled.body.state.inventory[cost.id], 1);
  assert.equal(recycled.body.state.starCount, leftoverStars, "a leftover copy keeps the star total");
  assert.equal(await boardStars(leftoverToken), leftoverStars);
  assert.equal(recycled.body.state.inventory[granted.id], 1, "the new copy waits unseen and does not add a second inventory count yet");

  const seenLeftover = await api(running.base, "/api/idle/seen", {
    token: leftoverToken,
    method: "POST",
    body: { instanceIds: [recycled.body.granted.instanceId] },
  });
  assert.equal(seenLeftover.status, 200);
  assert.ok(seenLeftover.body.inventory[granted.id] >= 1);
  assert.equal(seenLeftover.body.starCount, leftoverStars, "a duplicate grant adds no stars");
  assert.equal(await boardStars(leftoverToken), leftoverStars);

  const beforeLast = await api(running.base, "/api/state", { token: lastToken });
  assert.equal(beforeLast.body.starCount, starsOf(cost));
  assert.equal(await boardStars(lastToken), starsOf(cost));
  const spentLast = await api(running.base, "/api/recycle", {
    token: lastToken,
    method: "POST",
    body: { cardId: cost.id },
  });
  assert.equal(spentLast.status, 200);
  const lastGrant = catalog.find((card) => card.id === spentLast.body.granted.cardId);
  assert.equal(bucketOf(lastGrant), "Common");
  assert.equal(spentLast.body.granted.numberedIndex, undefined);
  assert.equal(spentLast.body.granted.acquiredBy, "recycle");
  assert.equal(spentLast.body.state.inventory[cost.id], undefined);
  assert.equal(spentLast.body.state.starCount, 0, "spending the last copy removes its stars");
  assert.equal(await boardStars(lastToken), 0);
  const seenLast = await api(running.base, "/api/idle/seen", {
    token: lastToken,
    method: "POST",
    body: { instanceIds: [spentLast.body.granted.instanceId] },
  });
  assert.equal(seenLast.body.inventory[lastGrant.id], 1);
  assert.equal(seenLast.body.starCount, starsOf(lastGrant), "a card he did not own adds its stars");
  assert.equal(await boardStars(lastToken), starsOf(lastGrant));

  const beforeShort = await api(running.base, "/api/state", { token: shortToken });
  const refused = await api(running.base, "/api/recycle", {
    token: shortToken,
    method: "POST",
    body: { cardId: cost.id },
  });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error, "NOT_ENOUGH_COPIES");
  const afterShort = await api(running.base, "/api/state", { token: shortToken });
  assert.equal(afterShort.body.inventory[cost.id], 3);
  assert.equal(afterShort.body.starCount, beforeShort.body.starCount);
  assert.equal(afterShort.body.numberedCopies.filter((item) => item.cardId === cost.id).length, 1);

  const kept = await api(running.base, "/api/recycle", {
    token: keepStampToken,
    method: "POST",
    body: { cardId: cost.id },
  });
  assert.equal(kept.status, 200);
  assert.equal(kept.body.state.inventory[cost.id], 1);
  assert.equal(kept.body.state.numberedCopies.filter((item) => item.cardId === cost.id).length, 1);
  assert.equal(kept.body.granted.numberedIndex, undefined);
  assert.equal(kept.body.state.starCount, starsOf(cost), "the leftover stamped copy still holds the stars");
});
