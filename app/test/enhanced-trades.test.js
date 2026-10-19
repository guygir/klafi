import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { createKalpiApp } from "../server/app.js";
import { PostgresStore } from "../server/postgres-store.js";
import { TRADE_MESSAGES_HE, assertInventoryConserved, parseCreateTradeInput, validateTradeShape } from "../server/trade-core.js";
import { QA_TRADE_SAMPLES, partyLeaderSampleIds, qaTradeSamplesAllowed, viewerGrantPlan } from "../server/trade-debug-samples.js";
import { holdsWantedSide, offersForTradeList } from "../public/trade-list.js";
import {
  keepValidTradeComposeWanted,
  orderTradeComposeSlotCards,
  sortTradeComposeOffered,
  sortTradeComposeWanted,
  tradeComposeCardsInSet,
  tradeComposeCountTag,
  tradeComposeWantPool,
  tradeModeHintHe,
  tradeOrChipTapOpensDialog,
} from "../public/trade-compose-ui.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const projectRoot = path.resolve(appRoot, "..");
const migrationsDir = path.join(appRoot, "server/migrations");

async function start(dataDir, clock, { databaseUrl = null, holderWarm = false } = {}) {
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
    holderWarm,
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
    const extras = row.extras && typeof row.extras === "object" ? row.extras : {};
    return {
      token,
      displayName: row.display_name,
      inventory,
      instances: extras.instances || [],
      numberedByCard: extras.numberedByCard || {},
      tradeCount: row.trade_count || 0,
      hiddenTradeIds: [],
      pendingTradeNotices: [],
    };
  };
  store.saveSession = async (token, session) => {
    const keep = Object.entries(session.inventory || {}).filter(([, copies]) => Number(copies) > 0);
    for (const [cardId, copies] of keep) {
      await db.query(
        `INSERT INTO kalpi_inventory (session_token, card_id, copies) VALUES ($1,$2,$3)
         ON CONFLICT (session_token, card_id) DO UPDATE SET copies = EXCLUDED.copies`,
        [token, cardId, copies],
      );
    }
    const keepIds = keep.map(([cardId]) => cardId);
    if (keepIds.length) {
      await db.query(
        "DELETE FROM kalpi_inventory WHERE session_token = $1 AND NOT (card_id = ANY($2::text[]))",
        [token, keepIds],
      );
    } else {
      await db.query("DELETE FROM kalpi_inventory WHERE session_token = $1", [token]);
    }
    await db.query(
      "UPDATE kalpi_sessions SET trade_count = $2, extras = $3::jsonb WHERE token = $1",
      [token, session.tradeCount || 0, JSON.stringify({ pendingTradeNotices: session.pendingTradeNotices || [] })],
    );
  };
  store.insertSessionRow = async (client, token, session) => {
    await db.query(
      "INSERT INTO kalpi_sessions (token, display_name, created_at, extras) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING",
      [
        token,
        session.displayName || token,
        session.createdAt || new Date().toISOString(),
        JSON.stringify({
          numberedByCard: session.numberedByCard || {},
          instances: session.instances || [],
        }),
      ],
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
  const beforeOr = inventorySnapshot({
    owner: (await api(running.base, "/api/state", { token: owner2 })).body,
    accepter: (await api(running.base, "/api/state", { token: accepter })).body,
  });
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
  assertInventoryConserved(beforeOr, inventorySnapshot({
    owner: (await api(running.base, "/api/state", { token: owner2 })).body,
    accepter: (await api(running.base, "/api/state", { token: accepter })).body,
  }));
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
  const beforeRace = inventorySnapshot({
    owner: (await api(running.base, "/api/state", { token: owner })).body,
    a: (await api(running.base, "/api/state", { token: a })).body,
    b: (await api(running.base, "/api/state", { token: b })).body,
  });
  const results = await Promise.all([a, b].map((token) =>
    api(running.base, `/api/trades/${created.body.trade.tradeId}/accept`, { token, method: "POST" })));
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409]);
  const loser = results.find(({ status }) => status === 409);
  assert.equal(loser.body.error, "ACCEPT_FAILED");
  assert.equal(loser.body.messageHe, TRADE_MESSAGES_HE.ACCEPT_FAILED);
  const afterRace = inventorySnapshot({
    owner: (await api(running.base, "/api/state", { token: owner })).body,
    a: (await api(running.base, "/api/state", { token: a })).body,
    b: (await api(running.base, "/api/state", { token: b })).body,
  });
  assertInventoryConserved(beforeRace, afterRace);
  const winnerInv = afterRace.a.inventory[cards[0].id] === 1 ? afterRace.a : afterRace.b;
  const loserInv = winnerInv === afterRace.a ? afterRace.b : afterRace.a;
  assert.equal(winnerInv.inventory[cards[0].id], 1);
  assert.equal(loserInv.inventory[cards[1].id], 1);
  assert.equal(loserInv.inventory[cards[0].id] || 0, 0);
});

