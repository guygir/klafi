CREATE TABLE IF NOT EXISTS kalpi_card_holder_snapshot (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  holders JSONB NOT NULL DEFAULT '{}'::jsonb,
  numbered_holders JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ
);
