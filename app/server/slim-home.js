import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { slimPublicState } from "./slim-state.js";
import { guardPool, postgresPoolOptions } from "./postgres-pool.js";
import { newPublicBinderSlug } from "./public-binder.js";

const { Pool } = pg;
const SECURITY_HEADERS = Object.freeze({
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
});

let pool;
let shell;
let shellLoad;
let ready;

function stamp(response) {
  const requestId = response.getHeader("x-request-id") || randomUUID();
  response.setHeader("x-request-id", requestId);
  return requestId;
}

function json(response, status, value) {
  const requestId = stamp(response);
  const payload = status >= 500 && value && typeof value === "object"
    ? { ...value, requestId: value.requestId || requestId }
    : value;
  if (status >= 500) {
    console.error(JSON.stringify({
      level: "error",
      requestId,
      message: payload?.detail || payload?.error || "SERVER_ERROR",
    }));
  }
  response.writeHead(status, SECURITY_HEADERS);
  response.end(JSON.stringify(payload));
}

function bearer(request) {
  const match = request.headers.authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function loadShell() {
  if (shell) return shell;
  shellLoad ??= readFile(new URL("../public/shell.json", import.meta.url), "utf8")
    .then((text) => {
      shell = JSON.parse(text);
      return shell;
    })
    .finally(() => {
      shellLoad = null;
    });
  return shellLoad;
}

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  pool ??= guardPool(new Pool(postgresPoolOptions(process.env.DATABASE_URL, {
    ssl: process.env.DATABASE_SSL === "1",
  })));
  return pool;
}

async function ensureReady(db) {
  ready ??= db.query("SELECT 1 FROM kalpi_sessions LIMIT 0").catch(async (error) => {
    if (error.code !== "42P01") throw error;
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
    );
    CREATE TABLE IF NOT EXISTS kalpi_inventory (
      session_token TEXT NOT NULL REFERENCES kalpi_sessions(token) ON DELETE CASCADE,
      card_id TEXT NOT NULL,
      copies INTEGER NOT NULL CHECK (copies > 0),
      PRIMARY KEY (session_token, card_id)
      )
    `);
  }).catch((error) => {
    ready = null;
    throw error;
  });
  await ready;
}

async function loadSession(db, token) {
  const sessionResult = await db.query(
    `SELECT
       session.*,
       COALESCE((
         SELECT jsonb_object_agg(inventory.card_id, inventory.copies)
         FROM kalpi_inventory AS inventory
         WHERE inventory.session_token = session.token
       ), '{}'::jsonb) AS inventory_state
     FROM kalpi_sessions AS session
     WHERE session.token = $1`,
    [token],
  );
  const row = sessionResult.rows[0];
  if (!row) return null;
  const extras = row.extras || {};
  return {
    displayName: row.display_name,
    avatarId: row.avatar_id,
    createdAt: row.created_at,
    highestRank: row.highest_rank,
    nextIdleAt: row.next_idle_at ? new Date(row.next_idle_at).toISOString() : null,
    idlePullCount: row.idle_pull_count ?? 0,
    inventory: row.inventory_state || {},
    unseenPulls: extras.unseenPulls || [],
    preparedPulls: extras.preparedPulls || [],
    pendingRankRewards: extras.pendingRankRewards || [],
    favorites: extras.favorites || [],
    publicBinderSlug: extras.publicBinderSlug || null,
  };
}

async function createSession(db, now) {
  const token = randomUUID();
  const createdAt = new Date(now).toISOString();
  const publicBinderSlug = newPublicBinderSlug();
  await db.query(
    `INSERT INTO kalpi_sessions (token, display_name, created_at, idle_anchor_at, extras)
     VALUES ($1,$2,$3,$3,$4::jsonb)`,
    [token, `שחקן ${token.slice(0, 4)}`, createdAt, JSON.stringify({ publicBinderSlug })],
  );
  return {
    token,
    session: {
      displayName: `שחקן ${token.slice(0, 4)}`,
      avatarId: "kid-boy",
      createdAt,
      highestRank: 1,
      nextIdleAt: null,
      idlePullCount: 0,
      inventory: {},
      unseenPulls: [],
      preparedPulls: [],
      pendingRankRewards: [],
      favorites: [],
      publicBinderSlug,
    },
  };
}

export async function handleSlimHome(request, response) {
  try {
    const db = getPool();
    if (!db) {
      json(response, 501, { error: "HOME_NEEDS_DATABASE" });
      return;
    }
    const [config] = await Promise.all([loadShell(), ensureReady(db)]);
    let token = bearer(request);
    let session = token ? await loadSession(db, token) : null;
    if (!session) {
      ({ token, session } = await createSession(db, Date.now()));
    } else if (!session.publicBinderSlug) {
      session.publicBinderSlug = newPublicBinderSlug();
      await db.query(
        `UPDATE kalpi_sessions SET extras = COALESCE(extras, '{}'::jsonb) || $2::jsonb WHERE token = $1`,
        [token, JSON.stringify({ publicBinderSlug: session.publicBinderSlug })],
      );
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