test("recycle cannot spend a copy reserved by an open offer (3 copies)", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "klafi-enhanced-recycle-"));
  const clock = { value: Date.parse("2026-10-10T12:00:00.000Z") };
  let running = await start(dataDir, clock);
  const cards = (await api(running.base, "/api/catalog")).body.cards
    .filter(({ eventOnly, rarity }) => !eventOnly && String(rarity || "").startsWith("Common"))
    .slice(0, 2);
  const recycler = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const partner = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  await unlockMany(running.base, recycler, [cards[0].id]);
  await unlockMany(running.base, partner, [cards[1].id]);
  await running.close();
  const stored = JSON.parse(await readFile(path.join(dataDir, "state.json"), "utf8"));
  const session = stored.sessions[recycler];
  session.inventory[cards[0].id] = 3;
  session.instances = [
    ...(session.instances || []).filter((item) => item.cardId !== cards[0].id),
    ...[0, 1, 2].map((index) => ({
      instanceId: `recycle-plain-${index}`,
      cardId: cards[0].id,
      finish: "Common",
      pulledAt: "2026-10-10T12:00:00.000Z",
    })),
  ];
  await writeFile(path.join(dataDir, "state.json"), JSON.stringify(stored));
  running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const reserved = await api(running.base, "/api/trades", {
    token: recycler,
    method: "POST",
    body: { offeredCardId: cards[0].id, wantedCardId: cards[1].id },
  });
  assert.equal(reserved.status, 201);
  const beforeRecycle = inventorySnapshot({
    recycler: (await api(running.base, "/api/state", { token: recycler })).body,
    partner: (await api(running.base, "/api/state", { token: partner })).body,
  });
  assert.equal(beforeRecycle.recycler.inventory[cards[0].id], 3);
  const recycled = await api(running.base, "/api/recycle", {
    token: recycler,
    method: "POST",
    body: { cardId: cards[0].id },
  });
  assert.equal(recycled.status, 409);
  assert.equal(recycled.body.error, "NOT_ENOUGH_COPIES");
  const acceptedReserved = await api(running.base, `/api/trades/${reserved.body.trade.tradeId}/accept`, {
    token: partner,
    method: "POST",
  });
  assert.equal(acceptedReserved.status, 200);
  const afterRecycle = inventorySnapshot({
    recycler: (await api(running.base, "/api/state", { token: recycler })).body,
    partner: (await api(running.base, "/api/state", { token: partner })).body,
  });
  assertInventoryConserved(beforeRecycle, afterRecycle);
  assert.equal(afterRecycle.recycler.inventory[cards[0].id], 2);
  assert.equal(afterRecycle.partner.inventory[cards[0].id], 1);
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

test("give-side dropdown orders owned cards by copy count, including within a set", () => {
  const cards = [
    { id: "a", releaseSetId: "set-1", titleHe: "אלף" },
    { id: "b", releaseSetId: "set-1", titleHe: "בית" },
    { id: "c", releaseSetId: "set-1", titleHe: "גימל" },
    { id: "d", releaseSetId: "set-2", titleHe: "דלת" },
  ];
  const owned = { a: 1, b: 5, c: 3, d: 9 };
  const inSet = tradeComposeCardsInSet(cards, "release:set-1");
  assert.deepEqual(inSet.map((card) => card.id).sort(), ["a", "b", "c"]);
  const ordered = sortTradeComposeOffered(inSet, (card) => owned[card.id], (card) => card.titleHe);
  assert.deepEqual(ordered.map((card) => card.id), ["b", "c", "a"]);
  const viaSlot = orderTradeComposeSlotCards(inSet, "offered", {
    ownedCount: (card) => owned[card.id],
    holderCount: () => 0,
    title: (card) => card.titleHe,
  });
  assert.deepEqual(viaSlot.map((card) => card.id), ["b", "c", "a"]);
});

test("compose option counts use the same Nx tag on give and want, including 0x", () => {
  assert.equal(tradeComposeCountTag(1), "1x");
  assert.equal(tradeComposeCountTag(15), "15x");
  assert.equal(tradeComposeCountTag(0), "0x");
  assert.equal(tradeComposeCountTag(null), "0x");
});

test("want-side dropdown orders by holder count, including within a set", () => {
  const cards = [
    { id: "a", releaseSetId: "set-1", titleHe: "אלף" },
    { id: "b", releaseSetId: "set-1", titleHe: "בית" },
    { id: "c", releaseSetId: "set-1", titleHe: "גימל" },
    { id: "d", releaseSetId: "set-2", titleHe: "דלת" },
  ];
  const holders = { a: 12, b: 2, c: 8, d: 99 };
  const inSet = tradeComposeCardsInSet(cards, "release:set-1");
  const ordered = sortTradeComposeWanted(inSet, (card) => holders[card.id], (card) => card.titleHe);
  assert.deepEqual(ordered.map((card) => card.id), ["a", "c", "b"]);
  const viaSlot = orderTradeComposeSlotCards(inSet, "wanted", {
    ownedCount: () => 0,
    holderCount: (card) => holders[card.id],
    title: (card) => card.titleHe,
  });
  assert.deepEqual(viaSlot.map((card) => card.id), ["a", "c", "b"]);
});

test("compose dropdown sorts tie-break on Hebrew title", () => {
  const cards = [
    { id: "late", releaseSetId: "set-1", titleHe: "תמר" },
    { id: "early", releaseSetId: "set-1", titleHe: "אביב" },
  ];
  const offered = sortTradeComposeOffered(cards, () => 2, (card) => card.titleHe);
  const wanted = sortTradeComposeWanted(cards, () => 4, (card) => card.titleHe);
  assert.deepEqual(offered.map((card) => card.id), ["early", "late"]);
  assert.deepEqual(wanted.map((card) => card.id), ["early", "late"]);
});

test("want pool is missing-only by default and includes owned cards when unchecked", () => {
  const cards = [
    { id: "owned", releaseSetId: "set-1", titleHe: "שלי" },
    { id: "missing", releaseSetId: "set-1", titleHe: "חסר" },
    { id: "other", releaseSetId: "set-2", titleHe: "אחר" },
  ];
  const ownedCount = (card) => (card.id === "owned" ? 2 : 0);
  const missing = tradeComposeWantPool(cards, { missingOnly: true, ownedCount });
  assert.deepEqual(missing.map((card) => card.id), ["missing", "other"]);
  const all = tradeComposeWantPool(cards, { missingOnly: false, ownedCount });
  assert.deepEqual(all.map((card) => card.id), ["owned", "missing", "other"]);
  const holders = { owned: 1, missing: 9, other: 4 };
  const ranked = sortTradeComposeWanted(all, (card) => holders[card.id], (card) => card.titleHe);
  assert.deepEqual(ranked.map((card) => card.id), ["missing", "other", "owned"]);
});

