/** Early ranks use small unique-card targets so the first days are reachable. */
export const EARLY_UNIQUE_TARGETS = Object.freeze([0, 2, 4, 7, 11, 16, 22, 30, 40, 55, 72, 92, 116]);

export function levelThresholds(eligibleCount, totalLevels, exponent = 1.2) {
  const pool = Math.max(0, Math.round(Number(eligibleCount) || 0));
  const levels = Math.max(2, Math.round(Number(totalLevels) || 2));
  const exp = Math.max(0.5, Math.min(3, Number(exponent) || 1.2));
  return Array.from({ length: levels }, (_, index) => {
    if (index === 0) return 0;
    if (index === levels - 1) return pool;
    const fromRatio = Math.ceil(pool * ((index / (levels - 1)) ** exp));
    const early = EARLY_UNIQUE_TARGETS[index];
    const capped = early == null ? fromRatio : Math.min(fromRatio, early);
    return Math.max(0, Math.min(pool, capped));
  });
}
