/** Climb from rank n to n+1 costs n+1 unique cards: +2, +3, +4, +5… */
export function climbCost(fromLevel) {
  return Math.max(1, Math.round(Number(fromLevel) || 1)) + 1;
}

/**
 * Hand-set thresholds that replace the +n formula for a given level (1-based).
 * Level 15 ראש הממשלה sits at 120 on purpose (the formula would give 119).
 * Keyed by level, so a config with fewer levels simply never reaches the override.
 */
export const DEFAULT_THRESHOLD_OVERRIDES = Object.freeze({ 15: 120 });

export function normalizeThresholdOverrides(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_THRESHOLD_OVERRIDES;
  const result = {};
  for (const [level, need] of Object.entries(value)) {
    const lvl = Math.round(Number(level));
    const n = Math.round(Number(need));
    if (Number.isInteger(lvl) && lvl >= 2 && lvl <= 24 && Number.isInteger(n) && n >= 1 && n <= 10000) result[lvl] = n;
  }
  return Object.freeze(result);
}

export function levelThresholds(_eligibleCount, totalLevels, overrides = DEFAULT_THRESHOLD_OVERRIDES) {
  const levels = Math.max(2, Math.round(Number(totalLevels) || 2));
  const fixed = normalizeThresholdOverrides(overrides);
  let needed = 0;
  return Array.from({ length: levels }, (_, index) => {
    if (index === 0) return 0;
    const formula = needed + index + 1;
    const override = fixed[index + 1];
    // An override can move a level up or down, but never at or below the level before it.
    needed = override !== undefined ? Math.max(needed + 1, override) : formula;
    return needed;
  });
}

export function rankAt(uniqueCount, totalLevels = 15, overrides = DEFAULT_THRESHOLD_OVERRIDES) {
  const owned = Math.max(0, Math.round(Number(uniqueCount) || 0));
  return levelThresholds(owned, totalLevels, overrides).reduce((rank, need, index) => (
    owned >= need ? index + 1 : rank
  ), 1);
}