test("unticking missing-only keeps valid want picks and clears owned cards that left the pool", () => {
  const poolAll = [
    { id: "owned", releaseSetId: "set-1" },
    { id: "missing", releaseSetId: "set-1" },
  ];
  const poolMissing = poolAll.filter((card) => card.id === "missing");
  const setKeyOf = (card) => `release:${card.releaseSetId}`;
  const kept = keepValidTradeComposeWanted(
    { mode: "and", cardIds: ["owned"], slotSets: ["release:set-1"] },
    poolAll,
    setKeyOf,
  );
  assert.deepEqual(kept.cardIds, ["owned"]);
  assert.deepEqual(kept.slotSets, ["release:set-1"]);
  const pruned = keepValidTradeComposeWanted(kept, poolMissing, setKeyOf);
  assert.deepEqual(pruned.cardIds, [""]);
  assert.deepEqual(pruned.slotSets, ["release:set-1"]);
});

test("OR first tap highlights only; second tap on the same card opens the viewer", () => {
  assert.equal(tradeOrChipTapOpensDialog(false), false);
  assert.equal(tradeOrChipTapOpensDialog(""), false);
  assert.equal(tradeOrChipTapOpensDialog("card-1"), true);
});

test("file store: creator may want a card they already own; accepter still gives it", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "klafi-want-owned-"));
  const clock = { value: Date.parse("2026-10-10T12:00:00.000Z") };
  const running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const cards = (await api(running.base, "/api/catalog")).body.cards.filter(({ eventOnly }) => !eventOnly).slice(0, 3);
  const [give, want, other] = cards;
  const owner = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const accepter = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  await unlockMany(running.base, owner, [give.id, want.id]);
  await unlockMany(running.base, accepter, [want.id]);
  const sameCard = await api(running.base, "/api/trades", {
    token: owner,
    method: "POST",
    body: { offeredCardId: give.id, wantedCardId: give.id },
  });
  assert.equal(sameCard.status, 400);
  assert.equal(sameCard.body.error, "CROSS_SIDE");
  const created = await api(running.base, "/api/trades", {
    token: owner,
    method: "POST",
    body: { offeredCardId: give.id, wantedCardId: want.id },
  });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.trade.wantedCardIds, [want.id]);
  const before = inventorySnapshot({
    owner: (await api(running.base, "/api/state", { token: owner })).body,
    accepter: (await api(running.base, "/api/state", { token: accepter })).body,
  });
  assert.equal(before.owner.inventory[want.id], 1);
  const accepted = await api(running.base, `/api/trades/${created.body.trade.tradeId}/accept`, {
    token: accepter,
    method: "POST",
  });
  assert.equal(accepted.status, 200);
  const after = inventorySnapshot({
    owner: (await api(running.base, "/api/state", { token: owner })).body,
    accepter: (await api(running.base, "/api/state", { token: accepter })).body,
  });
  assertInventoryConserved(before, after);
  assert.equal(after.owner.inventory[give.id], undefined);
  assert.equal(after.owner.inventory[want.id], 2);
  assert.equal(after.accepter.inventory[give.id], 1);
  assert.equal(after.accepter.inventory[want.id], undefined);
  assert.equal(after.owner.inventory[other.id], undefined);
});

test("accept failures return Hebrew messageHe from the store through the API", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "klafi-enhanced-msg-"));
  const clock = { value: Date.parse("2026-10-10T12:00:00.000Z") };
  const running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const cards = (await api(running.base, "/api/catalog")).body.cards.filter(({ eventOnly }) => !eventOnly).slice(0, 4);
  const owner = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const accepter = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const stranger = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  await unlockMany(running.base, owner, [cards[0].id, cards[1].id]);
  await unlockMany(running.base, accepter, [cards[2].id]);
  const created = await api(running.base, "/api/trades", {
    token: owner,
    method: "POST",
    body: {
      offered: { mode: "or", cardIds: [cards[0].id, cards[1].id] },
      wanted: { mode: "or", cardIds: [cards[2].id, cards[3].id] },
    },
  });
  assert.equal(created.status, 201);
  const needsChoice = await api(running.base, `/api/trades/${created.body.trade.tradeId}/accept`, {
    token: accepter,
    method: "POST",
    body: {},
  });
  assert.equal(needsChoice.status, 409);
  assert.equal(needsChoice.body.code || needsChoice.body.error, "NEEDS_CHOICE");
  assert.equal(needsChoice.body.messageHe, TRADE_MESSAGES_HE.NEEDS_CHOICE);
  const badChoice = await api(running.base, `/api/trades/${created.body.trade.tradeId}/accept`, {
    token: accepter,
    method: "POST",
    body: { offeredCardId: cards[0].id, wantedCardId: cards[0].id },
  });
  assert.equal(badChoice.status, 409);
  assert.equal(badChoice.body.messageHe, TRADE_MESSAGES_HE.INVALID_CHOICE);
  const missingWanted = await api(running.base, `/api/trades/${created.body.trade.tradeId}/accept`, {
    token: stranger,
    method: "POST",
    body: { offeredCardId: cards[0].id, wantedCardId: cards[2].id },
  });
  assert.equal(missingWanted.status, 409);
  assert.equal(missingWanted.body.messageHe, TRADE_MESSAGES_HE.ACCEPT_ACCEPTER_MISSING);
  const notOwned = await api(running.base, "/api/trades", {
    token: stranger,
    method: "POST",
    body: { offeredCardId: cards[0].id, wantedCardId: cards[2].id },
  });
  assert.equal(notOwned.status, 400);
  assert.equal(notOwned.body.error, "NOT_OWNED");
  assert.equal(notOwned.body.messageHe, TRADE_MESSAGES_HE.NOT_OWNED);
});

