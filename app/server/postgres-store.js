import pg from "pg";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { normalizeState } from "./store.js";
import { guardPool, postgresPoolOptions } from "./postgres-pool.js";

const { Pool } = pg;

const MIGRATIONS = [
  ["001_runtime_state", "001_runtime_state.sql"],
  ["002_normalized_runtime", "002_normalized_runtime.sql"],
  ["003_launch_reliability", "003_launch_reliability.sql"],
];

function iso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function cardStars(card) {
  if (card?.rarity === "Promotion") return 5;
  if (card?.rarity?.startsWith("Rare")) return 3;
  if (card?.rarity?.startsWith("Uncommon")) return 2;
  return 1;
}

function emptySession(token, createdAt) {
  return {
    displayName: `שחקן ${token.slice(0, 4)}`,
    avatarId: "kid-boy",
    createdAt,
    nextDailyAt: null,
    dryPacks: 0,
    packCount: 0,
    inventory: {},
    instances: [],
    packs: [],
    eventCounts: {},
    factionId: null,
    tradeCount: 0,
    eventClaims: {},
    favorites: [],
    idleAnchorAt: createdAt,
    nextIdleAt: null,
    unseenPulls: [],
    preparedPulls: [],
    idleDuplicateStreak: 0,
    idlePullCount: 0,
    highestRank: 1,
    claimedRankRewards: [],
    pendingRankRewards: [],
    quizWonDay: null,
    currentQuiz: null,
  };
}

function extrasFromSession(session) {
  return {
    eventCounts: session.eventCounts || {},
    eventClaims: session.eventClaims || {},
    favorites: session.favorites || [],
    unseenPulls: session.unseenPulls || [],
    preparedPulls: session.preparedPulls || [],
    claimedRankRewards: session.claimedRankRewards || [],
    pendingRankRewards: session.pendingRankRewards || [],
    currentQuiz: session.currentQuiz || null,
  };
}

function recordsBy(items, key) {
  return new Map(items.map((item) => [item[key], item]));
}

function changedRecords(previous, next, key) {
  const before = recordsBy(previous, key);
  return next.filter((item) => JSON.stringify(before.get(item[key])) !== JSON.stringify(item));
}

function removedRecordIds(previous, next, key) {
  const remaining = new Set(next.map((item) => item[key]));
  return previous.map((item) => item[key]).filter((id) => !remaining.has(id));
}

function sessionRowState(session) {
  return {
    displayName: session.displayName,
    avatarId: session.avatarId || "kid-boy",
    nextDailyAt: session.nextDailyAt,
    dryPacks: session.dryPacks || 0,
    packCount: session.packCount || 0,
    factionId: session.factionId,
    tradeCount: session.tradeCount || 0,
    idleAnchorAt: session.idleAnchorAt,
    nextIdleAt: session.nextIdleAt,
    idleDuplicateStreak: session.idleDuplicateStreak || 0,
    idlePullCount: session.idlePullCount || 0,
    highestRank: session.highestRank || 1,
    quizWonDay: session.quizWonDay,
    extras: extrasFromSession(session),
  };
}

export function sessionDeltas(previous, session) {
  const beforeInventory = previous.inventory || {};
  const nextInventory = session.inventory || {};
  const inventoryUpserts = Object.entries(nextInventory)
    .filter(([cardId, copies]) => copies > 0 && beforeInventory[cardId] !== copies)
    .map(([cardId, copies]) => ({ cardId, copies }));
  const inventoryDeletes = Object.keys(beforeInventory)
    .filter((cardId) => !nextInventory[cardId]);
  const beforeInstances = (previous.instances || []).slice(-500);
  const nextInstances = (session.instances || []).slice(-500);
  const beforePacks = (previous.packs || []).slice(-100);
  const nextPacks = (session.packs || []).slice(-100);
  return {
    sessionChanged: JSON.stringify(sessionRowState(previous)) !== JSON.stringify(sessionRowState(session)),
    inventoryUpserts,
    inventoryDeletes,
    instanceUpserts: changedRecords(beforeInstances, nextInstances, "instanceId"),
    instanceDeletes: removedRecordIds(beforeInstances, nextInstances, "instanceId"),
    packUpserts: changedRecords(beforePacks, nextPacks, "packId"),
    packDeletes: removedRecordIds(beforePacks, nextPacks, "packId"),
  };
}

export class PostgresStore {
  constructor(connectionString, { ssl = false } = {}) {
    const poolOptions = postgresPoolOptions(connectionString, { ssl });
    this.transactionPooling = poolOptions.connectionString !== connectionString;
    this.pool = guardPool(new Pool(poolOptions));
    this.transaction = new AsyncLocalStorage();
    this.requestSessions = new AsyncLocalStorage();
    this.sessionCache = new Map();
  }

