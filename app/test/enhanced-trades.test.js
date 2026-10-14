import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { createKalpiApp } from "../server/app.js";
import { PostgresStore } from "../server/postgres-store.js";
import { assertInventoryConserved, parseCreateTradeInput, validateTradeShape } from "../server/trade-core.js";
import { holdsWantedSide, offersForTradeList } from "../public/trade-list.js";
import { tradeFormationSummary, tradeModeHintHe } from "../public/trade-compose-ui.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const projectRoot = path.resolve(appRoot, "..");
const migrationsDir = path.join(appRoot, "server/migrations");

async function start(dataDir, clock, { databaseUrl = null } = {}) {
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
    databaseUrl,
    now: () => clock.value,
    numberedRandom: () => 0.99,
    rng: () => 0,
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    server,
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

async function unlockMany(base, token, cardIds) {
  for (const cardId of cardIds) {
    await api(base, "/api/debug/unlock-card", { token, method: "POST", body: { cardId } });
  }
}

function inventorySnapshot(states) {
  const sessions = {};
  for (const [name, state] of Object.entries(states)) sessions[name] = { inventory: state.inventory || {} };
  return sessions;
}

async function postgresStoreWithMigrations() {
  const db = new PGlite();
  for (const file of (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(await readFile(path.join(migrationsDir, file), "utf8"));
  }
  const store = Object.create(PostgresStore.prototype);
  store.pool = {
    query: (sql, params) => db.query(sql, params),
    connect: async () => ({
      query: (sql, params) => db.query(sql, params),
      release: () => {},
    }),
  };
  store.executor = () => store.pool;
  store.now = () => Date.parse("2026-10-10T12:00:00.000Z");
  store.exclusive = async (fn) => fn();
  store.loadSession = async (token, { forUpdate = false } = {}) => store.hydrateSession(token, { forUpdate });
  store.hydrateSession = async (token) => {
    const row = (await db.query("SELECT * FROM kalpi_sessions WHERE token = $1", [token])).rows[0];
    if (!row) return null;
    const inv = (await db.query("SELECT card_id, copies FROM kalpi_inventory WHERE session_token = $1", [token])).rows;
    const inventory = Object.fromEntries(inv.map(({ card_id, copies }) => [card_id, copies]));
    return {
      token,
      displayName: row.display_name,
      inventory,
      instances: [],
      tradeCount: row.trade_count || 0,
      hiddenTradeIds: [],
    };
  };
  store.saveSession = async (token, session) => {
    for (const [cardId, copies] of Object.entries(session.inventory || {})) {
      await db.query(
        `INSERT INTO kalpi_inventory (session_token, card_id, copies) VALUES ($1,$2,$3)
         ON CONFLICT (session_token, card_id) DO UPDATE SET copies = EXCLUDED.copies`,
        [token, cardId, copies],
      );
    }
  };
  store.insertSessionRow = async (client, token, session) => {
    await db.query(
      "INSERT INTO kalpi_sessions (token, display_name, created_at, extras) VALUES ($1,$2,$3,'{}'::jsonb) ON CONFLICT DO NOTHING",
      [token, session.displayName || token, session.createdAt || new Date().toISOString()],
    );
    for (const [cardId, copies] of Object.entries(session.inventory || {})) {
      await db.query(
        "INSERT INTO kalpi_inventory (session_token, card_id, copies) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
        [token, cardId, copies],
      );
    }
  };
  return { db, store };
}

test("trade-core validates side limits and overlap", () => {
  assert.equal(validateTradeShape(parseCreateTradeInput({
    offered: { mode: "and", cardIds: ["a", "b", "c", "d"] },
    wanted: { mode: "and", cardIds: ["x"] },
  })).code, "TOO_MANY");
  assert.equal(validateTradeShape(parseCreateTradeInput({
    offered: { mode: "and", cardIds: ["a"] },
    wanted: { mode: "and", cardIds: ["a"] },
  })).code, "CROSS_SIDE");
});

test("trade list filter: AND wanted needs every card, OR wanted needs one", () => {
  const andTrade = { status: "open", ownedByCurrent: false, wantedMode: "and", wantedCardIds: ["a", "b"] };
  const orTrade = { status: "open", ownedByCurrent: false, wantedMode: "or", wantedCardIds: ["a", "b"] };
  assert.equal(holdsWantedSide({ a: 1 }, andTrade), false);
  assert.equal(holdsWantedSide({ a: 1, b: 1 }, andTrade), true);
  assert.equal(holdsWantedSide({ b: 1 }, orTrade), true);
  const hidden = offersForTradeList([andTrade], { a: 0 });
  assert.equal(hidden.length, 0);
  assert.equal(offersForTradeList([andTrade], { a: 0 }, { showUnholdable: true }).length, 1);
});

test("file store: 1-for-1 regression and inventory conservation", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "klafi-enhanced-file-"));
  const clock = { value: Date.parse("2026-10-10T12:00:00.000Z") };
  const running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const cards = (await api(running.base, "/api/catalog")).body.cards.filter(({ eventOnly }) => !eventOnly);
  const [a, b] = cards.slice(0, 2);
  const owner = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const accepter = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  await unlockMany(running.base, owner, [a.id]);
  await unlockMany(running.base, accepter, [b.id]);
  const before = inventorySnapshot({
    owner: (await api(running.base, "/api/state", { token: owner })).body,
    accepter: (await api(running.base, "/api/state", { token: accepter })).body,
  });
  const created = await api(running.base, "/api/trades", {
    token: owner,
    method: "POST",
    body: { offeredCardId: a.id, wantedCardId: b.id },
  });
  assert.equal(created.status, 201);
  const accepted = await api(running.base, `/api/trades/${created.body.trade.tradeId}/accept`, { token: accepter, method: "POST" });
  assert.equal(accepted.status, 200);
  const after = inventorySnapshot({
    owner: (await api(running.base, "/api/state", { token: owner })).body,
    accepter: (await api(running.base, "/api/state", { token: accepter })).body,
  });
  assertInventoryConserved(before, after);
  assert.equal(after.accepter.inventory[a.id], 1);
  assert.equal(after.owner.inventory[b.id], 1);
});

