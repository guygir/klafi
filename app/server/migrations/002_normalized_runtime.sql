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
);

CREATE TABLE IF NOT EXISTS kalpi_instances (
  instance_id TEXT PRIMARY KEY,
  session_token TEXT NOT NULL REFERENCES kalpi_sessions(token) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  finish TEXT,
  pulled_at TIMESTAMPTZ NOT NULL,
  is_new BOOLEAN NOT NULL DEFAULT FALSE,
  acquired_by TEXT,
  seen_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS kalpi_instances_session_idx ON kalpi_instances (session_token);

CREATE TABLE IF NOT EXISTS kalpi_packs (
  pack_id TEXT PRIMARY KEY,
  session_token TEXT NOT NULL REFERENCES kalpi_sessions(token) ON DELETE CASCADE,
  mode TEXT,
  pulled_at TIMESTAMPTZ NOT NULL,
  next_daily_at TIMESTAMPTZ,
  cards JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS kalpi_packs_session_pulled_idx ON kalpi_packs (session_token, pulled_at DESC);

CREATE TABLE IF NOT EXISTS kalpi_trades (
  trade_id TEXT PRIMARY KEY,
  owner_token TEXT NOT NULL REFERENCES kalpi_sessions(token) ON DELETE CASCADE,
  offered_card_id TEXT NOT NULL,
  wanted_card_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by TEXT,
  cancelled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS kalpi_trades_status_idx ON kalpi_trades (status, expires_at);
CREATE INDEX IF NOT EXISTS kalpi_trades_owner_idx ON kalpi_trades (owner_token);

CREATE TABLE IF NOT EXISTS kalpi_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  session_token TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS kalpi_events_recorded_idx ON kalpi_events (recorded_at DESC);

CREATE TABLE IF NOT EXISTS kalpi_factions (
  faction_id TEXT PRIMARY KEY,
  packs INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS kalpi_studio_config (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
