const IDLE_CAPACITY = 8;

export function slimPublicState(session, shell, now = Date.now()) {
  const idleIds = new Set(shell.idleCardIds || []);
  const inventory = session.inventory || {};
  const unique = Object.keys(inventory).filter((id) => idleIds.has(id)).length;
  const ranks = shell.gameConfig?.progression?.rankNames || ["אזרח סקרן"];
  const increments = shell.gameConfig?.progression?.releaseLevelIncrements || {};
  const configuredLevels = Object.values(increments).reduce((sum, value) => sum + Math.max(0, Math.round(Number(value) || 0)), 0);
  const totalLevels = Math.max(2, Math.min(ranks.length, configuredLevels || ranks.length));
  const exponent = Math.max(0.5, Math.min(3, Number(shell.gameConfig?.progression?.thresholdExponent) || 1.2));
  const idleTotal = idleIds.size || shell.totals?.idleEligible || 1;
  const thresholds = Array.from({ length: totalLevels }, (_, index) => (
    index === 0 ? 0 : Math.ceil(idleTotal * (index === totalLevels - 1 ? 1 : (index / (totalLevels - 1)) ** exponent))
  ));
  const computedLevel = thresholds.reduce((result, threshold, index) => unique >= threshold ? index + 1 : result, 1);
  const level = Math.max(computedLevel, Math.min(ranks.length, session.highestRank || 1));
  const capped = Math.min(level, totalLevels);
  const start = thresholds[capped - 1] ?? 0;
  const target = level < totalLevels ? thresholds[level] : thresholds[totalLevels - 1];
  const avatars = (shell.gameConfig?.avatars || []).map((avatar) => ({
    ...avatar,
    unlocked: level >= (avatar.unlockLevel || 1),
    selected: session.avatarId === avatar.id,
  }));
  return {
    displayName: session.displayName,
    createdAt: session.createdAt,
    avatarId: session.avatarId || "kid-boy",
    avatars,
    ownedUnique: unique,
    ownedUniqueAll: Object.keys(inventory).length,
    totalCards: idleTotal,
    unseenCount: session.unseenPulls?.length ?? 0,
    preparedPulls: session.preparedPulls || [],
    idleCapacity: IDLE_CAPACITY,
    nextIdleAt: session.nextIdleAt,
    packAvailable: Boolean((session.unseenPulls || []).length),
    highestRank: session.highestRank || 1,
    progression: {
      level,
      totalLevels,
      campaignLevels: ranks.length,
      rank: ranks[level - 1] || ranks[0],
      nextRank: level < totalLevels ? ranks[level] : null,
      unique,
      start,
      target,
      remaining: Math.max(0, target - unique),
      percent: target === start ? 100 : Math.max(0, Math.min(100, Math.round(((unique - start) / (target - start)) * 100))),
      teaser: shell.gameConfig?.progression?.teaser || "האם תגיעו לדרגת ראש הממשלה?",
      pendingRewards: [...(session.pendingRankRewards || [])],
    },
    inventory: session.inventory || {},
    favorites: session.favorites || [],
    now,
  };
}