test("file store: bundle 2↔2 and OR choice accept", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "klafi-enhanced-bundle-"));
  const clock = { value: Date.parse("2026-10-10T12:00:00.000Z") };
  const running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const cards = (await api(running.base, "/api/catalog")).body.cards.filter(({ eventOnly }) => !eventOnly).slice(0, 6);
  const owner = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const accepter = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const give = cards.slice(0, 2).map(({ id }) => id);
  const take = cards.slice(2, 4).map(({ id }) => id);
  await unlockMany(running.base, owner, give);
  await unlockMany(running.base, accepter, take);
  const bundle = await api(running.base, "/api/trades", {
    token: owner,
    method: "POST",
    body: { offered: { mode: "and", cardIds: give }, wanted: { mode: "and", cardIds: take } },
  });
  assert.equal(bundle.status, 201);
  assert.deepEqual(bundle.body.trade.offeredCardIds, give);
  const before = inventorySnapshot({
    owner: (await api(running.base, "/api/state", { token: owner })).body,
    accepter: (await api(running.base, "/api/state", { token: accepter })).body,
  });
  const ok = await api(running.base, `/api/trades/${bundle.body.trade.tradeId}/accept`, { token: accepter, method: "POST" });
  assert.equal(ok.status, 200);
  assertInventoryConserved(before, inventorySnapshot({
    owner: (await api(running.base, "/api/state", { token: owner })).body,
    accepter: (await api(running.base, "/api/state", { token: accepter })).body,
  }));

  const orGive = cards.slice(4, 6).map(({ id }) => id);
  const orTake = cards.slice(0, 2).map(({ id }) => id);
  await unlockMany(running.base, owner, orGive);
  await unlockMany(running.base, accepter, orTake);
  const owner2 = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  await unlockMany(running.base, owner2, orGive);
  const orOffer = await api(running.base, "/api/trades", {
    token: owner2,
    method: "POST",
    body: {
      offered: { mode: "or", cardIds: orGive },
      wanted: { mode: "or", cardIds: orTake },
    },
  });
  assert.equal(orOffer.status, 201);
  const badChoice = await api(running.base, `/api/trades/${orOffer.body.trade.tradeId}/accept`, {
    token: accepter,
    method: "POST",
    body: { offeredCardId: orGive[0], wantedCardId: cards[5].id },
  });
  assert.equal(badChoice.status, 409);
  const good = await api(running.base, `/api/trades/${orOffer.body.trade.tradeId}/accept`, {
    token: accepter,
    method: "POST",
    body: { offeredCardId: orGive[1], wantedCardId: orTake[0] },
  });
  assert.equal(good.status, 200);
});

