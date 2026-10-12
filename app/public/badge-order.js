/**
 * Binder badge strip order: when only some medals fit, the best go first. Earned badges only,
 * hard > medium > simple, then the most recently earned (earnedAt), then catalog order.
 */
/** Pinned: always kept (index 0, never in the +N overflow) and drawn at the visual left end. */
export const PINNED_BADGE_ID = "numbered-first";

const TIER_RANK = Object.freeze({ hard: 0, medium: 1, simple: 2 });

export function binderBadgeOrder(badges = []) {
  return badges
    .map((badge, index) => ({ badge, index }))
    .filter(({ badge }) => badge?.earned)
    .sort((left, right) => {
      const tier = (TIER_RANK[left.badge.tier] ?? 2) - (TIER_RANK[right.badge.tier] ?? 2);
      const pinned = Number(right.badge.id === PINNED_BADGE_ID) - Number(left.badge.id === PINNED_BADGE_ID);
      if (pinned) return pinned;
      if (tier) return tier;
      const leftAt = Date.parse(left.badge.earnedAt || "") || 0;
      const rightAt = Date.parse(right.badge.earnedAt || "") || 0;
      return rightAt - leftAt || left.index - right.index;
    })
    .map(({ badge }) => badge);
}
