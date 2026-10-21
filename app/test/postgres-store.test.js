import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { lastAcquiredAtByCard } from "../public/binder-order.js";
import { PostgresStore, sessionDeltas } from "../server/postgres-store.js";
import { loadSession as loadSlimHome } from "../server/slim-home.js";
import { postgresPoolOptions, runtimeConnectionString } from "../server/postgres-pool.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function instance(id, overrides = {}) {
  return {
    instanceId: id,
    cardId: `card-${id}`,
    finish: "Common",
    pulledAt: "2026-09-16T18:00:00.000Z",
    isNew: true,
    acquiredBy: "idle",
    seenAt: null,
    ...overrides,
  };
}

function pack(id, cards = []) {
  return {
    packId: id,
    mode: "idle",
    pulledAt: "2026-09-16T18:00:00.000Z",
    nextDailyAt: null,
    cards,
  };
}

test("session deltas touch only changed player-card rows and append-only records", () => {
  const firstInstance = instance("one");
  const previous = {
    inventory: { "card-one": 1, "card-removed": 1 },
    instances: [firstInstance],
    packs: [pack("pack-one", [firstInstance])],
  };
  const seenInstance = { ...firstInstance, seenAt: "2026-09-16T18:01:00.000Z" };
  const secondInstance = instance("two");
  const next = {
    inventory: { "card-one": 2, "card-two": 1 },
    instances: [seenInstance, secondInstance],
    packs: [previous.packs[0], pack("pack-two", [secondInstance])],
  };

  assert.deepEqual(sessionDeltas(previous, next), {
    sessionChanged: false,
    inventoryUpserts: [
      { cardId: "card-one", copies: 2 },
      { cardId: "card-two", copies: 1 },
    ],
    inventoryDeletes: ["card-removed"],
    instanceUpserts: [seenInstance, secondInstance],
    instanceDeletes: [],
    packUpserts: [next.packs[1]],
    packDeletes: [],
  });
});

test("session deltas delete records trimmed beyond persistence caps", () => {
  const previousInstances = Array.from({ length: 500 }, (_, index) => instance(String(index)));
  const previousPacks = Array.from({ length: 100 }, (_, index) => pack(String(index)));
  const nextInstance = instance("new");
  const nextPack = pack("new", [nextInstance]);

  const deltas = sessionDeltas(
    { inventory: {}, instances: previousInstances, packs: previousPacks },
    {
      inventory: {},
      instances: [...previousInstances, nextInstance],
      packs: [...previousPacks, nextPack],
    },
  );

  assert.deepEqual(deltas.instanceDeletes, ["0"]);
  assert.equal(deltas.sessionChanged, false);
  assert.deepEqual(deltas.instanceUpserts, [nextInstance]);
  assert.deepEqual(deltas.packDeletes, ["0"]);
  assert.deepEqual(deltas.packUpserts, [nextPack]);
});

test("session deltas detect scalar and extras-only player changes", () => {
  const previous = {
    inventory: {},
    instances: [],
    packs: [],
    highestRank: 1,
    favorites: [],
  };
  const next = {
    ...previous,
    highestRank: 2,
    favorites: ["card-one"],
  };

  assert.equal(sessionDeltas(previous, next).sessionChanged, true);
});

test("session deltas persist earned achievement stamps in extras", () => {
  const previous = {
    inventory: {},
    instances: [],
    packs: [],
    achievementsEarned: {},
    bestLoginStreak: 0,
  };
  const next = {
    ...previous,
    achievementsEarned: { "faction-pick": "2026-09-26T08:00:00.000Z" },
    bestLoginStreak: 3,
  };

  assert.equal(sessionDeltas(previous, next).sessionChanged, true);
});

test("serverless pools hold at most one short-lived database connection", () => {
  const options = postgresPoolOptions("postgresql://example.invalid/test", {
    ssl: true,
    serverless: true,
  });

  assert.equal(options.max, 1);
  assert.equal(options.allowExitOnIdle, true);
  assert.ok(options.connectionTimeoutMillis < 10_000);
  assert.ok(options.idleTimeoutMillis < 10_000);
  assert.deepEqual(options.ssl, { rejectUnauthorized: false });
});

