/**
 * Binder badge strip order: when only some medals fit, the best go first. Earned badges only,
 * hard > medium > simple, then the most recently earned (earnedAt), then catalog order.
 */
const TIER_RANK = Object.freeze({ hard: 0, medium: 1, simple: 2 });

export function binderBadgeOrder(badges = []) {
  return badges
    .map((badge, index) => ({ badge, index }))
    .filter(({ badge }) => badge?.earned)
    .sort((left, right) => {
      const tier = (TIER_RANK[left.badge.tier] ?? 2) - (TIER_RANK[right.badge.tier] ?? 2);
      if (tier) return tier;
      const leftAt = Date.parse(left.badge.earnedAt || "") || 0;
      const rightAt = Date.parse(right.badge.earnedAt || "") || 0;
      return rightAt - leftAt || left.index - right.index;
    })
    .map(({ badge }) => badge);
}