test("file store: double accept race and recycle vs open offer", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "klafi-enhanced-race-"));
  const clock = { value: Date.parse("2026-10-10T12:00:00.000Z") };
  const running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const cards = (await api(running.base, "/api/catalog")).body.cards.filter(({ eventOnly }) => !eventOnly).slice(0, 3);
  const owner = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const a = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const b = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  await unlockMany(running.base, owner, [cards[0].id, cards[0].id]);
  await unlockMany(running.base, a, [cards[1].id]);
  await unlockMany(running.base, b, [cards[1].id]);
  const created = await api(running.base, "/api/trades", {
    token: owner,
    method: "POST",
    body: { offeredCardId: cards[0].id, wantedCardId: cards[1].id },
  });
  const results = await Promise.all([a, b].map((token) =>
    api(running.base, `/api/trades/${created.body.trade.tradeId}/accept`, { token, method: "POST" })));
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409]);
});

test("postgres SQL store: migration 012 columns round-trip on createTrade", async (t) => {
  const { db, store } = await postgresStoreWithMigrations();
  t.after(async () => db.close());
  const at = "2026-10-10T12:00:00.000Z";
  const owner = "owner-pg";
  await store.insertSessionRow(store.pool, owner, { displayName: owner, createdAt: at, inventory: { A: 2, B: 1, C: 1 } });
  const created = await store.createTrade({
    sessionToken: owner,
    offered: { mode: "or", cardIds: ["A", "B"] },
    wanted: { mode: "and", cardIds: ["C"] },
    createdAt: at,
    expiresAt: new Date(Date.parse(at) + 86400000).toISOString(),
  });
  assert.ok(created.tradeId);
  assert.deepEqual(created.offeredCardIds, ["A", "B"]);
  assert.equal(created.offeredMode, "or");
  const row = (await db.query("SELECT * FROM kalpi_trades WHERE trade_id = $1", [created.tradeId])).rows[0];
  assert.deepEqual(row.offered_card_ids, ["A", "B"]);
  assert.equal(row.wanted_mode, "and");
  const listed = store.tradeFromRow(row);
  assert.deepEqual(listed.wantedCardIds, ["C"]);
});

test("legacy single-card trade rows still list and accept after normalization", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "klafi-legacy-trade-"));
  const clock = { value: Date.parse("2026-10-10T12:00:00.000Z") };
  const running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const [a, b] = (await api(running.base, "/api/catalog")).body.cards.filter(({ eventOnly }) => !eventOnly).slice(0, 2);
  const owner = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const accepter = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  await unlockMany(running.base, owner, [a.id]);
  await unlockMany(running.base, accepter, [b.id]);
  const created = await api(running.base, "/api/trades", { token: owner, method: "POST", body: { offeredCardId: a.id, wantedCardId: b.id } });
  const listed = await api(running.base, "/api/trades", { token: accepter });
  const row = listed.body.trades.find(({ tradeId }) => tradeId === created.body.trade.tradeId);
  assert.deepEqual(row.offeredCardIds, [a.id]);
  assert.equal(row.offeredMode, "and");
  const accepted = await api(running.base, `/api/trades/${row.tradeId}/accept`, { token: accepter, method: "POST" });
  assert.equal(accepted.status, 200);
});

test("compose mode hints explain AND vs OR in Hebrew", () => {
  assert.match(tradeModeHintHe("and"), /כל הקלפים/);
  assert.match(tradeModeHintHe("or"), /קלף אחד/);
});

test("formation summary labels poster AND/OR on open trades", () => {
  assert.match(tradeFormationSummary({ offeredMode: "and", wantedMode: "or" }), /כולם \(וגם\).*אחד \(או\)/);
});
