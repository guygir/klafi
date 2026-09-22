-- issued now counts eligible idle grants, not minted stamps.
-- Existing stamp-count rows (live SET5-06 issued=1) become already-consumed
-- numbered slots at the default interval of 30, so the next mint is #2 at 60.
UPDATE kalpi_numbered_issued
SET issued = issued * 30
WHERE issued > 0 AND issued < 30;
