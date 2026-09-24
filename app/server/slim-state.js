import { collectionStarCount } from "./visible-sets.js";
import { levelThresholds } from "./progression.js";
import { IDLE_BACKLOG_CAP, IDLE_INTERVAL_MS, IDLE_STARTER_READY } from "./idle-config.js";

export function slimPublicState(session, shell, now = Date.now()) {
  const idleIds = new Set(shell.idleCardIds || []);
  const inventory = session.inventory || {};
  const unique = Object.keys(inventory).filter((id) => idleIds.has(id)).length;
  const ranks = shell.gameConfig?.progression?.rankNames || ["אזרח סקרן"];
  const totalLevels = Math.max(2, ranks.length);
  const idleTotal = idleIds.size || shell.totals?.idleEligible || 1;
  const thresholds = levelThresholds(idleTotal, totalLevels);
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
    starCount: collectionStarCount(inventory, shell.cardIndex || []),
    totalCards: idleTotal,
    unseenCount: session.unseenPulls?.length ?? 0,
    preparedPulls: session.preparedPulls || [],
    idleCapacity: IDLE_BACKLOG_CAP,
    idleIntervalMs: IDLE_INTERVAL_MS,
    idleStarterReady: IDLE_STARTER_READY,
    nextIdleAt: session.nextIdleAt,
    idlePullCount: session.idlePullCount ?? 0,
    packAvailable: Boolean((session.unseenPulls || []).length),
    highestRank: session.highestRank || 1,
    loginStreak: session.loginStreak || 0,
    factionId: session.factionId || null,
    binderSlug: session.publicBinderSlug || null,
    numberedCopies: (session.instances || []).filter((item) => Number(item?.numberedIndex) > 0),
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
      percent: target ? Math.max(0, Math.min(100, Math.round((unique / target) * 100))) : 100,
      teaser: shell.gameConfig?.progression?.teaser || "האם תגיעו לדרגת ראש הממשלה?",
      pendingRewards: [...(session.pendingRankRewards || [])],
    },
    inventory: session.inventory || {},
    favorites: session.favorites || [],
    now,
  };
}
