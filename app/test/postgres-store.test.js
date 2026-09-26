import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { sessionDeltas } from "../server/postgres-store.js";
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
