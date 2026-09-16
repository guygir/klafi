import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { slimPublicState } from "./slim-state.js";

const { Pool } = pg;
const SECURITY_HEADERS = Object.freeze({
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
});

let pool;
let shell;
let ready;

function json(response, status, value) {
  response.writeHead(status, SECURITY_HEADERS);
  response.end(JSON.stringify(value));
}

function bearer(request) {
  const match = request.headers.authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function loadShell() {
  if (shell) return shell;
  const text = await readFile(new URL("../public/shell.json", import.meta.url), "utf8");
  shell = JSON.parse(text);
  return shell;
}

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "1" ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.DATABASE_POOL_SIZE || 5),
  });
  return pool;
}

async function ensureReady(db) {
  if (ready) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS kalpi_sessions (
      token TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      avatar_id TEXT NOT NULL DEFAULT 'kid-boy',
      created_at TIMESTAMPTZ NOT NULL,
      next_daily_at TIMESTAMPTZ,
      dry_packs INTEGER NOT NULL DEFAULT 0,
      pack_count INTEGER NOT NULL DEFAULT 0,
      faction_id TEXT,
      trade_count INTEGER NOT NULL DEFAULT 0,
      idle_anchor_at TIMESTAMPTZ,
      next_idle_at TIMESTAMPTZ,
      idle_duplicate_streak INTEGER NOT NULL DEFAULT 0,
      idle_pull_count INTEGER NOT NULL DEFAULT 0,
      highest_rank INTEGER NOT NULL DEFAULT 1,
      quiz_won_day TEXT,
      extras JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS kalpi_inventory (
      session_token TEXT NOT NULL REFERENCES kalpi_sessions(token) ON DELETE CASCADE,
      card_id TEXT NOT NULL,
      copies INTEGER NOT NULL CHECK (copies > 0),
      PRIMARY KEY (session_token, card_id)
    )
  `);
  ready = true;
}

async function loadSession(db, token) {
  const sessionResult = await db.query("SELECT * FROM kalpi_sessions WHERE token = $1", [token]);
  const row = sessionResult.rows[0];
  if (!row) return null;
  const inventory = await db.query(
    "SELECT card_id, copies FROM kalpi_inventory WHERE session_token = $1",
    [token],
  );
  const extras = row.extras || {};
  return {
    displayName: row.display_name,
    avatarId: row.avatar_id,
    createdAt: row.created_at,
    highestRank: row.highest_rank,
    nextIdleAt: row.next_idle_at ? new Date(row.next_idle_at).toISOString() : null,
    inventory: Object.fromEntries(inventory.rows.map((item) => [item.card_id, item.copies])),
    unseenPulls: extras.unseenPulls || [],
    pendingRankRewards: extras.pendingRankRewards || [],
    favorites: extras.favorites || [],
  };
}

async function createSession(db, now) {
  const token = randomUUID();
  const createdAt = new Date(now).toISOString();
  await db.query(
    `INSERT INTO kalpi_sessions (token, display_name, created_at, idle_anchor_at, extras)
     VALUES ($1,$2,$3,$3,'{}'::jsonb)`,
    [token, `שחקן ${token.slice(0, 4)}`, createdAt],
  );
  return token;
}

export async function handleSlimHome(request, response) {
  try {
    const config = await loadShell();
    const db = getPool();
    if (!db) {
      json(response, 501, { error: "HOME_NEEDS_DATABASE" });
      return;
    }
    await ensureReady(db);
    let token = bearer(request);
    let session = token ? await loadSession(db, token) : null;
    if (!session) {
      token = await createSession(db, Date.now());
      session = await loadSession(db, token);
    }
    json(response, 200, { token, state: slimPublicState(session, config) });
  } catch (error) {
    json(response, 500, { error: "SERVER_ERROR", detail: error.code || error.message });
  }
}

export async function handleSlimHealth(request, response) {
  try {
    const db = getPool();
    if (!db) {
      json(response, 200, { status: "ok", backend: "static" });
      return;
    }
    await db.query("SELECT 1");
    json(response, 200, { status: "ok", backend: "postgres" });
  } catch {
    json(response, 503, { status: "degraded", backend: "postgres" });
  }
}