test("multi-card accept updates achievements, binder unique counts, and conserves inventory", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "klafi-enhanced-ach-"));
  const clock = { value: Date.parse("2026-10-10T12:00:00.000Z") };
  const running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const cards = (await api(running.base, "/api/catalog")).body.cards
    .filter(({ eventOnly, idleEligible }) => !eventOnly && idleEligible)
    .slice(0, 5);
  const owner = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const accepter = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  await unlockMany(running.base, owner, [cards[0].id, cards[1].id]);
  await unlockMany(running.base, accepter, [cards[2].id, cards[3].id, cards[4].id]);
  const before = {
    owner: (await api(running.base, "/api/state", { token: owner })).body,
    accepter: (await api(running.base, "/api/state", { token: accepter })).body,
  };
  assert.equal(before.owner.ownedUnique, 2);
  assert.equal(before.accepter.ownedUnique, 3);
  assert.equal(before.owner.tradeCount, 0);
  const created = await api(running.base, "/api/trades", {
    token: owner,
    method: "POST",
    body: {
      offered: { mode: "and", cardIds: [cards[0].id, cards[1].id] },
      wanted: { mode: "and", cardIds: [cards[2].id, cards[3].id] },
    },
  });
  assert.equal(created.status, 201);
  const accepted = await api(running.base, `/api/trades/${created.body.trade.tradeId}/accept`, {
    token: accepter,
    method: "POST",
  });
  assert.equal(accepted.status, 200);
  const after = {
    owner: (await api(running.base, "/api/state", { token: owner })).body,
    accepter: (await api(running.base, "/api/state", { token: accepter })).body,
  };
  assertInventoryConserved(inventorySnapshot(before), inventorySnapshot(after));
  assert.equal(after.owner.ownedUnique, 2);
  assert.equal(after.accepter.ownedUnique, 3);
  assert.equal(after.owner.inventory[cards[2].id], 1);
  assert.equal(after.owner.inventory[cards[3].id], 1);
  assert.equal(after.accepter.inventory[cards[0].id], 1);
  assert.equal(after.accepter.inventory[cards[4].id], 1);
  assert.equal(after.owner.tradeCount, 1);
  assert.equal(after.accepter.tradeCount, 1);
  const ownerMatch = after.owner.achievements.find(({ id }) => id === "trade-match");
  const accepterMatch = after.accepter.achievements.find(({ id }) => id === "trade-match");
  assert.equal(ownerMatch?.earned, true);
  assert.equal(accepterMatch?.earned, true);
});

test("QA trade samples stay off in production even if the env flag is set", () => {
  assert.equal(qaTradeSamplesAllowed({ debugRequest: true, env: { KLAFI_QA_TRADE_SAMPLES: "1", NODE_ENV: "production" } }), false);
  assert.equal(qaTradeSamplesAllowed({ debugRequest: true, env: { KLAFI_QA_TRADE_SAMPLES: "1", VERCEL_ENV: "production" } }), false);
  assert.equal(qaTradeSamplesAllowed({ debugRequest: true, env: { KLAFI_QA_TRADE_SAMPLES: "1", NODE_ENV: "production", VERCEL_ENV: "production" } }), false);
  assert.equal(qaTradeSamplesAllowed({ debugRequest: false, env: { KLAFI_QA_TRADE_SAMPLES: "1", NODE_ENV: "test" } }), false);
  assert.equal(qaTradeSamplesAllowed({ debugRequest: true, env: { NODE_ENV: "test" } }), false);
  assert.equal(qaTradeSamplesAllowed({ debugRequest: true, env: { KLAFI_QA_TRADE_SAMPLES: "1", NODE_ENV: "test" } }), true);
  assert.equal(qaTradeSamplesAllowed({ debugRequest: true, env: { KLAFI_QA_TRADE_SAMPLES: "1" } }), true);
});

test("QA trade sample set is exactly four 2↔3 AND/OR offers", () => {
  assert.equal(QA_TRADE_SAMPLES.length, 4);
  const keys = QA_TRADE_SAMPLES.map((sample) => (
    `${sample.offered.cardIdx.length}-${sample.wanted.cardIdx.length}-${sample.offered.mode}-${sample.wanted.mode}`
  )).sort();
  assert.deepEqual(keys, ["2-3-and-and", "2-3-and-or", "2-3-or-and", "2-3-or-or"]);
  assert.equal(QA_TRADE_SAMPLES.some((sample) => sample.id.startsWith("fail-")), false);
});

