import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { createKalpiApp } from "../server/app.js";
import { handleSlimCommunity, useSlimCommunityPool } from "../server/slim-community.js";
import { handleSlimHome, useSlimHomePool } from "../server/slim-home.js";
import { PostgresStore } from "../server/postgres-store.js";
import { JsonStore } from "../server/store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const projectRoot = path.resolve(appRoot, "..");

function pglitePool(db) {
  const run = (sql, params) => db.query(sql, params);
  return {
    query: run,
    connect: async () => ({ query: run, release() {} }),
  };
}

async function migratedPglite() {
  const db = new PGlite();
  const migrationsDir = path.join(appRoot, "server/migrations");
  await db.exec(`
    CREATE TABLE IF NOT EXISTS kalpi_schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  for (const file of (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(await readFile(path.join(migrationsDir, file), "utf8"));
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

async function startVercelLike(dataDir, clock, { store = null, db = null } = {}) {
  const fatHandler = await createKalpiApp({
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
    store,
    now: () => clock.value,
    numberedRandom: () => 0.99,
    rng: () => 0,
  });
  if (db) {
    const pool = pglitePool(db);
    useSlimHomePool(pool);
    useSlimCommunityPool(pool);
  }
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (db && url.pathname === "/api/home") {
      await handleSlimHome(request, response);
      return;
    }
    if (db && url.pathname === "/api/community") {
      await handleSlimCommunity(request, response);
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
  const { port } = server.address();
  return {
    store,
    db,
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
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function unlockMany(base, token, cardIds) {
  for (const cardId of cardIds) {
    const result = await api(base, "/api/debug/unlock-card", { token, method: "POST", body: { cardId } });
    assert.equal(result.status, 200, `unlock ${cardId}`);
  }
}

function inventoryOf(state) {
  return state?.inventory || {};
}

function inventoryDelta(before, after) {
  const gained = [];
  const lost = [];
  const ids = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const id of ids) {
    const diff = (Number(after?.[id]) || 0) - (Number(before?.[id]) || 0);
    if (diff > 0) for (let i = 0; i < diff; i += 1) gained.push(id);
    if (diff < 0) for (let i = 0; i < -diff; i += 1) lost.push(id);
  }
  return { gained: gained.sort(), lost: lost.sort() };
}

const CASES = [
  { name: "1↔1 legacy", offeredMode: "and", offered: [0], wantedMode: "and", wanted: [1] },
  { name: "1-card OR↔1-card AND", offeredMode: "or", offered: [0], wantedMode: "and", wanted: [1] },
  { name: "1-card OR↔1-card OR", offeredMode: "or", offered: [0], wantedMode: "or", wanted: [1] },
  { name: "AND/AND", offeredMode: "and", offered: [0, 1], wantedMode: "and", wanted: [2, 3] },
  { name: "OR/OR", offeredMode: "or", offered: [0, 1, 2], wantedMode: "or", wanted: [3, 4, 5], pick: { offered: 2, wanted: 4 } },
  { name: "AND/OR", offeredMode: "and", offered: [0, 1], wantedMode: "or", wanted: [2, 3, 4], pick: { wanted: 4 } },
  { name: "OR/AND", offeredMode: "or", offered: [0, 1, 2], wantedMode: "and", wanted: [3, 4], pick: { offered: 1 } },
  { name: "Guy OR3↔1 AND", offeredMode: "or", offered: [0, 1, 2], wantedMode: "and", wanted: [3], pick: { offered: 1 } },
  { name: "Guy OR3↔1 OR", offeredMode: "or", offered: [0, 1, 2], wantedMode: "or", wanted: [3], pick: { offered: 2 } },
  { name: "2-for-3", offeredMode: "and", offered: [0, 1], wantedMode: "and", wanted: [2, 3, 4] },
  { name: "3-for-3", offeredMode: "and", offered: [0, 1, 2], wantedMode: "and", wanted: [3, 4, 5] },
];

async function playAccept(running, clock, cards, fixture, { ownerName = null, viaSlimList = false, legacyRow = false } = {}) {
  const offered = fixture.offered.map((index) => cards[index].id);
  const wanted = fixture.wanted.map((index) => cards[index].id);
  const owner = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  const accepter = (await api(running.base, "/api/session", { method: "POST" })).body.token;
  if (ownerName) {
    const named = await api(running.base, "/api/profile", {
      token: owner,
      method: "POST",
      body: { displayName: ownerName },
    });
    assert.equal(named.status, 200, `${fixture.name} owner name`);
  }
  await unlockMany(running.base, owner, offered);
  await unlockMany(running.base, accepter, wanted);
  const beforeAccepter = inventoryOf((await api(running.base, "/api/state", { token: accepter })).body);
  const created = await api(running.base, "/api/trades", {
    token: owner,
    method: "POST",
    body: {
      offered: { mode: fixture.offeredMode, cardIds: offered },
      wanted: { mode: fixture.wantedMode, cardIds: wanted },
    },
  });
  assert.equal(created.status, 201, `${fixture.name} create`);
  const tradeId = created.body.trade.tradeId;
  if (legacyRow && running.db) {
    await running.db.query(
      `UPDATE kalpi_trades
       SET offered_card_ids = '[]'::jsonb, wanted_card_ids = '[]'::jsonb
       WHERE trade_id = $1`,
      [tradeId],
    );
  } else if (legacyRow && running.store?.state?.trades) {
    const row = running.store.state.trades.find((trade) => trade.tradeId === tradeId);
    if (row) {
      row.offeredCardIds = [];
      row.wantedCardIds = [];
    }
  }
  if (viaSlimList) {
    const community = await api(running.base, "/api/community", { token: accepter });
    assert.equal(community.status, 200, `${fixture.name} slim community`);
    const listed = (community.body.trades?.trades || community.body.trades || []).find((trade) => trade.tradeId === tradeId);
    assert.ok(listed, `${fixture.name} listed on slim community`);
    if (!legacyRow) {
      assert.ok(listed.offeredCardIds?.length || listed.offeredCardId, `${fixture.name} slim sides`);
    }
  }
  clock.value += 60_000;
  const pick = {
    offeredCardId: fixture.pick?.offered != null ? offered[fixture.offered.indexOf(fixture.pick.offered)] || cards[fixture.pick.offered].id : undefined,
    wantedCardId: fixture.pick?.wanted != null ? wanted[fixture.wanted.indexOf(fixture.pick.wanted)] || cards[fixture.pick.wanted].id : undefined,
  };
  const body = {};
  if (pick.offeredCardId) body.offeredCardId = pick.offeredCardId;
  if (pick.wantedCardId) body.wantedCardId = pick.wantedCardId;
  const accepted = await api(running.base, `/api/trades/${tradeId}/accept`, {
    token: accepter,
    method: "POST",
    body,
  });
  assert.equal(accepted.status, 200, `${fixture.name} accept ${JSON.stringify(accepted.body)}`);
  const expectReceived = (fixture.offeredMode === "or" ? [pick.offeredCardId || offered[0]] : offered).slice().sort();
  const expectGiven = (fixture.wantedMode === "or" ? [pick.wantedCardId || wanted[0]] : wanted).slice().sort();
  const received = [...(accepted.body.receivedCardIds || [])].sort();
  const given = [...(accepted.body.givenCardIds || [])].sort();
  assert.ok(received.length, `${fixture.name} receivedCardIds must not be empty`);
  assert.ok(given.length, `${fixture.name} givenCardIds must not be empty`);
  assert.deepEqual(received, expectReceived, `${fixture.name} received`);
  assert.deepEqual(given, expectGiven, `${fixture.name} given`);
  const afterAccepter = inventoryOf(accepted.body.state);
  const delta = inventoryDelta(beforeAccepter, afterAccepter);
  assert.deepEqual(delta.gained, expectReceived, `${fixture.name} inventory gained`);
  assert.deepEqual(delta.lost, expectGiven, `${fixture.name} inventory lost`);
  if (ownerName) {
    assert.equal(accepted.body.trade?.ownerLabel, ownerName, `${fixture.name} owner label`);
  }
  const ownerState = (await api(running.base, "/api/state", { token: owner })).body;
  const notice = ownerState.pendingTradeNotices?.[0];
  assert.ok(notice, `${fixture.name} owner notice`);
  assert.deepEqual([...(notice.receivedCardIds || [])].sort(), expectGiven);
  assert.deepEqual([...(notice.givenCardIds || [])].sort(), expectReceived);
  return accepted;
}

async function runMatrix(t, label, setup) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), `klafi-accept-${label}-`));
  const clock = { value: Date.parse("2026-10-21T12:00:00.000Z") };
  const ctx = await setup(dataDir, clock);
  const running = await startVercelLike(dataDir, clock, ctx);
  t.after(async () => {
    await running.close();
    if (ctx.db) await ctx.db.close();
    await rm(dataDir, { recursive: true, force: true });
    useSlimHomePool(null);
    useSlimCommunityPool(null);
  });
  const cards = (await api(running.base, "/api/catalog")).body.cards.filter(({ eventOnly }) => !eventOnly);
  assert.ok(cards.length >= 6, "catalog");

  for (const fixture of CASES) {
    await playAccept(running, clock, cards, fixture, { viaSlimList: Boolean(ctx.db) });
  }
  await playAccept(running, clock, cards, CASES[0], {
    ownerName: "שר לענייני דלית",
    viaSlimList: Boolean(ctx.db),
  });
  await playAccept(running, clock, cards, CASES[0], {
    legacyRow: true,
    viaSlimList: Boolean(ctx.db),
  });
}

test("vercel routing + file store: every accept path returns moved ids matching inventory", async (t) => {
  await runMatrix(t, "file", async (dataDir, clock) => ({
    store: new JsonStore(path.join(dataDir, "state.json"), { now: () => clock.value, numberedRandom: () => 0.99 }),
  }));
});

test("vercel routing + PGlite slim/api: every accept path returns moved ids matching inventory", async (t) => {
  await runMatrix(t, "pglite", async (_dataDir, clock) => {
    const db = await migratedPglite();
    return {
      db,
      store: new PostgresStore("postgres://qa@127.0.0.1:1/none", {
        pool: pglitePool(db),
        now: () => clock.value,
        numberedRandom: () => 0.99,
      }),
    };
  });
});

test("slim community never accepts; production fat handler keeps the accept rewrite", async () => {
  const slim = await readFile(path.resolve(here, "../server/slim-community.js"), "utf8");
  const vercel = await readFile(path.resolve(here, "../../api/index.js"), "utf8");
  const app = await readFile(path.resolve(here, "../server/app.js"), "utf8");
  assert.doesNotMatch(slim, /\/accept/);
  assert.match(vercel, /__kalpi_path/);
  assert.match(app, /acceptDialogCards\(trade\)/);
  assert.doesNotMatch(app, /trade: listed \|\| trade/);
  assert.doesNotMatch(app, /movedCardsFromAccept\(trade,/);
});