  executor() {
    return this.transaction.getStore() || this.pool;
  }

  remember(token, session) {
    if (token && session) (this.requestSessions.getStore() || this.sessionCache).set(token, session);
    return session;
  }

  withRequest(operation) {
    return this.requestSessions.run(new Map(), operation);
  }

  async init() {
    const client = await this.pool.connect();
    let studioConfig = null;
    let migrationLock = false;
    try {
      const versions = MIGRATIONS.map(([version]) => version);
      const schemaResult = await client.query(
        "SELECT to_regclass('public.kalpi_schema_migrations') AS migrations",
      );
      let appliedVersions = new Set();
      if (schemaResult.rows[0]?.migrations) {
        const appliedResult = await client.query(
          "SELECT version FROM kalpi_schema_migrations WHERE version = ANY($1::text[])",
          [versions],
        );
        appliedVersions = new Set(appliedResult.rows.map(({ version }) => version));
      }
      if (appliedVersions.size !== versions.length) {
        if (this.transactionPooling) {
          throw new Error("Database migrations require the Supabase session pooler on port 5432.");
        }
        await client.query("SELECT pg_advisory_lock(hashtext('kalpi-schema-migrations'))");
        migrationLock = true;
        await client.query(`
          CREATE TABLE IF NOT EXISTS kalpi_schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        const appliedResult = await client.query(
          "SELECT version FROM kalpi_schema_migrations WHERE version = ANY($1::text[])",
          [versions],
        );
        appliedVersions = new Set(appliedResult.rows.map(({ version }) => version));
        for (const [version, fileName] of MIGRATIONS) {
          if (appliedVersions.has(version)) continue;
          const sql = await readFile(new URL(`./migrations/${fileName}`, import.meta.url), "utf8");
          await client.query("BEGIN");
          try {
            await client.query(sql);
            await client.query(
              "INSERT INTO kalpi_schema_migrations (version) VALUES ($1)",
              [version],
            );
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          }
        }
      }
      studioConfig = await this.importLegacyState(client);
    } finally {
      if (migrationLock) {
        await client.query("SELECT pg_advisory_unlock(hashtext('kalpi-schema-migrations'))").catch(() => {});
      }
      client.release();
    }
    return { studioConfig };
  }

  async importLegacyState(client) {
    const bootstrap = await client.query(`
      SELECT
        (
          SELECT state
          FROM kalpi_runtime_state
          WHERE id = 1 AND NOT EXISTS (SELECT 1 FROM kalpi_sessions)
        ) AS legacy_state,
        (
          SELECT config
          FROM kalpi_studio_config
          WHERE id = 1
        ) AS studio_config
    `);
    const { legacy_state: legacyState, studio_config: studioConfig } = bootstrap.rows[0];
    if (!legacyState) return studioConfig || null;
    const state = normalizeState(legacyState);
    for (const [token, session] of Object.entries(state.sessions || {})) {
      await this.insertSessionRow(client, token, session);
    }
    for (const trade of state.trades || []) {
      await client.query(
        `INSERT INTO kalpi_trades (
           trade_id, owner_token, offered_card_id, wanted_card_id, status,
           created_at, expires_at, accepted_at, accepted_by, cancelled_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (trade_id) DO NOTHING`,
        [
          trade.tradeId,
          trade.ownerToken,
          trade.offeredCardId,
          trade.wantedCardId,
          trade.status,
          trade.createdAt,
          trade.expiresAt,
          trade.acceptedAt,
          trade.acceptedBy,
          trade.cancelledAt || null,
        ],
      );
    }
    for (const event of state.analytics?.events || []) {
      await client.query(
        `INSERT INTO kalpi_events (event_id, type, session_token, payload, recorded_at)
         VALUES ($1,$2,$3,$4::jsonb,$5)
         ON CONFLICT (event_id) DO NOTHING`,
        [
          event.eventId || randomUUID(),
          event.type,
          event.sessionToken || null,
          JSON.stringify(event),
          event.recordedAt,
        ],
      );
    }
    for (const [factionId, packs] of Object.entries(state.factions || {})) {
      await client.query(
        `INSERT INTO kalpi_factions (faction_id, packs) VALUES ($1,$2)
         ON CONFLICT (faction_id) DO UPDATE SET packs = EXCLUDED.packs`,
        [factionId, packs],
      );
    }
    return studioConfig || null;
  }

  async insertSessionRow(client, token, session) {
    await client.query(
      `INSERT INTO kalpi_sessions (
         token, display_name, avatar_id, created_at, next_daily_at, dry_packs, pack_count,
         faction_id, trade_count, idle_anchor_at, next_idle_at, idle_duplicate_streak,
         idle_pull_count, highest_rank, quiz_won_day, extras
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)
       ON CONFLICT (token) DO NOTHING`,
      [
        token,
        session.displayName,
        session.avatarId || "kid-boy",
        session.createdAt,
        session.nextDailyAt,
        session.dryPacks || 0,
        session.packCount || 0,
        session.factionId,
        session.tradeCount || 0,
        session.idleAnchorAt,
        session.nextIdleAt,
        session.idleDuplicateStreak || 0,
        session.idlePullCount || 0,
        session.highestRank || 1,
        session.quizWonDay,
        JSON.stringify(extrasFromSession(session)),
      ],
    );
    for (const [cardId, copies] of Object.entries(session.inventory || {})) {
      if (!copies) continue;
      await client.query(
        `INSERT INTO kalpi_inventory (session_token, card_id, copies)
         VALUES ($1,$2,$3)
         ON CONFLICT (session_token, card_id) DO UPDATE SET copies = EXCLUDED.copies`,
        [token, cardId, copies],
      );
    }
    for (const instance of session.instances || []) {
      await client.query(
        `INSERT INTO kalpi_instances (
           instance_id, session_token, card_id, finish, pulled_at, is_new, acquired_by, seen_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (instance_id) DO NOTHING`,
        [
          instance.instanceId,
          token,
          instance.cardId,
          instance.finish,
          instance.pulledAt,
          Boolean(instance.isNew),
          instance.acquiredBy || null,
          instance.seenAt || null,
        ],
      );
    }
    for (const pack of session.packs || []) {
      await client.query(
        `INSERT INTO kalpi_packs (pack_id, session_token, mode, pulled_at, next_daily_at, cards)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)
         ON CONFLICT (pack_id) DO NOTHING`,
        [
          pack.packId,
          token,
          pack.mode || null,
          pack.pulledAt,
          pack.nextDailyAt || null,
          JSON.stringify(pack.cards || []),
        ],
      );
    }
  }

  async persist() {
    return undefined;
  }

  async refresh() {
    (this.requestSessions.getStore() || this.sessionCache).clear();
  }

  async health() {
    await this.pool.query("SELECT 1");
    return { ok: true, backend: "postgres" };
  }

  async hydrateSession(token) {
    if (!token) return null;
    const sessions = this.requestSessions.getStore() || this.sessionCache;
    if (sessions.has(token)) return sessions.get(token);
    const session = await this.loadSession(token);
    return session ? this.remember(token, session) : null;
  }

  getSession(token) {
    const sessions = this.requestSessions.getStore() || this.sessionCache;
    return token ? sessions.get(token) ?? null : null;
  }

  async loadSession(token, { forUpdate = false } = {}) {
    if (!token) return null;
    const lock = forUpdate ? " FOR UPDATE OF session" : "";
    const sessionResult = await this.executor().query(
      `SELECT
         session.*,
         COALESCE((
           SELECT jsonb_object_agg(inventory.card_id, inventory.copies)
           FROM kalpi_inventory AS inventory
           WHERE inventory.session_token = session.token
         ), '{}'::jsonb) AS inventory_state,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'instanceId', instance.instance_id,
             'cardId', instance.card_id,
             'finish', instance.finish,
             'pulledAt', instance.pulled_at,
             'isNew', instance.is_new,
             'acquiredBy', instance.acquired_by,
             'seenAt', instance.seen_at
           ) ORDER BY instance.pulled_at ASC)
           FROM kalpi_instances AS instance
           WHERE instance.session_token = session.token
         ), '[]'::jsonb) AS instance_state,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'packId', pack.pack_id,
             'mode', pack.mode,
             'pulledAt', pack.pulled_at,
             'nextDailyAt', pack.next_daily_at,
             'cards', pack.cards
           ) ORDER BY pack.pulled_at ASC)
           FROM kalpi_packs AS pack
           WHERE pack.session_token = session.token
         ), '[]'::jsonb) AS pack_state
       FROM kalpi_sessions AS session
       WHERE session.token = $1${lock}`,
      [token],
    );
    const row = sessionResult.rows[0];
    if (!row) return null;
    const extras = row.extras || {};
    return {
      displayName: row.display_name,
      avatarId: row.avatar_id,
      createdAt: iso(row.created_at),
      nextDailyAt: iso(row.next_daily_at),
      dryPacks: row.dry_packs,
      packCount: row.pack_count,
      inventory: row.inventory_state || {},
      instances: row.instance_state.map((item) => ({
        ...item,
        pulledAt: iso(item.pulledAt),
        seenAt: iso(item.seenAt),
      })),
      packs: row.pack_state.map((item) => ({
        ...item,
        pulledAt: iso(item.pulledAt),
        nextDailyAt: iso(item.nextDailyAt),
        cards: item.cards || [],
      })),
      eventCounts: extras.eventCounts || {},
      factionId: row.faction_id,
      tradeCount: row.trade_count,
      eventClaims: extras.eventClaims || {},
      favorites: extras.favorites || [],
      idleAnchorAt: iso(row.idle_anchor_at),
      nextIdleAt: iso(row.next_idle_at),
      unseenPulls: extras.unseenPulls || [],
      preparedPulls: extras.preparedPulls || [],
      idleDuplicateStreak: row.idle_duplicate_streak,
      idlePullCount: row.idle_pull_count,
      highestRank: row.highest_rank,
      claimedRankRewards: extras.claimedRankRewards || [],
      pendingRankRewards: extras.pendingRankRewards || [],
      quizWonDay: row.quiz_won_day,
      currentQuiz: extras.currentQuiz || null,
    };
  }

  async saveSession(token, session, previous) {
    if (!previous) throw new Error("SESSION_SNAPSHOT_REQUIRED");
    const client = this.executor();
    const deltas = sessionDeltas(previous, session);
    const hasCollectionChanges = [
      deltas.inventoryUpserts,
      deltas.inventoryDeletes,
      deltas.instanceUpserts,
      deltas.instanceDeletes,
      deltas.packUpserts,
      deltas.packDeletes,
    ].some(({ length }) => length);
    if (!deltas.sessionChanged && !hasCollectionChanges) {
      this.remember(token, session);
      return;
    }
    await client.query(
      `WITH session_update AS (
         UPDATE kalpi_sessions SET
           display_name = $2,
           avatar_id = $3,
           next_daily_at = $4,
           dry_packs = $5,
           pack_count = $6,
           faction_id = $7,
           trade_count = $8,
           idle_anchor_at = $9,
           next_idle_at = $10,
           idle_duplicate_streak = $11,
           idle_pull_count = $12,
           highest_rank = $13,
           quiz_won_day = $14,
           extras = $15::jsonb,
           updated_at = NOW()
         WHERE token = $1
         RETURNING token
       ),
       inventory_input AS (
         SELECT item->>'cardId' AS card_id, (item->>'copies')::integer AS copies
         FROM jsonb_array_elements($16::jsonb) AS item
       ),
       inventory_upsert AS (
         INSERT INTO kalpi_inventory (session_token, card_id, copies)
         SELECT $1, card_id, copies FROM inventory_input
         ON CONFLICT (session_token, card_id) DO UPDATE SET copies = EXCLUDED.copies
         RETURNING card_id
       ),
       inventory_delete AS (
         DELETE FROM kalpi_inventory
         WHERE session_token = $1 AND card_id = ANY($17::text[])
         RETURNING card_id
       ),
       instance_input AS (
         SELECT
           item->>'instanceId' AS instance_id,
           item->>'cardId' AS card_id,
           item->>'finish' AS finish,
           (item->>'pulledAt')::timestamptz AS pulled_at,
           COALESCE((item->>'isNew')::boolean, false) AS is_new,
           NULLIF(item->>'acquiredBy', '') AS acquired_by,
           NULLIF(item->>'seenAt', '')::timestamptz AS seen_at
         FROM jsonb_array_elements($18::jsonb) AS item
       ),
       instance_upsert AS (
         INSERT INTO kalpi_instances (
           instance_id, session_token, card_id, finish, pulled_at, is_new, acquired_by, seen_at
         )
         SELECT instance_id, $1, card_id, finish, pulled_at, is_new, acquired_by, seen_at
         FROM instance_input
         ON CONFLICT (instance_id) DO UPDATE SET
           finish = EXCLUDED.finish,
           is_new = EXCLUDED.is_new,
           acquired_by = EXCLUDED.acquired_by,
           seen_at = EXCLUDED.seen_at
         RETURNING instance_id
       ),
       instance_delete AS (
         DELETE FROM kalpi_instances
         WHERE session_token = $1 AND instance_id = ANY($19::text[])
         RETURNING instance_id
       ),
       pack_input AS (
         SELECT
           item->>'packId' AS pack_id,
           NULLIF(item->>'mode', '') AS mode,
           (item->>'pulledAt')::timestamptz AS pulled_at,
           NULLIF(item->>'nextDailyAt', '')::timestamptz AS next_daily_at,
           COALESCE(item->'cards', '[]'::jsonb) AS cards
         FROM jsonb_array_elements($20::jsonb) AS item
       ),
       pack_upsert AS (
         INSERT INTO kalpi_packs (pack_id, session_token, mode, pulled_at, next_daily_at, cards)
         SELECT pack_id, $1, mode, pulled_at, next_daily_at, cards FROM pack_input
         ON CONFLICT (pack_id) DO UPDATE SET
           mode = EXCLUDED.mode,
           next_daily_at = EXCLUDED.next_daily_at,
           cards = EXCLUDED.cards
         RETURNING pack_id
       ),
       pack_delete AS (
         DELETE FROM kalpi_packs
         WHERE session_token = $1 AND pack_id = ANY($21::text[])
         RETURNING pack_id
       )
       SELECT token FROM session_update`,
      [
        token,
        session.displayName,
        session.avatarId || "kid-boy",
        session.nextDailyAt,
        session.dryPacks || 0,
        session.packCount || 0,
        session.factionId,
        session.tradeCount || 0,
        session.idleAnchorAt,
        session.nextIdleAt,
        session.idleDuplicateStreak || 0,
        session.idlePullCount || 0,
        session.highestRank || 1,
        session.quizWonDay,
        JSON.stringify(extrasFromSession(session)),
        JSON.stringify(deltas.inventoryUpserts),
        deltas.inventoryDeletes,
        JSON.stringify(deltas.instanceUpserts),
        deltas.instanceDeletes,
        JSON.stringify(deltas.packUpserts),
        deltas.packDeletes,
      ],
    );
    this.remember(token, session);
  }

  exclusive(operation) {
    if (this.transaction.getStore()) return operation();
    return this.pool.connect().then(async (client) => {
      try {
        await client.query("BEGIN");
        const result = await this.transaction.run(client, operation);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });
  }

  async createSession(now) {
    return this.exclusive(async () => {
      const token = randomUUID();
      const session = emptySession(token, now);
      await this.insertSessionRow(this.executor(), token, session);
      this.remember(token, session);
      return token;
    });
  }

  async withSession(token, mutator) {
    const run = async () => {
      const session = await this.loadSession(token, { forUpdate: true });
      if (!session) return null;
      const previous = structuredClone(session);
      const result = await mutator(session);
      await this.saveSession(token, session, previous);
      return result;
    };
    return this.transaction.getStore() ? run() : this.exclusive(run);
  }

  async idempotent(token, key, route, operation) {
    if (!key) return { ...(await operation()), replayed: false };
    return this.exclusive(async () => {
      await this.executor().query(
        "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
        [token, key],
      );
      const existing = await this.executor().query(
        `SELECT route, response_status, response_body
         FROM kalpi_idempotency
         WHERE session_token = $1 AND idempotency_key = $2`,
        [token, key],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].route !== route) {
          return { status: 409, body: { error: "IDEMPOTENCY_KEY_REUSED" }, replayed: true };
        }
        return {
          status: existing.rows[0].response_status,
          body: existing.rows[0].response_body,
          replayed: true,
        };
      }
      const result = await operation();
      await this.executor().query(
        `INSERT INTO kalpi_idempotency (
           session_token, idempotency_key, route, response_status, response_body
         ) VALUES ($1,$2,$3,$4,$5::jsonb)`,
        [token, key, route, result.status, JSON.stringify(result.body)],
      );
      return { ...result, replayed: false };
    });
  }

  async submitReport(report) {
    const result = await this.executor().query(
      `INSERT INTO kalpi_reports (
         report_id, session_token, card_id, category, details, page_path,
         status, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,'open',$7,$7)
       ON CONFLICT (report_id) DO NOTHING
       RETURNING report_id`,
      [
        report.reportId,
        report.sessionToken,
        report.cardId,
        report.category,
        report.details,
        report.pagePath,
        report.createdAt,
      ],
    );
    return { reportId: report.reportId, queued: true, replayed: result.rowCount === 0 };
  }

  async listReports() {
    const result = await this.pool.query(
      `SELECT report_id, card_id, category, details, page_path, status,
              reviewer_note, created_at, updated_at
       FROM kalpi_reports
       ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END,
                created_at ASC
       LIMIT 500`,
    );
    return result.rows.map((row) => ({
      reportId: row.report_id,
      cardId: row.card_id,
      category: row.category,
      details: row.details,
      pagePath: row.page_path,
      status: row.status,
      reviewerNote: row.reviewer_note,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    }));
  }

  async updateReport(reportId, status, reviewerNote, updatedAt) {
    const result = await this.pool.query(
      `UPDATE kalpi_reports
       SET status = $2, reviewer_note = $3, updated_at = $4
       WHERE report_id = $1
       RETURNING report_id`,
      [reportId, status, reviewerNote, updatedAt],
    );
    return result.rowCount > 0;
  }

  async recordEvent(event) {
    const eventId = event.eventId || randomUUID();
    const result = await this.executor().query(
      `WITH inserted AS (
         INSERT INTO kalpi_events (event_id, type, session_token, payload, recorded_at)
         VALUES ($1,$2,$3,$4::jsonb,$5)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING 1
       )
       UPDATE kalpi_sessions
       SET extras = jsonb_set(
         extras,
         ARRAY['eventCounts', $2],
         to_jsonb(COALESCE((extras #>> ARRAY['eventCounts', $2])::integer, 0) + 1),
         true
       )
       WHERE token = $3 AND EXISTS (SELECT 1 FROM inserted)
       RETURNING token`,
      [
        eventId,
        event.type,
        event.sessionToken || null,
        JSON.stringify(event),
        event.recordedAt,
      ],
    );
    const cached = this.getSession(event.sessionToken);
    if (result.rowCount && cached) {
      cached.eventCounts[event.type] = (cached.eventCounts[event.type] ?? 0) + 1;
    }
    return event;
  }

  async activitySummary() {
    const counts = {};
    const events = await this.pool.query(
      "SELECT type, session_token FROM kalpi_events ORDER BY recorded_at DESC LIMIT 5000",
    );
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

  async setFaction(token, factionId) {
    return this.withSession(token, (session) => {
      session.factionId = factionId;
      return factionId;
    });
  }

  async setDisplayName(token, displayName) {
    return this.withSession(token, (session) => {
      session.displayName = displayName;
      return displayName;
    });
  }

  async setAvatar(token, avatarId) {
    return this.withSession(token, (session) => {
      session.avatarId = avatarId;
      return avatarId;
    });
  }

  async incrementFaction(factionId, amount = 1) {
    if (!factionId) return;
    await this.executor().query(
      `INSERT INTO kalpi_factions (faction_id, packs) VALUES ($1,$2)
       ON CONFLICT (faction_id) DO UPDATE SET packs = kalpi_factions.packs + EXCLUDED.packs`,
      [factionId, amount],
    );
  }

  async createTrade({ sessionToken, offeredCardId, wantedCardId, createdAt, expiresAt }) {
    return this.exclusive(async () => {
      const session = await this.loadSession(sessionToken, { forUpdate: true });
      if (!session || !session.inventory[offeredCardId] || offeredCardId === wantedCardId) return null;
      const reserved = await this.executor().query(
        `SELECT COUNT(*)::int AS count FROM kalpi_trades
         WHERE owner_token = $1 AND offered_card_id = $2 AND status = 'open' AND expires_at > $3`,
        [sessionToken, offeredCardId, createdAt],
      );
      if ((session.inventory[offeredCardId] ?? 0) <= reserved.rows[0].count) return null;
      const trade = {
        tradeId: randomUUID(),
        ownerToken: sessionToken,
        offeredCardId,
        wantedCardId,
        status: "open",
        createdAt,
        expiresAt,
        acceptedAt: null,
        acceptedBy: null,
      };
      await this.executor().query(
        `INSERT INTO kalpi_trades (
           trade_id, owner_token, offered_card_id, wanted_card_id, status, created_at, expires_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [trade.tradeId, sessionToken, offeredCardId, wantedCardId, "open", createdAt, expiresAt],
      );
      return trade;
    });
  }

  async simulateTradeMatch({ tradeId, sessionToken, acceptedAt, finish }) {
    return this.exclusive(async () => {
      const tradeRow = await this.executor().query(
        "SELECT * FROM kalpi_trades WHERE trade_id = $1 FOR UPDATE",
        [tradeId],
      );
      const trade = this.tradeFromRow(tradeRow.rows[0]);
      const session = await this.loadSession(sessionToken, { forUpdate: true });
      if (!trade || trade.ownerToken !== sessionToken || trade.status !== "open" || !session?.inventory[trade.offeredCardId]) {
        return null;
      }
      const previous = structuredClone(session);
      session.inventory[trade.offeredCardId] -= 1;
      if (!session.inventory[trade.offeredCardId]) delete session.inventory[trade.offeredCardId];
      session.inventory[trade.wantedCardId] = (session.inventory[trade.wantedCardId] ?? 0) + 1;
      session.instances.push({
        instanceId: randomUUID(),
        cardId: trade.wantedCardId,
        finish,
        pulledAt: acceptedAt,
        isNew: session.inventory[trade.wantedCardId] === 1,
        acquiredBy: "simulated-trade",
      });
      session.tradeCount += 1;
      trade.status = "matched-demo";
      trade.acceptedAt = acceptedAt;
      trade.acceptedBy = "simulated-matching-user";
      await this.saveSession(sessionToken, session, previous);
      await this.executor().query(
        `UPDATE kalpi_trades SET status = $2, accepted_at = $3, accepted_by = $4 WHERE trade_id = $1`,
        [tradeId, trade.status, trade.acceptedAt, trade.acceptedBy],
      );
      return trade;
    });
  }

  async acceptTrade({ tradeId, sessionToken, acceptedAt, offeredFinish, wantedFinish }) {
    return this.exclusive(async () => {
      const tradeRow = await this.executor().query(
        "SELECT * FROM kalpi_trades WHERE trade_id = $1 FOR UPDATE",
        [tradeId],
      );
      const trade = this.tradeFromRow(tradeRow.rows[0]);
      if (!trade || trade.status !== "open" || Date.parse(trade.expiresAt || 0) <= Date.parse(acceptedAt) || trade.ownerToken === sessionToken) {
        return null;
      }
      for (const lockToken of [trade.ownerToken, sessionToken].sort()) {
        await this.loadSession(lockToken, { forUpdate: true });
      }
      const owner = await this.loadSession(trade.ownerToken);
      const accepter = await this.loadSession(sessionToken);
      if (!owner?.inventory[trade.offeredCardId] || !accepter?.inventory[trade.wantedCardId]) return null;
      const previousOwner = structuredClone(owner);
      const previousAccepter = structuredClone(accepter);
      const transfer = (from, to, cardId, finish, acquiredBy) => {
        from.inventory[cardId] -= 1;
        if (!from.inventory[cardId]) delete from.inventory[cardId];
        const isNew = !to.inventory[cardId];
        to.inventory[cardId] = (to.inventory[cardId] ?? 0) + 1;
        to.instances.push({
          instanceId: randomUUID(),
          cardId,
          finish,
          pulledAt: acceptedAt,
          isNew,
          acquiredBy,
        });
      };
      transfer(owner, accepter, trade.offeredCardId, offeredFinish, "trade-accepted");
      transfer(accepter, owner, trade.wantedCardId, wantedFinish, "trade-accepted");
      owner.tradeCount += 1;
      accepter.tradeCount += 1;
      trade.status = "accepted";
      trade.acceptedAt = acceptedAt;
      trade.acceptedBy = sessionToken;
      await this.saveSession(trade.ownerToken, owner, previousOwner);
      await this.saveSession(sessionToken, accepter, previousAccepter);
      await this.executor().query(
        `UPDATE kalpi_trades SET status = $2, accepted_at = $3, accepted_by = $4 WHERE trade_id = $1`,
        [tradeId, trade.status, trade.acceptedAt, trade.acceptedBy],
      );
      return trade;
    });
  }

  async expireTrades(currentAt) {
    const result = await this.pool.query(
      `UPDATE kalpi_trades SET status = 'expired'
       WHERE status = 'open' AND expires_at <= $1`,
      [currentAt],
    );
    return result.rowCount > 0;
  }

  async cancelTrade({ tradeId, sessionToken, cancelledAt }) {
    return this.exclusive(async () => {
      const result = await this.executor().query(
        `UPDATE kalpi_trades
         SET status = 'cancelled', cancelled_at = $3
         WHERE trade_id = $1 AND owner_token = $2 AND status = 'open'
         RETURNING *`,
        [tradeId, sessionToken, cancelledAt],
      );
      return this.tradeFromRow(result.rows[0]);
    });
  }

  tradeFromRow(row) {
    if (!row) return null;
    return {
      tradeId: row.trade_id,
      ownerToken: row.owner_token,
      offeredCardId: row.offered_card_id,
      wantedCardId: row.wanted_card_id,
      status: row.status,
      createdAt: iso(row.created_at),
      expiresAt: iso(row.expires_at),
      acceptedAt: iso(row.accepted_at),
      acceptedBy: row.accepted_by,
      cancelledAt: iso(row.cancelled_at),
    };
  }

  async listTrades(token) {
    const current = token ? await this.hydrateSession(token) : null;
    const result = await this.pool.query(
      `SELECT t.*, owner.display_name AS owner_label
       FROM kalpi_trades t
       JOIN kalpi_sessions owner ON owner.token = t.owner_token
       WHERE t.status = 'open' OR t.owner_token = $1 OR t.accepted_by = $1
       ORDER BY t.created_at DESC
       LIMIT 100`,
      [token],
    );
    const offeredIds = result.rows
      .filter((row) => row.status === "open" && row.owner_token !== token)
      .map((row) => row.offered_card_id);
    const ownerHasOffered = new Map();
    if (offeredIds.length) {
      const owners = await this.pool.query(
        `SELECT session_token, card_id FROM kalpi_inventory
         WHERE (session_token, card_id) IN (
           SELECT owner_token, offered_card_id FROM kalpi_trades
           WHERE status = 'open' AND owner_token <> $1
         )`,
        [token],
      );
      for (const row of owners.rows) ownerHasOffered.set(`${row.session_token}:${row.card_id}`, true);
    }
    return result.rows.map((row) => {
      const trade = this.tradeFromRow(row);
      const { ownerToken, acceptedBy, ...publicTrade } = trade;
      return {
        ...publicTrade,
        ownerLabel: row.owner_label || "שחקן קְלָפִי",
        ownedByCurrent: ownerToken === token,
        acceptedByCurrent: acceptedBy === token,
        canAccept: trade.status === "open"
          && ownerToken !== token
          && Boolean(ownerHasOffered.get(`${ownerToken}:${trade.offeredCardId}`))
          && Boolean(current?.inventory[trade.wantedCardId]),
      };
    });
  }

  async leaderboardSummary(cards = [], now = Date.now(), currentToken = null) {
    const cardsById = new Map(cards.map((card) => [card.id, card]));
    const sessions = await this.pool.query(
      `SELECT s.token, s.display_name, s.idle_pull_count, s.pack_count,
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
          stars: Object.keys(inventory).reduce((sum, cardId) => sum + cardStars(cardsById.get(cardId)), 0),
          packs: row.idle_pull_count ?? row.pack_count,
          current: row.token === currentToken,
        };
      })
      .sort((a, b) => b.stars - a.stars || b.ownedUnique - a.ownedUnique || b.packs - a.packs)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
    const collectors = allCollectors.slice(0, 8);
    const currentCollector = allCollectors.find(({ current }) => current);
    if (currentCollector && !collectors.some(({ current }) => current)) collectors.splice(7, 1, currentCollector);

    const factionRows = await this.pool.query(
      "SELECT faction_id, packs FROM kalpi_factions ORDER BY packs DESC",
    );
    const factions = factionRows.rows.map((row) => ({ partyId: row.faction_id, packs: row.packs }));

    const partyIds = [...new Set(cards.filter(({ set }) => set !== "SYS" && !String(set).startsWith("special-")).map(({ set }) => set))].sort();
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(now));
    const dayNumber = [...day].reduce((sum, character) => sum + character.charCodeAt(0), 0);
    const targetPartyId = partyIds.length ? partyIds[dayNumber % partyIds.length] : null;
    const packRows = await this.pool.query(
      `SELECT p.session_token, s.display_name, p.cards
       FROM kalpi_packs p
       JOIN kalpi_sessions s ON s.token = p.session_token
       WHERE (p.pulled_at AT TIME ZONE 'Asia/Jerusalem')::date = $1::date`,
      [day],
    );
    const dailyCounts = new Map();
    for (const row of packRows.rows) {
      const existing = dailyCounts.get(row.session_token) || {
        label: row.display_name,
        current: row.session_token === currentToken,
        cards: 0,
      };
      existing.cards += (row.cards || []).filter((instance) => cardsById.get(instance.cardId)?.set === targetPartyId).length;
      dailyCounts.set(row.session_token, existing);
    }
    if (currentToken && !dailyCounts.has(currentToken)) {
      const current = sessions.rows.find((row) => row.token === currentToken);
      dailyCounts.set(currentToken, {
        label: current?.display_name || "שחקן קְלָפִי",
        current: true,
        cards: 0,
      });
    }
    const allDailyParty = [...dailyCounts.values()].sort((a, b) => b.cards - a.cards);
    const dailyParty = allDailyParty.slice(0, 8);
    const currentDaily = allDailyParty.find(({ current }) => current);
    if (currentDaily && !dailyParty.some(({ current }) => current)) dailyParty.splice(7, 1, currentDaily);
    const targetPartyNameHe = cards.find((card) => card.set === targetPartyId)?.setNameHe || targetPartyId;
    return {
      collectors,
      factions,
      dailyChallenge: { day, targetPartyId, targetPartyNameHe, leaders: dailyParty },
      fixture: false,
      label: "Real activity in this local PoC",
    };
  }

  async getStudioConfig() {
    const result = await this.pool.query("SELECT config FROM kalpi_studio_config WHERE id = 1");
    return result.rows[0]?.config || null;
  }

  async saveStudioConfig(config) {
    await this.pool.query(
      `INSERT INTO kalpi_studio_config (id, config, updated_at)
       VALUES (1, $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW()`,
      [JSON.stringify(config || {})],
    );
    return config;
  }

  async close() {
    await this.pool.end();
  }
}
