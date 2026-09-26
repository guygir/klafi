-- Daily race reads cards opened today: seen_at in [Jerusalem midnight, next midnight).
-- Partial index: unopened instances (seen_at NULL) are never read by the race.
-- Plain CREATE INDEX (not CONCURRENTLY): the session-pooler runner wraps each migration
-- in BEGIN/COMMIT and CONCURRENTLY cannot run inside a transaction block (or a DO block).
-- It holds a SHARE lock on kalpi_instances while it builds, so writes (pulls, seen acks)
-- wait for the build (typically sub-second to a few seconds up to ~1M rows).
-- The DO wrapper absorbs the race between two cold starts on the transaction pooler
-- (no advisory lock there): concurrent IF NOT EXISTS can raise a duplicate error.
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS kalpi_instances_seen_at_idx
    ON kalpi_instances (seen_at)
    WHERE seen_at IS NOT NULL;
EXCEPTION
  WHEN duplicate_table OR unique_violation THEN NULL;
END
$$;
