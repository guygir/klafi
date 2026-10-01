ALTER TABLE kalpi_numbered_issued
  ADD COLUMN IF NOT EXISTS remaining JSONB;
