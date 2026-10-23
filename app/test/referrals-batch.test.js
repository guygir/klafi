import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { collectionStarCount } from "../server/achievements.js";
import { PostgresStore } from "../server/postgres-store.js";
import { JsonStore } from "../server/store.js";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INVITES = 45;
const cards = [
  { id: "c-common", rarity: "Common" },
  { id: "c-uncommon", rarity: "Uncommon" },
  { id: "c-rare", rarity: "Rare" },
];

async function migratedPglite() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE IF NOT EXISTS kalpi_schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const dir = path.join(appRoot, "server/migrations");
  for (const file of (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(await readFile(path.join(dir, file), "utf8"));
    await db.query("INSERT INTO kalpi_schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING", [file.replace(/\.sql$/, "")]);
  }
  return db;
}

function pool(db) {
  const run = (sql, params) => db.query(sql, params);
  return { query: run, connect: async () => ({ query: run, release() {} }) };
}

/** Mixed invitees: claimed, ready, under the gate, numbered (seen and unseen), plain. */
async function seed(store) {
  const now = "2026-10-23T10:00:00.000Z";
  const inviter = await store.createSession(now);
  const code = await store.ensureReferralCode(inviter);
  for (let index = 0; index < INVITES; index += 1) {
    const token = await store.createSession(now, { inviteCode: code });
    await store.withSession(token, (session) => {
      session.displayName = `שחקן ${String(index % 7)}`;
      const copies = index % 5;
      if (copies) session.inventory["c-common"] = copies;
      if (index % 3 === 0) session.inventory["c-rare"] = 2;
      if (index % 4 === 0) {
        session.inventory["c-uncommon"] = 1;
        const instanceId = `num-${index}`;
        session.instances.push({ instanceId, cardId: "c-uncommon", finish: "standard", pulledAt: now, isNew: false, acquiredBy: "idle", seenAt: now, numberedIndex: index + 1, numberedOf: 99 });
        if (index % 8 === 0) session.unseenPulls.push(instanceId);
      }
      if (index % 6 === 0) session.referralRewardedAt = now;
    });
  }
  return inviter;
}

/** Today's algorithm, verbatim, on full sessions. */
async function legacyRows(store, inviter, gate) {
  return (await store.listInvited(inviter))
    .filter((session) => session?.referralCode && session.invitedBy === inviter)
    .map((session) => {
      const stars = collectionStarCount(session, cards);
      const claimed = Boolean(session.referralRewardedAt);
      return { code: session.referralCode, name: session.displayName || "שחקן", stars, ready: stars >= gate && !claimed, claimed };
    })
    .sort((l, r) => Number(r.ready) - Number(l.ready) || r.stars - l.stars || l.name.localeCompare(r.name, "he"));
}

async function batchRows(store, inviter, gate) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  return (await store.listInvitedSummaries(inviter))
    .filter((session) => session?.referralCode && session.invitedBy === inviter)
    .map((session) => {
      const stars = collectionStarCount(session, byId);
      const claimed = Boolean(session.referralRewardedAt);
      return { code: session.referralCode, name: session.displayName || "שחקן", stars, ready: stars >= gate && !claimed, claimed };
    })
    .sort((l, r) => Number(r.ready) - Number(l.ready) || r.stars - l.stars || l.name.localeCompare(r.name, "he"));
}

const sortCodes = (rows) => [...rows].sort((a, b) => a.code.localeCompare(b.code));

test("postgres: 45 invitees, summaries match the full-session list in ≤2 queries and no loadSession", async () => {
  const db = await migratedPglite();
  const store = new PostgresStore("postgres://qa@127.0.0.1:1/none", { pool: pool(db), now: () => "2026-10-23T10:00:00.000Z" });
  const inviter = await seed(store);
  const legacy = await legacyRows(store, inviter, 4);
  assert.equal(legacy.length, INVITES);
  assert.ok(legacy.some((row) => row.ready) && legacy.some((row) => row.claimed) && legacy.some((row) => !row.ready && !row.claimed));

  let queries = 0;
  let loads = 0;
  const realExecutor = store.executor.bind(store);
  store.executor = () => {
    const inner = realExecutor();
    return { ...inner, query: (...args) => { queries += 1; return inner.query(...args); } };
  };
  const realLoad = store.loadSession.bind(store);
  store.loadSession = (...args) => { loads += 1; return realLoad(...args); };
  const batch = await batchRows(store, inviter, 4);
  assert.ok(queries <= 2, `expected ≤2 queries, got ${queries}`);
  assert.equal(loads, 0);
  assert.deepEqual(sortCodes(batch), sortCodes(legacy));
  // Ties (same ready/stars/name) had no defined order before either; the sort keys must match.
  assert.deepEqual(batch.map((row) => [row.ready, row.stars, row.name]), legacy.map((row) => [row.ready, row.stars, row.name]));
  await db.close();
});

test("file store: 45 invitees, summaries match and the list builds fast", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "klafi-refbatch-"));
  try {
    const store = new JsonStore(path.join(dataDir, "state.json"));
    await store.init?.();
    const inviter = await seed(store);
    const legacy = await legacyRows(store, inviter, 4);
    const started = performance.now();
    const batch = await batchRows(store, inviter, 4);
    const elapsed = performance.now() - started;
    assert.deepEqual(batch, legacy);
    assert.ok(elapsed < 100, `took ${elapsed.toFixed(1)}ms`);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("listReferralRows reads summaries and builds the card map once", async () => {
  const source = await readFile(path.join(appRoot, "server/app.js"), "utf8");
  const body = source.slice(source.indexOf("async function listReferralRows"), source.indexOf("async function claimReferral"));
  assert.match(body, /listInvitedSummaries/);
  assert.match(body, /collectionStarCount\(session, cardsById\)/);
});
