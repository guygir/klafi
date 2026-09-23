/** Climb from rank n to n+1 costs n+1 unique cards: +2, +3, +4, +5… */
export function climbCost(fromLevel) {
  return Math.max(1, Math.round(Number(fromLevel) || 1)) + 1;
}

export function levelThresholds(_eligibleCount, totalLevels) {
  const levels = Math.max(2, Math.round(Number(totalLevels) || 2));
  let needed = 0;
  return Array.from({ length: levels }, (_, index) => {
    if (index === 0) return 0;
    needed += index + 1;
    return needed;
  });
}

export function rankAt(uniqueCount, totalLevels = 14) {
  const owned = Math.max(0, Math.round(Number(uniqueCount) || 0));
  return levelThresholds(owned, totalLevels).reduce((rank, need, index) => (
    owned >= need ? index + 1 : rank
  ), 1);
}
