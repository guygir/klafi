import { collectionStarCount } from "./visible-sets.js";
import { levelThresholds } from "./progression.js";
import { IDLE_BACKLOG_CAP, IDLE_INTERVAL_MS, IDLE_STARTER_READY } from "./idle-config.js";
import { publicTradeNotices } from "./trade-notices.js";
import { publicStreakCalendar } from "./streak-calendar.js";
import { referralStarGate } from "./referral.js";
import { heldNumberedCopies, regularInventory } from "./numbered.js";

export function slimPublicState(session, shell, now = Date.now()) {
  const idleIds = new Set(shell.idleCardIds || []);
  const inventory = session.inventory || {};
  // Numbered copies are not regular copies (level progress, unique counts).
  const regular = regularInventory(inventory, session.numberedByCard || {});
  const unique = Object.keys(regular).filter((id) => idleIds.has(id)).length;
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
    ownedUniqueAll: Object.keys(regular).length,
    starCount: collectionStarCount(inventory, shell.cardIndex || [], session.numberedByCard || {}),
    totalCards: idleTotal,
    unseenCount: session.unseenPulls?.length ?? 0,
    revision: Number(session.stateRevision) || 0,
    preparedPulls: session.preparedPulls || [],
    idleCapacity: IDLE_BACKLOG_CAP,
    idleIntervalMs: IDLE_INTERVAL_MS,
    idleStarterReady: IDLE_STARTER_READY,
    nextIdleAt: session.nextIdleAt,
    idlePullCount: session.idlePullCount ?? 0,
    packAvailable: Boolean((session.unseenPulls || []).length),
    highestRank: session.highestRank || 1,
    loginStreak: session.loginStreak || 0,
    visitStreak: session.visitStreak || 0,
    streakCalendar: publicStreakCalendar(session),
    factionId: session.factionId || null,
    binderSlug: session.publicBinderSlug || null,
    referralCode: session.referralCode || null,
    referralStars: referralStarGate(shell.gameConfig),
    numberedCopies: heldNumberedCopies(session),
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
    pendingTradeNotices: publicTradeNotices(session),
    inventory: session.inventory || {},
    // Binder חדש/ישן sort. Without it the first paint after a refresh falls back to set order.
    acquiredAt: session.acquiredAt && typeof session.acquiredAt === "object" ? session.acquiredAt : {},
    lastAcquiredAt: session.lastAcquiredAt && typeof session.lastAcquiredAt === "object" ? session.lastAcquiredAt : {},
    favorites: session.favorites || [],
    eventCounts: {
      source_opened: Number(session.eventCounts?.source_opened) || 0,
      share_created: Number(session.eventCounts?.share_created) || 0,
    },
    now,
  };
}