test("transaction-pooler boot applies leftover IF NOT EXISTS migrations", async () => {
  const source = await readFile(path.join(here, "../server/postgres-store.js"), "utf8");
  assert.doesNotMatch(source, /Database migrations require the Supabase session pooler/);
  assert.match(source, /if \(this\.transactionPooling\) \{\s*await client\.query\(sql\)/);
  assert.match(source, /005_card_holder_snapshot/);
  assert.match(source, /006_numbered_grant_cadence/);
  assert.match(source, /007_instances_seen_at_index/);
  assert.match(source, /008_numbered_chance/);
  const upserts = [...source.matchAll(/ON CONFLICT \(instance_id\) DO UPDATE SET([\s\S]*?)numbered_of = EXCLUDED\.numbered_of/g)];
  assert.equal(upserts.length, 2, "insertSessionRow and saveSession both upsert instances");
  for (const [, clause] of upserts) {
    assert.match(clause, /pulled_at = EXCLUDED\.pulled_at/, "a moved trade copy must keep the accept time");
    assert.match(clause, /card_id = EXCLUDED\.card_id/);
    assert.match(clause, /is_new = EXCLUDED\.is_new/);
    assert.match(clause, /acquired_by = EXCLUDED\.acquired_by/);
    assert.match(clause, /seen_at = EXCLUDED\.seen_at/);
  }
});

test("serverless Supabase traffic uses transaction pooling", () => {
  const sessionUrl = "postgresql://postgres.project:secret@aws-0-region.pooler.supabase.com:5432/postgres";

  assert.equal(
    runtimeConnectionString(sessionUrl, { serverless: true }),
    "postgresql://postgres.project:secret@aws-0-region.pooler.supabase.com:6543/postgres",
  );
  assert.equal(runtimeConnectionString(sessionUrl, { serverless: false }), sessionUrl);
});

test("postgres leagues: one per player under an advisory lock; leave passes the host or deletes the room", async () => {
  const { PostgresStore } = await import("../server/postgres-store.js");
  const store = new PostgresStore("postgres://qa@127.0.0.1:1/none");
  store.leaguesTableReady = true;
  store.exclusive = (operation) => operation();
  store.loadSession = async (token) => ({ token });
  const leagues = new Map([["ROOMA1", { code: "ROOMA1", name: "א", season_label: "תשרי", owner_token: "host", created_at: "2026-09-26T10:00:00Z", member_tokens: ["host", "friend"] }]]);
  const queries = [];
  store.executor = () => ({
    query: async (sql, params = []) => {
      queries.push(sql.replace(/\s+/g, " ").trim());
      if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] };
      if (/SELECT count\(\*\)/.test(sql)) {
        const token = JSON.parse(params[0])[0];
        return { rows: [{ count: [...leagues.values()].filter((row) => row.member_tokens.includes(token)).length }] };
      }
      if (/SELECT \* FROM kalpi_leagues WHERE code = \$1 FOR UPDATE/.test(sql)) return { rows: leagues.has(params[0]) ? [structuredClone(leagues.get(params[0]))] : [] };
      if (/^DELETE FROM kalpi_leagues/.test(sql)) { leagues.delete(params[0]); return { rows: [] }; }
      if (/^UPDATE kalpi_leagues SET member_tokens = \$2::jsonb, owner_token = \$3/.test(sql)) {
        leagues.set(params[0], { ...leagues.get(params[0]), member_tokens: JSON.parse(params[1]), owner_token: params[2] });
        return { rows: [] };
      }
      if (/^INSERT INTO kalpi_leagues/.test(sql)) throw new Error("must not create a second league");
      return { rows: [] };
    },
  });
  assert.deepEqual(await store.createLeague("friend", "ב"), { error: "ALREADY_IN_LEAGUE" });
  assert.ok(queries.findIndex((sql) => /pg_advisory_xact_lock/.test(sql)) < queries.findIndex((sql) => /SELECT count/.test(sql)));
  assert.deepEqual(await store.leaveLeague("host", "rooma1"), { left: true, deleted: false });
  assert.equal(leagues.get("ROOMA1").owner_token, "friend", "the oldest remaining member hosts");
  assert.deepEqual(leagues.get("ROOMA1").member_tokens, ["friend"]);
  assert.deepEqual(await store.leaveLeague("host", "ROOMA1"), { error: "NOT_IN_LEAGUE" });
  assert.deepEqual(await store.leaveLeague("friend", "ROOMA1"), { left: true, deleted: true });
  assert.equal(leagues.has("ROOMA1"), false, "an empty league is deleted");
  await store.pool.end().catch(() => {});
});

test("postgres: moving a trade copy persists pulled_at, is_new, and the slim חדש date", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const migrations = path.join(here, "../server/migrations");
  for (const file of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(await readFile(path.join(migrations, file), "utf8"));
  }
  const query = (sql, params) => db.query(sql, params);
  const store = Object.create(PostgresStore.prototype);
  store.pool = { query, connect: async () => ({ query, release() {} }) };
  store.transaction = new AsyncLocalStorage();
  store.requestSessions = new AsyncLocalStorage();
  store.sessionCache = new Map();
  store.now = () => Date.parse("2026-10-10T12:00:00.000Z");
  store.numberedRandom = () => 0.99;
  store.holderRefresh = null;
  store.holderSnapshot = null;
  store.holderTableReady = false;
  store.leaguesTableReady = false;
  store.invalidateCardHolderSnapshot = () => {};

  const oldAt = "2026-09-01T00:00:00.000Z";
  const tradeAt = "2026-10-10T12:05:00.000Z";
  await store.insertSessionRow(store.pool, "alice", {
    displayName: "alice",
    createdAt: oldAt,
    inventory: { A: 1 },
    instances: [{
      instanceId: "inst-a",
      cardId: "A",
      finish: "Common",
      pulledAt: oldAt,
      isNew: false,
      acquiredBy: "idle",
      seenAt: oldAt,
    }],
  });
  const previous = await store.loadSession("alice");
  assert.equal(previous.instances[0].pulledAt, oldAt);
  const next = structuredClone(previous);
  next.inventory = { B: 1 };
  next.instances = [{
    instanceId: "inst-a",
    cardId: "B",
    finish: "Common",
    pulledAt: tradeAt,
    isNew: true,
    acquiredBy: "trade-accepted",
    seenAt: null,
  }];
  await store.saveSession("alice", next, previous);
  store.sessionCache.clear();
  const loaded = await store.loadSession("alice");
  assert.equal(loaded.instances[0].cardId, "B");
  assert.equal(loaded.instances[0].pulledAt, tradeAt);
  assert.equal(loaded.instances[0].isNew, true);
  assert.equal(loaded.instances[0].acquiredBy, "trade-accepted");
  assert.equal(loaded.instances[0].seenAt, null);
  assert.equal(lastAcquiredAtByCard(loaded.instances, loaded.inventory).B, tradeAt);

  const slim = await loadSlimHome(db, "alice");
  assert.equal(slim.lastAcquiredAt.B, tradeAt, "slim /api/home חדש uses the trade time after reload");
  assert.equal(slim.lastAcquiredAt.A, undefined);
});
