/**
 * Guy lead: trade CREATED before #170, ACCEPTED after.
 * Create OR/3 ↔ 1 with a1fb4db code on the file store, then accept through
 * current api/ routing. PGlite gets the same a1fb4db row shape via INSERT.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { createKalpiApp } from "../server/app.js";
import { handleSlimCommunity, useSlimCommunityPool } from "../server/slim-community.js";
import { handleSlimHome, useSlimHomePool } from "../server/slim-home.js";
import { PostgresStore } from "../server/postgres-store.js";
import { JsonStore } from "../server/store.js";
import { normalizeStoredTrade } from "../server/trade-core.js";
import { movedCardsFromAccept, parseCardIds } from "../public/trade-result.js";

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const projectRoot = path.resolve(appRoot, "..");
const PRE170 = "a1fb4db";

function pglitePool(db) {
  const run = (sql, params) => db.query(sql, params);
  return { query: run, connect: async () => ({ query: run, release() {} }) };
}

async function migratePglite(db, migrationsRoot) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS kalpi_schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  for (const file of (await readdir(path.join(migrationsRoot, "server/migrations"))).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(await readFile(path.join(migrationsRoot, "server/migrations", file), "utf8"));
    await db.query(
      "INSERT INTO kalpi_schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
      [file.replace(/\.sql$/, "")],
    );
  }
  return db;
}

function restoreRequestUrl(request) {
  const current = new URL(request.url, "http://localhost");
  const restored = current.searchParams.get("__kalpi_path");
  if (!restored) return request;
  current.searchParams.delete("__kalpi_path");
  const query = current.searchParams.toString();
  request.url = query ? `${restored}?${query}` : restored;
  return request;
}

async function startFrom(repoRoot, dataDir, clock, { store = null, db = null } = {}) {
  const root = path.join(repoRoot, "app");
  const { createKalpiApp: createApp } = repoRoot === projectRoot
    ? { createKalpiApp }
    : await import(pathToFileURL(path.join(root, "server/app.js")).href);
  let slimCommunity = null;
  let slimHome = null;
  if (repoRoot === projectRoot) {
    slimCommunity = { handleSlimCommunity, useSlimCommunityPool };
    slimHome = { handleSlimHome, useSlimHomePool };
  } else {
    try {
      slimCommunity = await import(pathToFileURL(path.join(root, "server/slim-community.js")).href);
      slimHome = await import(pathToFileURL(path.join(root, "server/slim-home.js")).href);
    } catch {
      slimCommunity = null;
      slimHome = null;
    }
  }
  const fatHandler = await createApp({
    dataDir,
    publicDir: path.join(root, "public"),
    cardsPath: path.join(root, "data/cards.json"),
    advocacyPath: path.join(root, "data/advocacy.json"),
    sourcesPath: path.join(root, "data/sources.json"),
    sequencesPath: path.join(root, "data/editorial-sequences.json"),
    samplesPath: path.join(root, "data/editorial-samples.json"),
    demoPackPath: path.join(root, "data/demo-pack.json"),
    studioContentPath: path.join(root, "data/studio-content.json"),
    specialsPath: path.join(root, "data/specials-content.json"),
    presentationContentPath: path.join(root, "data/presentation-content.json"),
    eventsPath: path.join(root, "data/events.json"),
    achievementsPath: path.join(root, "data/achievements.json"),
    avatarsPath: path.join(root, "data/avatars.json"),
    assetsDir: path.join(repoRoot, "docs/design/assets"),
    docsDir: path.join(repoRoot, "docs"),
    debugEnabled: true,
    store,
    now: () => clock.value,
    numberedRandom: () => 0.99,
    rng: () => 0,
  });
  if (db && slimHome?.useSlimHomePool) slimHome.useSlimHomePool(pglitePool(db));
  if (db && slimCommunity?.useSlimCommunityPool) slimCommunity.useSlimCommunityPool(pglitePool(db));
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (db && slimHome && url.pathname === "/api/home") {
      await slimHome.handleSlimHome(request, response);
      return;
    }
    if (db && slimCommunity && url.pathname === "/api/community") {
      await slimCommunity.handleSlimCommunity(request, response);
      return;
    }
    request.url = `${url.pathname}${url.search}`;
    if (url.pathname.startsWith("/api/") && url.pathname !== "/api") {
      const inner = new URL(request.url, "http://localhost");
      inner.searchParams.set("__kalpi_path", url.pathname);
      request.url = `${inner.pathname}?${inner.searchParams}`;
    }
    await fatHandler(restoreRequestUrl(request), response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    store,
    db,
    base: `http://127.0.0.1:${server.address().port}`,
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
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function unlockMany(base, token, cardIds) {
  for (const cardId of cardIds) {
    const result = await api(base, "/api/debug/unlock-card", { token, method: "POST", body: { cardId } });
    assert.equal(result.status, 200, `unlock ${cardId}`);
  }
}

async function checkoutPre170() {
  try {
    await execFileAsync("git", ["cat-file", "-e", `${PRE170}^{commit}`], { cwd: projectRoot });
  } catch {
    return null;
  }
  const dest = "/tmp/klafi-pre170";
  try {
    await readFile(path.join(dest, "app/server/app.js"));
  } catch {
    await execFileAsync("git", ["worktree", "add", "--detach", dest, PRE170], { cwd: projectRoot });
  }
  try {
    await symlink(path.join(appRoot, "node_modules"), path.join(dest, "app", "node_modules"));
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  return dest;
}

test("parseCardIds normalises leftover strings, objects, and empty arrays", () => {
  assert.deepEqual(parseCardIds(["A", "B"]), ["A", "B"]);
  assert.deepEqual(parseCardIds('["A","B"]'), ["A", "B"]);
  assert.deepEqual(parseCardIds("[]", "X"), ["X"]);
  assert.deepEqual(parseCardIds([], "X"), ["X"]);
  assert.deepEqual(parseCardIds({ 0: "A", 1: "B" }), ["A", "B"]);
  assert.deepEqual(parseCardIds("A"), ["A"]);
  const leftover = normalizeStoredTrade({
    offeredMode: "or",
    wantedMode: "or",
    offeredCardIds: "[]",
    wantedCardIds: [],
    offeredCardId: "A",
    wantedCardId: "X",
  });
  assert.deepEqual(leftover.offeredCardIds, ["A"]);
  assert.deepEqual(leftover.wantedCardIds, ["X"]);
});

test("old-create a1fb4db / new-accept current: OR/3 ↔ 1 through api/ routing", async (t) => {
  const pre170 = await checkoutPre170();
  if (!pre170) {
    t.skip(`${PRE170} is not in this git clone`);
    return;
  }
  for (const wantedMode of ["and", "or"]) {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "klafi-oldnew-file-"));
    t.after(() => rm(dataDir, { recursive: true, force: true }));
    const clock = { value: Date.parse("2026-10-21T12:00:00.000Z") };
    const oldRunning = await startFrom(pre170, dataDir, clock, {});
    const cards = (await api(oldRunning.base, "/api/catalog")).body.cards.filter(({ eventOnly }) => !eventOnly);
    const offered = cards.slice(0, 3).map((card) => card.id);
    const wanted = [cards[3].id];
    const owner = (await api(oldRunning.base, "/api/session", { method: "POST" })).body.token;
    const accepter = (await api(oldRunning.base, "/api/session", { method: "POST" })).body.token;
    await api(oldRunning.base, "/api/profile", { token: owner, method: "POST", body: { displayName: "שר לענייני דלית" } });
    await unlockMany(oldRunning.base, owner, offered);
    await unlockMany(oldRunning.base, accepter, wanted);
    const created = await api(oldRunning.base, "/api/trades", {
      token: owner,
      method: "POST",
      body: { offered: { mode: "or", cardIds: offered }, wanted: { mode: wantedMode, cardIds: wanted } },
    });
    assert.equal(created.status, 201, `file ${wantedMode} old create`);
    const tradeId = created.body.trade?.tradeId || created.body.tradeId;
    const raw = JSON.parse(await readFile(path.join(dataDir, "state.json"), "utf8")).trades.find((row) => row.tradeId === tradeId);
    assert.ok(raw, `file ${wantedMode} stored row`);
    assert.equal(raw.offeredMode, "or");
    assert.equal(raw.wantedMode, wantedMode);
    assert.deepEqual(raw.offeredCardIds, offered);
    assert.deepEqual(raw.wantedCardIds, wanted);
    await oldRunning.close();

    clock.value += 60_000;
    const newStore = new JsonStore(path.join(dataDir, "state.json"), { now: () => clock.value, numberedRandom: () => 0.99 });
    const running = await startFrom(projectRoot, dataDir, clock, { store: newStore });
    t.after(() => running.close());
    const pick = offered[1];
    const accepted = await api(running.base, `/api/trades/${tradeId}/accept`, {
      token: accepter,
      method: "POST",
      body: { offeredCardId: pick },
    });
    assert.equal(accepted.status, 200, `file ${wantedMode} new accept ${JSON.stringify(accepted.body)}`);
    assert.deepEqual(accepted.body.receivedCardIds, [pick], `file ${wantedMode} received`);
    assert.deepEqual(accepted.body.givenCardIds, wanted, `file ${wantedMode} given`);
    const dialog = movedCardsFromAccept(accepted.body, { offeredCardId: pick }, created.body.trade);
    assert.deepEqual(dialog.receivedCardIds, [pick]);
    assert.deepEqual(dialog.givenCardIds, wanted);

    const db = await migratePglite(new PGlite(), appRoot);
    const pgStore = new PostgresStore("postgres://qa@127.0.0.1:1/none", {
      pool: pglitePool(db),
      now: () => clock.value,
      numberedRandom: () => 0.99,
    });
    const pgDir = await mkdtemp(path.join(os.tmpdir(), "klafi-oldnew-pg-"));
    const pgRunning = await startFrom(projectRoot, pgDir, clock, { store: pgStore, db });
    t.after(async () => {
      await pgRunning.close();
      await db.close();
      await rm(pgDir, { recursive: true, force: true });
      useSlimHomePool(null);
      useSlimCommunityPool(null);
    });
    const pgOwner = (await api(pgRunning.base, "/api/session", { method: "POST" })).body.token;
    const pgAccepter = (await api(pgRunning.base, "/api/session", { method: "POST" })).body.token;
    await unlockMany(pgRunning.base, pgOwner, offered);
    await unlockMany(pgRunning.base, pgAccepter, wanted);
    const { PostgresStore: OldPg } = await import(pathToFileURL(path.join(pre170, "app/server/postgres-store.js")).href);
    const oldPg = new OldPg("postgres://qa@127.0.0.1:1/none", {
      now: () => clock.value,
      numberedRandom: () => 0.99,
    });
    oldPg.pool = pglitePool(db);
    const oldCreated = await oldPg.createTrade({
      sessionToken: pgOwner,
      offered: { mode: "or", cardIds: offered },
      wanted: { mode: wantedMode, cardIds: wanted },
      createdAt: new Date(clock.value).toISOString(),
      expiresAt: new Date(clock.value + 86_400_000).toISOString(),
    });
    assert.ok(oldCreated?.tradeId, `pglite ${wantedMode} old createTrade`);
    const pgAccepted = await api(pgRunning.base, `/api/trades/${oldCreated.tradeId}/accept`, {
      token: pgAccepter,
      method: "POST",
      body: { offeredCardId: pick },
    });
    assert.equal(pgAccepted.status, 200, `pglite ${wantedMode} ${JSON.stringify(pgAccepted.body)}`);
    assert.deepEqual(pgAccepted.body.receivedCardIds, [pick]);
    assert.deepEqual(pgAccepted.body.givenCardIds, wanted);
  }
});

test("leftover old-shape rows (empty arrays / JSON strings) accept with moved ids", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "klafi-oldshape-"));
  const clock = { value: Date.parse("2026-10-21T12:00:00.000Z") };
  const store = new JsonStore(path.join(dataDir, "state.json"), { now: () => clock.value, numberedRandom: () => 0.99 });
  const running = await startFrom(projectRoot, dataDir, clock, { store });
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const cards = (await api(running.base, "/api/catalog")).body.cards.filter(({ eventOnly }) => !eventOnly);
  const offered = cards.slice(0, 3).map((card) => card.id);
  const wanted = [cards[3].id];
  const shapes = [
    { name: "empty arrays + legacy singles", mutate: (row) => { row.offeredCardIds = []; row.wantedCardIds = []; } },
    { name: "JSON-string arrays", mutate: (row) => { row.offeredCardIds = JSON.stringify(row.offeredCardIds); row.wantedCardIds = JSON.stringify(row.wantedCardIds); } },
    { name: "JSON empty string arrays", mutate: (row) => { row.offeredCardIds = "[]"; row.wantedCardIds = "[]"; } },
  ];
  for (const shape of shapes) {
    const owner = (await api(running.base, "/api/session", { method: "POST" })).body.token;
    const accepter = (await api(running.base, "/api/session", { method: "POST" })).body.token;
    await unlockMany(running.base, owner, offered);
    await unlockMany(running.base, accepter, wanted);
    const created = await api(running.base, "/api/trades", {
      token: owner,
      method: "POST",
      body: { offered: { mode: "or", cardIds: offered }, wanted: { mode: "and", cardIds: wanted } },
    });
    assert.equal(created.status, 201, shape.name);
    const row = store.state.trades.find((trade) => trade.tradeId === created.body.trade.tradeId);
    shape.mutate(row);
    clock.value += 60_000;
    const pick = shape.name === "JSON-string arrays" ? offered[1] : offered[0];
    const accepted = await api(running.base, `/api/trades/${created.body.trade.tradeId}/accept`, {
      token: accepter,
      method: "POST",
      body: { offeredCardId: pick },
    });
    assert.equal(accepted.status, 200, `${shape.name} accept ${JSON.stringify(accepted.body)}`);
    assert.ok(accepted.body.receivedCardIds?.length, `${shape.name} received`);
    assert.ok(accepted.body.givenCardIds?.length, `${shape.name} given`);
    assert.deepEqual(accepted.body.givenCardIds, wanted);
    if (shape.name === "JSON-string arrays") {
      assert.deepEqual(accepted.body.receivedCardIds, [offered[1]]);
    } else {
      assert.deepEqual(accepted.body.receivedCardIds, [offered[0]], `${shape.name} collapses to the leftover single`);
    }
  }
});