test("QA trade board seeds four 2↔3 offers on /api/home", async (t) => {
  const previousFlag = process.env.KLAFI_QA_TRADE_SAMPLES;
  process.env.KLAFI_QA_TRADE_SAMPLES = "1";
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "klafi-qa-seed-"));
  const clock = { value: Date.parse("2026-10-10T12:00:00.000Z") };
  const running = await start(dataDir, clock, { holderWarm: true });
  t.after(async () => {
    if (previousFlag === undefined) delete process.env.KLAFI_QA_TRADE_SAMPLES;
    else process.env.KLAFI_QA_TRADE_SAMPLES = previousFlag;
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const home = await api(running.base, "/api/home");
  assert.equal(home.status, 200);
  const token = home.body.token;
  const catalog = (await api(running.base, "/api/catalog")).body.cards;
  const ids = partyLeaderSampleIds(catalog);
  assert.ok(ids.length >= 5);
  const inventory = home.body.state.inventory || {};
  for (const index of viewerGrantPlan().regular) {
    assert.ok((inventory[ids[index]] || 0) >= 1, `home grants ${ids[index]}`);
  }

  const listed = await api(running.base, "/api/trades", { token });
  const open = (listed.body.trades || []).filter((trade) => trade.status === "open");
  assert.equal(open.length, 4);
  const byId = new Map(open.map((trade) => [trade.qaSampleId, trade]));
  for (const sample of QA_TRADE_SAMPLES) {
    const row = byId.get(sample.id);
    assert.ok(row, `missing sample ${sample.id}`);
    assert.equal(row.offeredCardIds.length, 2);
    assert.equal(row.wantedCardIds.length, 3);
    assert.equal(row.offeredMode, sample.offeredMode);
    assert.equal(row.wantedMode, sample.wantedMode);
    assert.equal(row.qaLabel, undefined);
    assert.equal(row.canAccept, true);
  }
  const accepted = await api(running.base, `/api/trades/${byId.get("ok-2-3-and-and").tradeId}/accept`, {
    token,
    method: "POST",
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.trade?.status, "accepted");
});

test("QA seed invalidates the boot holder snapshot so new owners appear", async (t) => {
  const previousFlag = process.env.KLAFI_QA_TRADE_SAMPLES;
  process.env.KLAFI_QA_TRADE_SAMPLES = "1";
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "klafi-qa-holders-"));
  const clock = { value: Date.parse("2026-10-10T12:00:00.000Z") };
  const running = await start(dataDir, clock, { holderWarm: true });
  t.after(async () => {
    if (previousFlag === undefined) delete process.env.KLAFI_QA_TRADE_SAMPLES;
    else process.env.KLAFI_QA_TRADE_SAMPLES = previousFlag;
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const empty = await api(running.base, "/api/card-holders");
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.holders, {});
  const home = await api(running.base, "/api/home");
  assert.equal(home.status, 200);
  const catalog = (await api(running.base, "/api/catalog")).body.cards;
  const ids = partyLeaderSampleIds(catalog);
  const holders = await api(running.base, "/api/card-holders");
  assert.ok(Object.keys(holders.body.holders).length > 0, "seeded owners must show up after a warm empty snapshot");
  for (const index of viewerGrantPlan().regular) {
    assert.ok((holders.body.holders[ids[index]] || 0) >= 1, `${ids[index]} has a holder after seed`);
  }
});

test("QA trade board does not seed when NODE_ENV is production", async (t) => {
  const previousNode = process.env.NODE_ENV;
  const previousFlag = process.env.KLAFI_QA_TRADE_SAMPLES;
  process.env.KLAFI_QA_TRADE_SAMPLES = "1";
  process.env.NODE_ENV = "production";
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "klafi-qa-prod-"));
  const clock = { value: Date.parse("2026-10-10T12:00:00.000Z") };
  const running = await start(dataDir, clock);
  t.after(async () => {
    process.env.NODE_ENV = previousNode;
    if (previousFlag === undefined) delete process.env.KLAFI_QA_TRADE_SAMPLES;
    else process.env.KLAFI_QA_TRADE_SAMPLES = previousFlag;
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const token = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const community = await api(running.base, "/api/community", { token });
  assert.equal(community.status, 200);
  const open = (community.body.trades?.trades || []).filter((trade) => trade.status === "open");
  assert.equal(open.length, 0);
});

