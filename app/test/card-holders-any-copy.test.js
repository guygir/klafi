import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PostgresStore } from "../server/postgres-store.js";
import { holderInventoryChanged, tallyCardHolders, JsonStore } from "../server/store.js";
import { binderBadgeOrder, PINNED_BADGE_ID } from "../public/badge-order.js";

const migrations = path.join(path.dirname(fileURLToPath(import.meta.url)), "../server/migrations");
const at = "2026-10-12T06:00:00Z";
const regular = (id, cardId) => ({ instanceId: id, cardId, seenAt: at });
const numbered = (id, cardId, seen = true) => ({ instanceId: id, cardId, numberedIndex: 1, numberedOf: 5, seenAt: seen ? at : null });

// x = regular copies, y = opened numbered copies. Card "K".
const PLAYERS = {
  xOnly: { inventory: { K: 2 }, instances: [regular("x1", "K"), regular("x2", "K")], unseenPulls: [] },
  yOnly: { inventory: { K: 1 }, instances: [numbered("y1", "K")], unseenPulls: [] },
  both: { inventory: { K: 2 }, instances: [regular("b1", "K"), numbered("b2", "K")], unseenPulls: [] },
  waitingOnly: { inventory: {}, instances: [numbered("w1", "K", false)], unseenPulls: ["w1"] },
};

test("file store: a holder is anyone with a regular or opened numbered copy, once; warehouse numbered does not count", () => {
  const one = (name) => tallyCardHolders({ [name]: PLAYERS[name] }).holders.K || 0;
  assert.equal(one("xOnly"), 1, "x only");
  assert.equal(one("yOnly"), 1, "y only");
  assert.equal(one("both"), 1, "x and y: +1, not +2");
  assert.equal(one("waitingOnly"), 0, "unopened warehouse numbered");
  assert.equal(tallyCardHolders(PLAYERS).holders.K, 3);
});

test("Postgres snapshot query counts the same players", async () => {
  const db = new PGlite();
  for (const file of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(await readFile(path.join(migrations, file), "utf8"));
  }
  for (const [token, player] of Object.entries(PLAYERS)) {
    await db.query("INSERT INTO kalpi_sessions (token, display_name, created_at, extras) VALUES ($1, $1, $2, '{}'::jsonb)", [token, at]);
    for (const [cardId, copies] of Object.entries(player.inventory)) {
      await db.query("INSERT INTO kalpi_inventory (session_token, card_id, copies) VALUES ($1, $2, $3)", [token, cardId, copies]);
    }
    for (const item of player.instances) {
      await db.query(
        "INSERT INTO kalpi_instances (instance_id, session_token, card_id, pulled_at, acquired_by, seen_at, numbered_index, numbered_of) VALUES ($1, $2, $3, $4, 'idle', $5, $6, $7)",
        [`${token}-${item.instanceId}`, token, item.cardId, at, item.seenAt, item.numberedIndex || null, item.numberedOf || null],
      );
    }
  }
  const store = Object.create(PostgresStore.prototype);
  store.pool = { query: (sql, params) => db.query(sql, params) };
  store.now = () => Date.parse(at);
  const snapshot = await store.refreshCardHolderSnapshot();
  assert.equal(snapshot.holders.K, 3, "xOnly + yOnly + both, waitingOnly excluded");
  await db.close();
});

test("holder inventory fingerprint notices a new owner bag", () => {
  assert.equal(holderInventoryChanged({ inventory: { K: 1 } }, { inventory: { K: 1 } }), false);
  assert.equal(holderInventoryChanged({ inventory: {} }, { inventory: { K: 1 } }), true);
  assert.equal(holderInventoryChanged({ inventory: { K: 1 } }, { inventory: { K: 0 } }), true);
});

test("file store: a new owner is visible on the next holder summary", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kalpi-holder-owner-"));
  const store = new JsonStore(path.join(dir, "state.json"));
  await store.init();
  await store.refreshCardHolderSnapshot();
  assert.deepEqual((await store.cardHolderSummary()).holders, {});
  const token = await store.createSession(at);
  await store.withSession(token, (session) => {
    session.inventory = { K: 1 };
  });
  const summary = await store.cardHolderSummary();
  assert.equal(summary.holders.K, 1);
  await rm(dir, { recursive: true, force: true });
});

test("Postgres snapshot: a new owner is visible after inventory save invalidates", async () => {
  const db = new PGlite();
  for (const file of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(await readFile(path.join(migrations, file), "utf8"));
  }
  const store = Object.create(PostgresStore.prototype);
  store.pool = { query: (sql, params) => db.query(sql, params) };
  store.now = () => Date.parse(at);
  store.holderSnapshot = null;
  store.holderTableReady = false;
  store.holderRefresh = null;
  const empty = await store.refreshCardHolderSnapshot();
  assert.deepEqual(empty.holders, {});
  await db.query("INSERT INTO kalpi_sessions (token, display_name, created_at, extras) VALUES ($1, $1, $2, '{}'::jsonb)", ["owner", at]);
  await db.query("INSERT INTO kalpi_inventory (session_token, card_id, copies) VALUES ($1, $2, $3)", ["owner", "K", 1]);
  const cached = await store.cardHolderSummary();
  assert.equal(cached.holders.K || 0, 0, "warm snapshot stays until inventory save invalidates");
  store.invalidateCardHolderSnapshot();
  const summary = await store.cardHolderSummary();
  assert.equal(summary.holders.K, 1);
  await db.close();
});

test("binder badge row: the numbered badge is pinned first so the +N overflow never hides it", () => {
  const badges = [
    { id: "h1", tier: "hard", earned: true, earnedAt: "2026-10-12T00:00:00Z" },
    { id: "s1", tier: "simple", earned: true, earnedAt: "2026-10-12T05:00:00Z" },
    { id: PINNED_BADGE_ID, tier: "simple", earned: true, earnedAt: "2026-01-01T00:00:00Z" },
    { id: "m1", tier: "medium", earned: true },
  ];
  assert.equal(binderBadgeOrder(badges)[0].id, PINNED_BADGE_ID);
  assert.deepEqual(binderBadgeOrder(badges).slice(1).map(({ id }) => id), ["h1", "m1", "s1"]);
  assert.ok(!binderBadgeOrder([{ ...badges[2], earned: false }]).length, "not earned: not shown");
});
