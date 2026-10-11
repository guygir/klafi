import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { loadSession } from "../server/slim-home.js";
import { applyVisitStreak, publicStreakCalendar } from "../server/streak-calendar.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrations = path.join(here, "../server/migrations");
const TODAY_2016 = Date.parse("2026-10-11T17:16:00Z"); // 20:16 Israel time

async function database() {
  const db = new PGlite();
  for (const file of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(await readFile(path.join(migrations, file), "utf8"));
  }
  return db;
}

function guyVisitDates() {
  const days = [];
  for (let ms = Date.parse("2026-09-28T12:00:00+03:00"); ms <= Date.parse("2026-10-11T12:00:00+03:00"); ms += 86400000) {
    days.push(new Date(ms + 3 * 3600000).toISOString().slice(0, 10));
  }
  return days;
}

/** Guy's production rows on 2026-10-11: streak 14, today's streak-14 and date bonus both opened. */
const GUY_EXTRAS = {
  visitDay: "2026-10-11",
  visitDates: guyVisitDates(),
  visitStreak: 14,
  bestVisitStreak: 14,
  visitStreakClaims: [2, 4, 6, 8, 10, 12, 14],
  visitDateClaims: ["2026-10-11"],
  streakCalendarAckDay: "2026-10-11+bonus",
  stateRevision: 500,
};
const GUY_PRIZES = [
  ["g8", "SET5-19", "streak-8", "2026-10-04T23:49:00Z"],
  ["g10", "SET6-18", "streak-10", "2026-10-07T04:41:00Z"],
  ["g12", "SET6-15", "streak-12", "2026-10-08T21:17:00Z"],
  ["g14", "SET5-23", "streak-14", "2026-10-11T03:37:00Z"],
  ["gd", "SET7-03", "date-2026-10-11", "2026-10-11T14:55:00Z"],
];

async function seedGuy(db, { token = "guy", extraInstances = 0 } = {}) {
  await db.query(
    "INSERT INTO kalpi_sessions (token, display_name, created_at, extras) VALUES ($1, 'Guy', '2026-09-20T10:00:00Z', $2::jsonb)",
    [token, JSON.stringify(GUY_EXTRAS)],
  );
  for (const [id, cardId, acquiredBy, at] of GUY_PRIZES) {
    await db.query(
      "INSERT INTO kalpi_instances (instance_id, session_token, card_id, pulled_at, acquired_by, seen_at) VALUES ($1, $2, $3, $4, $5, $4)",
      [`${token}-${id}`, token, cardId, at, acquiredBy],
    );
  }
  if (extraInstances) {
    await db.query(
      `INSERT INTO kalpi_instances (instance_id, session_token, card_id, pulled_at, acquired_by, seen_at)
       SELECT $1 || '-idle-' || n, $1, 'LIK-01', NOW(), 'idle', NOW() FROM generate_series(1, $2::int) AS n`,
      [token, extraInstances],
    );
  }
}

function fullSession() {
  return {
    ...structuredClone(GUY_EXTRAS),
    instances: GUY_PRIZES.map(([id, cardId, acquiredBy, at]) => ({ instanceId: id, cardId, acquiredBy, pulledAt: at, seenAt: at })),
  };
}

test("slim /api/home on Postgres: today's opened streak prize reads opened, not claimable", async () => {
  const db = await database();
  await seedGuy(db);
  const session = await loadSession(db, "guy");
  applyVisitStreak(session, TODAY_2016);
  const calendar = publicStreakCalendar(session);
  const today = calendar.ladder[0];
  assert.equal(today.runDay, 14);
  assert.equal(today.claimed, true);
  assert.equal(today.opened, true, "streak-14 was opened at 06:37");
  const bonus = calendar.days.find((cell) => cell.date === "2026-10-11");
  assert.equal(bonus.claimed, true);
  assert.equal(bonus.opened, true);
  assert.equal(bonus.checked, true);
  assert.equal(calendar.showPopup, false);
  assert.ok(session.instances.every((item) => /^(streak|date)-/.test(item.acquiredBy)), "only calendar prizes are loaded");
  await db.close();
});

test("contract: slim home and full state build the identical streakCalendar", async () => {
  const db = await database();
  await seedGuy(db);
  const slim = await loadSession(db, "guy");
  applyVisitStreak(slim, TODAY_2016);
  const full = fullSession();
  applyVisitStreak(full, TODAY_2016);
  assert.deepEqual(publicStreakCalendar(slim), publicStreakCalendar(full));
  await db.close();
});

test("slim home load stays one fast query with a large collection", async () => {
  const db = await database();
  await seedGuy(db, { extraInstances: 5000 });
  await loadSession(db, "guy");
  const runs = [];
  for (let i = 0; i < 5; i += 1) {
    const started = performance.now();
    await loadSession(db, "guy");
    runs.push(performance.now() - started);
  }
  runs.sort((a, b) => a - b);
  console.log(`# slim loadSession with 5005 instances: median ${runs[2].toFixed(1)} ms`);
  assert.ok(runs[2] < 500, `median ${runs[2]} ms`);
  await db.close();
});
