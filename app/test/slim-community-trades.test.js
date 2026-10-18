import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { listSlimCommunityTrades } from "../server/slim-community.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrations = path.join(here, "../server/migrations");

async function database() {
  const db = new PGlite();
  for (const file of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(await readFile(path.join(migrations, file), "utf8"));
  }
  return db;
}

test("slim community Postgres query keeps 2↔3 sides and AND/OR accept", async () => {
  const db = await database();
  const now = Date.parse("2026-10-18T12:00:00.000Z");
  await db.query(
    "INSERT INTO kalpi_sessions (token, display_name, created_at) VALUES ($1, $2, $3)",
    ["owner", "Owner", new Date(now).toISOString()],
  );
  await db.query(
    "INSERT INTO kalpi_sessions (token, display_name, created_at) VALUES ($1, $2, $3)",
    ["viewer", "Viewer", new Date(now).toISOString()],
  );
  for (const [token, cardId] of [
    ["owner", "A"],
    ["owner", "B"],
    ["viewer", "X"],
  ]) {
    await db.query(
      "INSERT INTO kalpi_inventory (session_token, card_id, copies) VALUES ($1, $2, 1)",
      [token, cardId],
    );
  }
  await db.query(
    `INSERT INTO kalpi_trades (
       trade_id, owner_token, offered_card_id, wanted_card_id, status,
       created_at, expires_at, offered_mode, wanted_mode, offered_card_ids, wanted_card_ids
     ) VALUES ($1,$2,$3,$4,'open',$5,$6,'and','or',$7::jsonb,$8::jsonb)`,
    [
      "t-bundle",
      "owner",
      "A",
      "X",
      new Date(now).toISOString(),
      new Date(now + 24 * 3600 * 1000).toISOString(),
      JSON.stringify(["A", "B"]),
      JSON.stringify(["X", "Y", "Z"]),
    ],
  );

  const listed = await listSlimCommunityTrades(db, "viewer", now);
  assert.equal(listed.length, 1);
  assert.deepEqual(listed[0].offeredCardIds, ["A", "B"]);
  assert.deepEqual(listed[0].wantedCardIds, ["X", "Y", "Z"]);
  assert.equal(listed[0].offeredMode, "and");
  assert.equal(listed[0].wantedMode, "or");
  assert.equal(listed[0].offeredCardId, "A");
  assert.equal(listed[0].wantedCardId, "X");
  assert.equal(listed[0].canAccept, true);
  assert.equal(listed[0].needsAcceptChoice, true);
  assert.equal(listed[0].ownedByCurrent, false);
});
