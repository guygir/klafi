ALTER TABLE kalpi_trades
  ADD COLUMN IF NOT EXISTS offered_mode TEXT NOT NULL DEFAULT 'and',
  ADD COLUMN IF NOT EXISTS wanted_mode TEXT NOT NULL DEFAULT 'and',
  ADD COLUMN IF NOT EXISTS offered_card_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS wanted_card_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS accepted_offered_card_id TEXT,
  ADD COLUMN IF NOT EXISTS accepted_wanted_card_id TEXT;

UPDATE kalpi_trades
SET
  offered_card_ids = CASE
    WHEN jsonb_array_length(offered_card_ids) = 0 AND offered_card_id IS NOT NULL
      THEN jsonb_build_array(offered_card_id)
    ELSE offered_card_ids
  END,
  wanted_card_ids = CASE
    WHEN jsonb_array_length(wanted_card_ids) = 0 AND wanted_card_id IS NOT NULL
      THEN jsonb_build_array(wanted_card_id)
    ELSE wanted_card_ids
  END
WHERE offered_card_id IS NOT NULL OR wanted_card_id IS NOT NULL;
