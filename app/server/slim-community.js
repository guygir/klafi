import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { collectionStarCount } from "./visible-sets.js";
import { factionStandingsFromCollectors } from "./faction-standings.js";
import { guardPool, postgresPoolOptions } from "./postgres-pool.js";
import { openSpecialWindow } from "./special-window.js";

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
let eventsCatalog;
let eventsLoad;

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

async function loadEvents() {
  if (eventsCatalog) return eventsCatalog;
  eventsLoad ??= readFile(new URL("../data/events.json", import.meta.url), "utf8")
    .then((text) => {
      eventsCatalog = JSON.parse(text);
      return eventsCatalog;
    })
    .catch(() => ({ events: [] }))
    .finally(() => {
      eventsLoad = null;
    });
  return eventsLoad;
}

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  pool ??= guardPool(new Pool(postgresPoolOptions(process.env.DATABASE_URL, {
    ssl: process.env.DATABASE_SSL === "1",
  })));
  return pool;
}

export function slimDailyChallenge(config, now = Date.now()) {
  const partyIds = [...new Set((config?.gameConfig?.parties || []).map(({ id }) => id))].sort();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(now));
  const dayNumber = [...day].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const targetPartyId = partyIds.length ? partyIds[dayNumber % partyIds.length] : null;
  const targetPartyNameHe = (config?.gameConfig?.parties || []).find(({ id }) => id === targetPartyId)?.displayNameHe
    || targetPartyId;
  return { day, targetPartyId, targetPartyNameHe, leaders: [] };
}

export function slimLeaderboards(config, collectors = [], factions = [], now = Date.now()) {
  return {
    collectors,
    factions,
    dailyChallenge: slimDailyChallenge(config, now),
    fixture: false,
    label: "Real activity in this local PoC",
  };
}

export function emptyCommunity(config, now = Date.now(), specialWindow = null) {
  return {
    trades: { trades: [], simulated: false },
    leaderboards: slimLeaderboards(config, [], [], now),
    activity: { counts: {}, participatingSessions: 0, fixture: false, label: "Recorded PoC activity" },
    specialWindow,
  };
}

function iso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function sessionInventory(db, token) {
  if (!token) return {};
  const result = await db.query(
    "SELECT card_id, copies FROM kalpi_inventory WHERE session_token = $1",
    [token],
  );
  return Object.fromEntries(result.rows.map((row) => [row.card_id, row.copies]));
}

async function listTrades(db, token, now) {
  await db.query(
    `UPDATE kalpi_trades SET status = 'expired'
     WHERE status = 'open' AND expires_at <= $1`,
    [new Date(now).toISOString()],
  );
  const inventory = await sessionInventory(db, token);
  const result = await db.query(
    `SELECT t.*, owner.display_name AS owner_label
     FROM kalpi_trades t
     JOIN kalpi_sessions owner ON owner.token = t.owner_token
     WHERE t.status = 'open' OR t.owner_token = $1 OR t.accepted_by = $1
     ORDER BY t.created_at DESC
     LIMIT 100`,
    [token],
  );
  const ownerHasOffered = new Set();
  if (result.rows.some((row) => row.status === "open" && row.owner_token !== token)) {
    const owners = await db.query(
      `SELECT session_token, card_id FROM kalpi_inventory
       WHERE (session_token, card_id) IN (
         SELECT owner_token, offered_card_id FROM kalpi_trades
         WHERE status = 'open' AND owner_token <> $1
       )`,
      [token],
    );
    for (const row of owners.rows) ownerHasOffered.add(`${row.session_token}:${row.card_id}`);
  }
  return result.rows.map((row) => ({
    tradeId: row.trade_id,
    offeredCardId: row.offered_card_id,
    wantedCardId: row.wanted_card_id,
    status: row.status,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    acceptedAt: iso(row.accepted_at),
    cancelledAt: iso(row.cancelled_at),
    ownerLabel: row.owner_label || "שחקן קְלָפִי",
    ownedByCurrent: row.owner_token === token,
    acceptedByCurrent: row.accepted_by === token,
    canAccept: row.status === "open"
      && row.owner_token !== token
      && ownerHasOffered.has(`${row.owner_token}:${row.offered_card_id}`)
      && Boolean(inventory[row.wanted_card_id]),
  }));
}

async function collectorBoards(db, config, now, token) {
  const cardIndex = config.cardIndex || [];
  const sessions = await db.query(
    `SELECT s.token, s.display_name, s.idle_pull_count, s.pack_count,
            s.avatar_id, s.faction_id, s.highest_rank,
            COALESCE((s.extras->>'loginStreak')::integer, 0) AS login_streak,
            s.extras->>'publicBinderSlug' AS binder_slug,
            COALESCE(json_object_agg(i.card_id, i.copies) FILTER (WHERE i.card_id IS NOT NULL), '{}') AS inventory
     FROM kalpi_sessions s
     LEFT JOIN kalpi_inventory i ON i.session_token = s.token
     GROUP BY s.token`,
  );
  const allCollectors = sessions.rows
    .map((row) => {
      const inventory = row.inventory || {};
      return {
        label: row.display_name,
        ownedUnique: Object.keys(inventory).length,
        stars: collectionStarCount(inventory, cardIndex),
        packs: row.idle_pull_count ?? row.pack_count,
        current: row.token === token,
        avatarId: row.avatar_id || "kid-boy",
        factionId: row.faction_id || null,
        loginStreak: row.login_streak || 0,
        rankLevel: row.highest_rank || 1,
        binderSlug: row.binder_slug || null,
      };
    })
    .sort((a, b) => b.stars - a.stars || b.ownedUnique - a.ownedUnique || b.packs - a.packs)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
  const collectors = allCollectors.slice(0, 8);
  const currentCollector = allCollectors.find(({ current }) => current);
  if (currentCollector && !collectors.some(({ current }) => current)) collectors.splice(7, 1, currentCollector);
  const factions = factionStandingsFromCollectors(allCollectors);
  return slimLeaderboards(config, collectors, factions, now);
}

async function activitySummary(db) {
  const events = await db.query(
    "SELECT type, session_token FROM kalpi_events ORDER BY recorded_at DESC LIMIT 5000",
  );
  const counts = {};
  const sessions = new Set();
  for (const event of events.rows) {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
    if (event.session_token) sessions.add(event.session_token);
  }
  return {
    counts,
    participatingSessions: sessions.size,
    fixture: false,
    label: "Recorded PoC activity",
  };
}

export async function handleSlimCommunity(request, response) {
  try {
    const config = await loadShell();
    const token = bearer(request);
    const now = Date.now();
    const db = getPool();
    const events = await loadEvents();
    let eventClaims = {};
    if (db && token) {
      const extras = await db.query("SELECT extras FROM kalpi_sessions WHERE token = $1", [token]).catch(() => ({ rows: [] }));
      eventClaims = extras.rows[0]?.extras?.eventClaims || {};
    }
    const specialWindow = openSpecialWindow(events.events, now, { eventClaims });
    if (!db) {
      json(response, 200, emptyCommunity(config, now, specialWindow));
      return;
    }
    const [trades, leaderboards, activity] = await Promise.all([
      listTrades(db, token, now).catch(() => []),
      collectorBoards(db, config, now, token).catch(() => slimLeaderboards(config, [], [], now)),
      activitySummary(db).catch(() => emptyCommunity(config, now).activity),
    ]);
    json(response, 200, {
      trades: { trades, simulated: false },
      leaderboards,
      activity,
      specialWindow,
    });
  } catch (error) {
    json(response, 500, { error: "SERVER_ERROR", detail: error.code || error.message });
  }
}