test("file store: accept rejects missing AND, empty OR, numbered-only, reserved, and owner-gone", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "klafi-qa-rejects-"));
  const clock = { value: Date.parse("2026-10-10T12:00:00.000Z") };
  let running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const cards = (await api(running.base, "/api/catalog")).body.cards.filter(({ eventOnly }) => !eventOnly).slice(0, 8);
  const [o1, o2, w1, w2, w3, extra] = cards;

  async function freshPair() {
    const owner = (await api(running.base, "/api/session", { method: "POST" })).body.token;
    const accepter = (await api(running.base, "/api/session", { method: "POST" })).body.token;
    return { owner, accepter };
  }

  const andMissing = await freshPair();
  await unlockMany(running.base, andMissing.owner, [o1.id]);
  await unlockMany(running.base, andMissing.accepter, [w1.id]);
  const andTrade = await api(running.base, "/api/trades", {
    token: andMissing.owner,
    method: "POST",
    body: { offered: { mode: "and", cardIds: [o1.id] }, wanted: { mode: "and", cardIds: [w1.id, w2.id] } },
  });
  const andFail = await api(running.base, `/api/trades/${andTrade.body.trade.tradeId}/accept`, {
    token: andMissing.accepter,
    method: "POST",
  });
  assert.equal(andFail.status, 409);
  assert.equal(andFail.body.messageHe, TRADE_MESSAGES_HE.ACCEPT_ACCEPTER_MISSING);

  const orNone = await freshPair();
  await unlockMany(running.base, orNone.owner, [o1.id]);
  const orTrade = await api(running.base, "/api/trades", {
    token: orNone.owner,
    method: "POST",
    body: { offered: { mode: "and", cardIds: [o1.id] }, wanted: { mode: "or", cardIds: [w1.id, w2.id] } },
  });
  const orFail = await api(running.base, `/api/trades/${orTrade.body.trade.tradeId}/accept`, {
    token: orNone.accepter,
    method: "POST",
    body: { offeredCardId: o1.id, wantedCardId: w1.id },
  });
  assert.equal(orFail.status, 409);
  assert.equal(orFail.body.messageHe, TRADE_MESSAGES_HE.ACCEPT_ACCEPTER_MISSING);

  const reserved = await freshPair();
  await unlockMany(running.base, reserved.owner, [o2.id]);
  await unlockMany(running.base, reserved.accepter, [w3.id]);
  const reserveMine = await api(running.base, "/api/trades", {
    token: reserved.accepter,
    method: "POST",
    body: { offered: { mode: "and", cardIds: [w3.id] }, wanted: { mode: "and", cardIds: [extra.id] } },
  });
  assert.equal(reserveMine.status, 201);
  const reservedOffer = await api(running.base, "/api/trades", {
    token: reserved.owner,
    method: "POST",
    body: { offered: { mode: "and", cardIds: [o2.id] }, wanted: { mode: "and", cardIds: [w3.id] } },
  });
  const reservedFail = await api(running.base, `/api/trades/${reservedOffer.body.trade.tradeId}/accept`, {
    token: reserved.accepter,
    method: "POST",
  });
  assert.equal(reservedFail.status, 409);
  assert.equal(reservedFail.body.messageHe, TRADE_MESSAGES_HE.ACCEPT_ACCEPTER_MISSING);

  const numbered = await freshPair();
  await unlockMany(running.base, numbered.owner, [o1.id]);
  await unlockMany(running.base, numbered.accepter, [w1.id]);
  const numberedTrade = await api(running.base, "/api/trades", {
    token: numbered.owner,
    method: "POST",
    body: { offeredCardId: o1.id, wantedCardId: w1.id },
  });
  await running.close();
  const stored = JSON.parse(await readFile(path.join(dataDir, "state.json"), "utf8"));
  const numberedSession = stored.sessions[numbered.accepter];
  for (const instance of numberedSession.instances || []) {
    if (instance.cardId === w1.id) {
      instance.numberedIndex = 1;
      instance.numberedOf = 4;
    }
  }
  await writeFile(path.join(dataDir, "state.json"), JSON.stringify(stored));
  running = await start(dataDir, clock);
  const numberedFail = await api(running.base, `/api/trades/${numberedTrade.body.trade.tradeId}/accept`, {
    token: numbered.accepter,
    method: "POST",
  });
  assert.equal(numberedFail.status, 409);
  assert.equal(numberedFail.body.messageHe, TRADE_MESSAGES_HE.ACCEPT_ACCEPTER_MISSING);

  const gone = await freshPair();
  await unlockMany(running.base, gone.owner, [o2.id]);
  await unlockMany(running.base, gone.accepter, [w2.id]);
  const goneTrade = await api(running.base, "/api/trades", {
    token: gone.owner,
    method: "POST",
    body: { offeredCardId: o2.id, wantedCardId: w2.id },
  });
  await running.close();
  const goneState = JSON.parse(await readFile(path.join(dataDir, "state.json"), "utf8"));
  delete goneState.sessions[gone.owner].inventory[o2.id];
  goneState.sessions[gone.owner].instances = (goneState.sessions[gone.owner].instances || [])
    .filter((item) => item.cardId !== o2.id);
  await writeFile(path.join(dataDir, "state.json"), JSON.stringify(goneState));
  running = await start(dataDir, clock);
  const goneFail = await api(running.base, `/api/trades/${goneTrade.body.trade.tradeId}/accept`, {
    token: gone.accepter,
    method: "POST",
  });
  assert.equal(goneFail.status, 409);
  assert.equal(goneFail.body.messageHe, TRADE_MESSAGES_HE.ACCEPT_OWNER_MISSING);
});

test("file store: 2↔3 accept moves cards into binder and updates counts", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "klafi-qa-binder-"));
  const clock = { value: Date.parse("2026-10-10T12:00:00.000Z") };
  const running = await start(dataDir, clock);
  t.after(async () => {
    await running.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const cards = (await api(running.base, "/api/catalog")).body.cards
    .filter(({ eventOnly, idleEligible }) => !eventOnly && idleEligible)
    .slice(0, 5);
  const owner = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const accepter = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const offered = cards.slice(0, 2).map(({ id }) => id);
  const wanted = cards.slice(2, 5).map(({ id }) => id);
  await unlockMany(running.base, owner, offered);
  await unlockMany(running.base, accepter, wanted);
  const before = {
    owner: (await api(running.base, "/api/state", { token: owner })).body,
    accepter: (await api(running.base, "/api/state", { token: accepter })).body,
  };
  const created = await api(running.base, "/api/trades", {
    token: owner,
    method: "POST",
    body: { offered: { mode: "and", cardIds: offered }, wanted: { mode: "and", cardIds: wanted } },
  });
  const accepted = await api(running.base, `/api/trades/${created.body.trade.tradeId}/accept`, {
    token: accepter,
    method: "POST",
  });
  assert.equal(accepted.status, 200);
  const after = {
    owner: (await api(running.base, "/api/state", { token: owner })).body,
    accepter: (await api(running.base, "/api/state", { token: accepter })).body,
  };
  assertInventoryConserved(inventorySnapshot(before), inventorySnapshot(after));
  for (const id of wanted) assert.equal(after.owner.inventory[id], 1);
  for (const id of offered) assert.equal(after.accepter.inventory[id], 1);
  for (const id of offered) assert.equal(after.owner.inventory[id] || 0, 0);
  for (const id of wanted) assert.equal(after.accepter.inventory[id] || 0, 0);
  assert.equal(after.owner.ownedUnique, before.owner.ownedUnique - offered.length + wanted.length);
  assert.equal(after.accepter.ownedUnique, before.accepter.ownedUnique - wanted.length + offered.length);
  assert.equal(after.owner.tradeCount, 1);
  assert.equal(after.accepter.tradeCount, 1);
});

