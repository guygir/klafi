CREATE TABLE IF NOT EXISTS kalpi_idempotency (
  session_token TEXT NOT NULL REFERENCES kalpi_sessions(token) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  route TEXT NOT NULL,
  response_status SMALLINT NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_token, idempotency_key)
);
CREATE INDEX IF NOT EXISTS kalpi_idempotency_created_idx
  ON kalpi_idempotency (created_at);

CREATE TABLE IF NOT EXISTS kalpi_reports (
  report_id TEXT PRIMARY KEY,
  session_token TEXT REFERENCES kalpi_sessions(token) ON DELETE SET NULL,
  card_id TEXT,
  category TEXT NOT NULL,
  details TEXT NOT NULL,
  page_path TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  reviewer_note TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS kalpi_reports_queue_idx
  ON kalpi_reports (status, created_at);
