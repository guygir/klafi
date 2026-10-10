import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createKalpiApp } from "../server/app.js";
import { lastAcquiredAtByCard, latestDates, sortBinderCards } from "../public/binder-order.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const projectRoot = path.resolve(appRoot, "..");

test("חדש date: an opened warehouse copy counts from when it was opened; waiting copies don't count", () => {
  const instances = [
    { instanceId: "a1", cardId: "A", pulledAt: "2026-10-01T00:00:00.000Z", seenAt: "2026-10-01T00:00:00.000Z" },
    { instanceId: "a2", cardId: "A", acquiredBy: "idle", pulledAt: "2026-10-09T03:00:00.000Z", seenAt: "2026-10-10T05:00:00.000Z" },
    { instanceId: "b1", cardId: "B", acquiredBy: "idle", pulledAt: "2026-10-09T09:00:00.000Z", seenAt: "2026-10-09T10:00:00.000Z" },
    { instanceId: "b2", cardId: "B", acquiredBy: "idle", pulledAt: "2026-10-10T04:00:00.000Z", seenAt: null },
    { instanceId: "c1", cardId: "C", acquiredBy: "trade-accepted", pulledAt: "2026-10-09T12:00:00.000Z", seenAt: null },
  ];
  const inventory = { A: 2, B: 1, C: 1 };
  const server = lastAcquiredAtByCard(instances, inventory, ["b2"]);
  assert.equal(server.A, "2026-10-10T05:00:00.000Z", "opened now, not when it reached the warehouse");
  assert.equal(server.B, "2026-10-09T10:00:00.000Z", "the copy still waiting does not date B");
  assert.equal(server.C, "2026-10-09T12:00:00.000Z", "a traded copy counts from the trade");
  assert.deepEqual(lastAcquiredAtByCard(instances, inventory), server, "client rule: an unopened non-trade copy is waiting");
  const reward = [...instances, { instanceId: "r", cardId: "A", acquiredBy: "rank-2", pulledAt: "2026-10-10T06:00:00.000Z", seenAt: null }];
  assert.equal(lastAcquiredAtByCard(reward, inventory).A, "2026-10-10T05:00:00.000Z", "an unopened rank reward does not jump the line");
  const catalog = ["A", "B", "C"].map((id, index) => ({ id, set: "S", number: index + 1 }));
  const first = { A: "2026-10-01T00:00:00.000Z", B: "2026-10-09T10:00:00.000Z", C: "2026-10-09T12:00:00.000Z" };
  assert.deepEqual(sortBinderCards(catalog, { sort: "date-new", catalog, acquiredAt: first, lastAcquiredAt: server }).map(({ id }) => id), ["A", "C", "B"]);
  assert.deepEqual(sortBinderCards(catalog, { sort: "date-old", catalog, acquiredAt: first, lastAcquiredAt: server }).map(({ id }) => id), ["A", "B", "C"], "ישן keeps first acquisition");
  assert.deepEqual(latestDates({ A: "2026-10-01T00:00:00Z" }, { A: "2026-10-02T00:00:00Z", B: "bad" }), { A: "2026-10-02T00:00:00.000Z" });
});

async function startApp(dataDir, clock) {
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
    avatarsPath: path.join(dataDir, "avatars.json"),
    assetsDir: path.join(projectRoot, "docs/design/assets"),
    docsDir: path.join(projectRoot, "docs"),
    debugEnabled: true,
    now: () => clock.now,
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

test("server: an opened warehouse duplicate is newest under חדש and shows 2x; waiting cards are undated", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "kalpi-binder-new-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  await copyFile(path.join(appRoot, "data/avatars.json"), path.join(dataDir, "avatars.json"));
  const clock = { now: Date.parse("2026-10-10T00:00:00.000Z") };
  const app = await startApp(dataDir, clock);
  t.after(() => app.close());
  const token = (await api(app.base, "/api/session", { method: "POST" })).body.token;
  const settled = await api(app.base, "/api/idle/settle", { token, method: "POST", body: {} });
  const waiting = settled.body.cards || [];
  // rng 0: the cold-start warehouse holds copies of the same card.
  const [firstCopy, secondCopy] = waiting;
  assert.ok(secondCopy && firstCopy.cardId === secondCopy.cardId, "two warehouse copies of one card");
  const target = firstCopy;
  await api(app.base, "/api/idle/seen", { token, method: "POST", body: { instanceIds: [firstCopy.instanceId] } });
  clock.now += 30 * 60 * 1000;
  const later = JSON.parse(await readFile(path.join(appRoot, "data/cards.json"), "utf8"));
  const laterCard = (Array.isArray(later) ? later : later.cards).find((card) => card.idleEligible && card.id !== target.cardId);
  await api(app.base, "/api/debug/unlock-card", { token, method: "POST", body: { cardId: laterCard.id } });
  const before = (await api(app.base, "/api/state", { token })).body;
  assert.ok(before.lastAcquiredAt[laterCard.id] > before.lastAcquiredAt[target.cardId], "the unlocked card is newest before the open");
  clock.now += 60 * 60 * 1000;
  const openedAt = new Date(clock.now).toISOString();
  const seen = await api(app.base, "/api/idle/seen", { token, method: "POST", body: { instanceIds: [secondCopy.instanceId] } });
  assert.equal(seen.status, 200);
  for (const state of [seen.body, (await api(app.base, "/api/state", { token })).body]) {
    assert.equal(state.inventory[target.cardId], 2, "2 regular copies");
    assert.equal(state.lastAcquiredAt[target.cardId], openedAt, "dated when opened");
    const newest = Object.entries(state.lastAcquiredAt).sort((a, b) => b[1].localeCompare(a[1]))[0][0];
    assert.equal(newest, target.cardId, "newest under חדש");
    assert.ok(Date.parse(state.acquiredAt[target.cardId]) < Date.parse(openedAt), "ישן keeps the first copy's date");
  }
});

test("client: the binder sorts חדש by the latest dates, notes opened cards at once, and caches the map", async () => {
  const js = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(js, /lastAcquiredAt: binderLastAcquiredAtMap\(\),/);
  assert.match(js, /const server = source\.lastAcquiredAt && typeof source\.lastAcquiredAt === "object"\n\s+\? source\.lastAcquiredAt\n\s+: lastAcquiredAtByCard\(source\.instances, source\.inventory\);/, "server map first");
  assert.match(js, /lastAcquiredAt: model\.serverState\.lastAcquiredAt \|\| \{\},/);
  assert.match(js, /function acknowledgeRevealedPack\(pack\) \{\n\s+if \(pack && !pack\.openedNoted && !model\.previewMode && !model\.showcase\) \{\n\s+pack\.openedNoted = true;\n\s+noteCardsOpened\(pack\.cards\);/);
  const slim = await readFile(new URL("../server/slim-home.js", import.meta.url), "utf8");
  assert.match(slim, /MAX\(COALESCE\(instance\.seen_at, instance\.pulled_at\)\) AS last_at/);
  assert.match(slim, /NOT \(COALESCE\(session\.extras->'unseenPulls', '\[\]'::jsonb\) \? instance\.instance_id\)/);
  assert.match(slim, /lastAcquiredAt: acquiredAtFromRow\(row\.last_acquired_state\)/);
});