test("pglite: accept rejects missing AND, empty OR, numbered-only, reserved, and owner-gone; 2↔3 updates counts", async (t) => {
  const { db, store } = await postgresStoreWithMigrations();
  t.after(async () => db.close());
  const at = "2026-10-10T12:00:00.000Z";
  const later = new Date(Date.parse(at) + 86400000).toISOString();
  let n = 0;
  async function pair(ownerInv, accepterInv, accepterExtra = {}) {
    n += 1;
    const owner = `pg-owner-${n}`;
    const accepter = `pg-accepter-${n}`;
    await store.insertSessionRow(store.pool, owner, { displayName: owner, createdAt: at, inventory: ownerInv });
    await store.insertSessionRow(store.pool, accepter, {
      displayName: accepter,
      createdAt: at,
      inventory: accepterInv,
      ...accepterExtra,
    });
    return { owner, accepter };
  }

  const andMissing = await pair({ O: 1 }, { A: 1 });
  const andTrade = await store.createTrade({
    sessionToken: andMissing.owner,
    offered: { mode: "and", cardIds: ["O"] },
    wanted: { mode: "and", cardIds: ["A", "B"] },
    createdAt: at,
    expiresAt: later,
  });
  const andFail = await store.acceptTrade({ tradeId: andTrade.tradeId, sessionToken: andMissing.accepter, acceptedAt: at });
  assert.equal(andFail.ok, false);
  assert.equal(andFail.messageHe, TRADE_MESSAGES_HE.ACCEPT_ACCEPTER_MISSING);

  const orNone = await pair({ O: 1 }, {});
  const orTrade = await store.createTrade({
    sessionToken: orNone.owner,
    offered: { mode: "and", cardIds: ["O"] },
    wanted: { mode: "or", cardIds: ["A", "B"] },
    createdAt: at,
    expiresAt: later,
  });
  const orFail = await store.acceptTrade({
    tradeId: orTrade.tradeId,
    sessionToken: orNone.accepter,
    acceptedAt: at,
    offeredCardId: "O",
    wantedCardId: "A",
  });
  assert.equal(orFail.ok, false);
  assert.equal(orFail.messageHe, TRADE_MESSAGES_HE.ACCEPT_ACCEPTER_MISSING);

  const numbered = await pair({ O: 1 }, { N: 1 }, { numberedByCard: { N: 1 } });
  const numberedTrade = await store.createTrade({
    sessionToken: numbered.owner,
    offered: { mode: "and", cardIds: ["O"] },
    wanted: { mode: "and", cardIds: ["N"] },
    createdAt: at,
    expiresAt: later,
  });
  const numberedFail = await store.acceptTrade({ tradeId: numberedTrade.tradeId, sessionToken: numbered.accepter, acceptedAt: at });
  assert.equal(numberedFail.ok, false);
  assert.equal(numberedFail.messageHe, TRADE_MESSAGES_HE.ACCEPT_ACCEPTER_MISSING);

  const reserved = await pair({ O: 1 }, { R: 1 });
  const mine = await store.createTrade({
    sessionToken: reserved.accepter,
    offered: { mode: "and", cardIds: ["R"] },
    wanted: { mode: "and", cardIds: ["X"] },
    createdAt: at,
    expiresAt: later,
  });
  assert.ok(mine.tradeId);
  const reservedOffer = await store.createTrade({
    sessionToken: reserved.owner,
    offered: { mode: "and", cardIds: ["O"] },
    wanted: { mode: "and", cardIds: ["R"] },
    createdAt: at,
    expiresAt: later,
  });
  const reservedFail = await store.acceptTrade({ tradeId: reservedOffer.tradeId, sessionToken: reserved.accepter, acceptedAt: at });
  assert.equal(reservedFail.ok, false);
  assert.equal(reservedFail.messageHe, TRADE_MESSAGES_HE.ACCEPT_ACCEPTER_MISSING);

  const gone = await pair({ O: 1 }, { W: 1 });
  const goneTrade = await store.createTrade({
    sessionToken: gone.owner,
    offered: { mode: "and", cardIds: ["O"] },
    wanted: { mode: "and", cardIds: ["W"] },
    createdAt: at,
    expiresAt: later,
  });
  const ownerSession = await store.hydrateSession(gone.owner);
  delete ownerSession.inventory.O;
  await store.saveSession(gone.owner, ownerSession);
  const goneFail = await store.acceptTrade({ tradeId: goneTrade.tradeId, sessionToken: gone.accepter, acceptedAt: at });
  assert.equal(goneFail.ok, false);
  assert.equal(goneFail.messageHe, TRADE_MESSAGES_HE.ACCEPT_OWNER_MISSING);

  const binder = await pair({ A: 1, B: 1 }, { C: 1, D: 1, E: 1 });
  const bundle = await store.createTrade({
    sessionToken: binder.owner,
    offered: { mode: "and", cardIds: ["A", "B"] },
    wanted: { mode: "and", cardIds: ["C", "D", "E"] },
    createdAt: at,
    expiresAt: later,
  });
  const before = {
    owner: await store.hydrateSession(binder.owner),
    accepter: await store.hydrateSession(binder.accepter),
  };
  const accepted = await store.acceptTrade({ tradeId: bundle.tradeId, sessionToken: binder.accepter, acceptedAt: at });
  assert.equal(accepted.status, "accepted");
  const ownerAfter = await store.hydrateSession(binder.owner);
  const accepterAfter = await store.hydrateSession(binder.accepter);
  assertInventoryConserved(
    { owner: { inventory: before.owner.inventory }, accepter: { inventory: before.accepter.inventory } },
    { owner: { inventory: ownerAfter.inventory }, accepter: { inventory: accepterAfter.inventory } },
  );
  assert.deepEqual(ownerAfter.inventory, { C: 1, D: 1, E: 1 });
  assert.deepEqual(accepterAfter.inventory, { A: 1, B: 1 });
});

