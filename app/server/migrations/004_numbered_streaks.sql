CREATE TABLE IF NOT EXISTS kalpi_numbered_issued (
  stamp_key TEXT PRIMARY KEY,
  issued INTEGER NOT NULL CHECK (issued >= 0)
);

ALTER TABLE kalpi_instances
  ADD COLUMN IF NOT EXISTS numbered_index INTEGER,
  ADD COLUMN IF NOT EXISTS numbered_of INTEGER;
