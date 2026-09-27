-- issued counted eligible idle grants (a stamp every 30). Chance rolls now
-- increment only when a numbered copy is minted, so convert leftovers.
UPDATE kalpi_numbered_issued
SET issued = FLOOR(issued / 30)
WHERE issued > 0;