test("postgres SQL store: accept persists inventory and accepted picks", async (t) => {
  const { db, store } = await postgresStoreWithMigrations();
  t.after(async () => db.close());
  const at = "2026-10-10T12:00:00.000Z";
  const owner = "owner-pg-accept";
  const accepter = "accepter-pg-accept";
  await store.insertSessionRow(store.pool, owner, {
    displayName: owner,
    createdAt: at,
    inventory: { A: 1, B: 1 },
  });
  await store.insertSessionRow(store.pool, accepter, {
    displayName: accepter,
    createdAt: at,
    inventory: { C: 1, D: 1 },
  });
  const created = await store.createTrade({
    sessionToken: owner,
    offered: { mode: "or", cardIds: ["A", "B"] },
    wanted: { mode: "and", cardIds: ["C", "D"] },
    createdAt: at,
    expiresAt: new Date(Date.parse(at) + 86400000).toISOString(),
  });
  const before = {
    owner: await store.hydrateSession(owner),
    accepter: await store.hydrateSession(accepter),
  };
  const accepted = await store.acceptTrade({
    tradeId: created.tradeId,
    sessionToken: accepter,
    acceptedAt: at,
    offeredCardId: "B",
  });
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.acceptedOfferedCardId, "B");
  assert.deepEqual(accepted.acceptedWantedCardId ? [accepted.acceptedWantedCardId] : [], ["C"]);
  const ownerAfter = await store.hydrateSession(owner);
  const accepterAfter = await store.hydrateSession(accepter);
  assertInventoryConserved(
    { owner: { inventory: before.owner.inventory }, accepter: { inventory: before.accepter.inventory } },
    { owner: { inventory: ownerAfter.inventory }, accepter: { inventory: accepterAfter.inventory } },
  );
  assert.equal(ownerAfter.inventory.A, 1);
  assert.equal(ownerAfter.inventory.B, undefined);
  assert.equal(ownerAfter.inventory.C, 1);
  assert.equal(ownerAfter.inventory.D, 1);
  assert.equal(accepterAfter.inventory.B, 1);
  assert.equal(accepterAfter.inventory.C, undefined);
  const row = (await db.query("SELECT * FROM kalpi_trades WHERE trade_id = $1", [created.tradeId])).rows[0];
  assert.equal(row.status, "accepted");
  assert.equal(row.accepted_by, accepter);
  assert.equal(row.accepted_offered_card_id, "B");
  assert.equal(row.accepted_wanted_card_id, "C");
  const ownerInv = (await db.query("SELECT card_id, copies FROM kalpi_inventory WHERE session_token = $1", [owner])).rows;
  const accepterInv = (await db.query("SELECT card_id, copies FROM kalpi_inventory WHERE session_token = $1", [accepter])).rows;
  assert.deepEqual(Object.fromEntries(ownerInv.map(({ card_id, copies }) => [card_id, copies])), { A: 1, C: 1, D: 1 });
  assert.deepEqual(Object.fromEntries(accepterInv.map(({ card_id, copies }) => [card_id, copies])), { B: 1 });
});

test("postgres SQL store: creator may want a card they already own", async (t) => {
  const { db, store } = await postgresStoreWithMigrations();
  t.after(async () => db.close());
  const at = "2026-10-10T12:00:00.000Z";
  const later = new Date(Date.parse(at) + 86400000).toISOString();
  const owner = "owner-pg-want-owned";
  const accepter = "accepter-pg-want-owned";
  await store.insertSessionRow(store.pool, owner, {
    displayName: owner,
    createdAt: at,
    inventory: { A: 1, C: 1 },
  });
  await store.insertSessionRow(store.pool, accepter, {
    displayName: accepter,
    createdAt: at,
    inventory: { C: 1 },
  });
  const created = await store.createTrade({
    sessionToken: owner,
    offered: { mode: "and", cardIds: ["A"] },
    wanted: { mode: "and", cardIds: ["C"] },
    createdAt: at,
    expiresAt: later,
  });
  assert.ok(created.tradeId);
  assert.deepEqual(created.wantedCardIds, ["C"]);
  const before = {
    owner: await store.hydrateSession(owner),
    accepter: await store.hydrateSession(accepter),
  };
  assert.equal(before.owner.inventory.C, 1);
  const accepted = await store.acceptTrade({
    tradeId: created.tradeId,
    sessionToken: accepter,
    acceptedAt: at,
  });
  assert.equal(accepted.status, "accepted");
  const ownerAfter = await store.hydrateSession(owner);
  const accepterAfter = await store.hydrateSession(accepter);
  assertInventoryConserved(
    { owner: { inventory: before.owner.inventory }, accepter: { inventory: before.accepter.inventory } },
    { owner: { inventory: ownerAfter.inventory }, accepter: { inventory: accepterAfter.inventory } },
  );
  assert.deepEqual(ownerAfter.inventory, { C: 2 });
  assert.deepEqual(accepterAfter.inventory, { A: 1 });
  const row = (await db.query("SELECT * FROM kalpi_trades WHERE trade_id = $1", [created.tradeId])).rows[0];
  assert.equal(row.status, "accepted");
  assert.equal(row.accepted_wanted_card_id, "C");
});

test("legacy 1↔1 accept conserves inventory and stays a single-card AND trade", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "klafi-legacy-cons-"));
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
  const before = inventorySnapshot({
    owner: (await api(running.base, "/api/state", { token: owner })).body,
    accepter: (await api(running.base, "/api/state", { token: accepter })).body,
  });
  const created = await api(running.base, "/api/trades", {
    token: owner,
    method: "POST",
    body: { offeredCardId: a.id, wantedCardId: b.id },
  });
  assert.equal(created.body.trade.offeredMode, "and");
  assert.deepEqual(created.body.trade.offeredCardIds, [a.id]);
  assert.deepEqual(created.body.trade.wantedCardIds, [b.id]);
  const accepted = await api(running.base, `/api/trades/${created.body.trade.tradeId}/accept`, {
    token: accepter,
    method: "POST",
  });
  assert.equal(accepted.status, 200);
  const after = inventorySnapshot({
    owner: (await api(running.base, "/api/state", { token: owner })).body,
    accepter: (await api(running.base, "/api/state", { token: accepter })).body,
  });
  assertInventoryConserved(before, after);
  assert.equal(after.owner.inventory[b.id], 1);
  assert.equal(after.accepter.inventory[a.id], 1);
  assert.equal(after.owner.inventory[a.id] || 0, 0);
});
