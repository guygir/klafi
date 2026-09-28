import { jerusalemDay, previousJerusalemDay } from "./numbered.js";

export const STREAK_CALENDAR_DAYS = 30;

/** Absolute day 1–30. Pack every 5 days. Stars = 1 Common / 2 Uncommon / 3 Rare. */
export const STREAK_REWARDS = Object.freeze({
  2: Object.freeze({ kind: "rarity", stars: 1 }),
  4: Object.freeze({ kind: "rarity", stars: 1 }),
  5: Object.freeze({ kind: "pack" }),
  6: Object.freeze({ kind: "rarity", stars: 1 }),
  8: Object.freeze({ kind: "rarity", stars: 2 }),
  10: Object.freeze({ kind: "pack" }),
  12: Object.freeze({ kind: "rarity", stars: 2 }),
  14: Object.freeze({ kind: "rarity", stars: 2 }),
  15: Object.freeze({ kind: "pack" }),
  16: Object.freeze({ kind: "rarity", stars: 2 }),
  19: Object.freeze({ kind: "rarity", stars: 3 }),
  20: Object.freeze({ kind: "pack" }),
  23: Object.freeze({ kind: "rarity", stars: 3 }),
  25: Object.freeze({ kind: "pack" }),
  28: Object.freeze({ kind: "rarity", stars: 3 }),
  30: Object.freeze({ kind: "pack" }),
});

export const STREAK_STAR_TIERS = Object.freeze({
  1: "Common",
  2: "Uncommon",
  3: "Rare",
});

export function calendarDay(streak) {
  const count = Math.max(0, Math.round(Number(streak) || 0));
  if (!count) return 0;
  return ((count - 1) % STREAK_CALENDAR_DAYS) + 1;
}

/** Absolute visit count for a cell on the current 30-day table. Day 3 of streak 33 is `streak-33`. */
export function streakAcquiredBy(visitStreak, cellDay) {
  const streak = Math.max(0, Math.round(Number(visitStreak) || 0));
  const current = calendarDay(streak);
  const day = Math.round(Number(cellDay) || 0);
  if (!current || day < 1 || day > current) return null;
  return `streak-${streak - current + day}`;
}

export function streakRewardForDay(day) {
  return STREAK_REWARDS[day] || null;
}

export function visitStreakExtras(session) {
  return {
    visitDay: session.visitDay || null,
    visitStreak: session.visitStreak || 0,
    bestVisitStreak: Math.max(Number(session.bestVisitStreak) || 0, session.visitStreak || 0),
    visitStreakClaims: Array.isArray(session.visitStreakClaims) ? session.visitStreakClaims : [],
    pendingStreakReward: session.pendingStreakReward || null,
    streakCalendarAckDay: session.streakCalendarAckDay || null,
  };
}

export function normalizeVisitStreak(session) {
  if (!session || typeof session !== "object") return session;
  session.visitDay ??= null;
  session.visitStreak ??= 0;
  session.bestVisitStreak ??= session.visitStreak;
  session.visitStreakClaims ??= [];
  session.pendingStreakReward ??= null;
  session.streakCalendarAckDay ??= null;
  return session;
}

/**
 * Visit / first-enter streak. Separate from pack-open loginStreak (achievements).
 * Consecutive Jerusalem days increment; a missed day resets to 1.
 * After day 30 the table wraps and claims start a new cycle. The fire count keeps growing.
 */
export function applyVisitStreak(session, nowMs) {
  normalizeVisitStreak(session);
  const today = jerusalemDay(nowMs);
  const dayNow = calendarDay(session.visitStreak);
  if (session.visitDay === today) {
    return { stamped: false, day: dayNow, reward: streakRewardForDay(dayNow), reset: false };
  }
  const previous = Math.max(0, Number(session.visitStreak) || 0);
  const consecutive = session.visitDay === previousJerusalemDay(nowMs);
  const next = consecutive ? previous + 1 : 1;
  const wrapped = consecutive && calendarDay(next) === 1 && previous >= STREAK_CALENDAR_DAYS;
  const reset = !consecutive || wrapped;
  if (reset) {
    session.visitStreakClaims = [];
    session.pendingStreakReward = null;
  }
  session.visitStreak = next;
  session.visitDay = today;
  session.bestVisitStreak = Math.max(Number(session.bestVisitStreak) || 0, next);
  const day = calendarDay(next);
  const reward = streakRewardForDay(day);
  return { stamped: true, day, reward, reset };
}

export function ackStreakCalendar(session) {
  if (!session?.visitDay) return false;
  if (session.streakCalendarAckDay === session.visitDay) return false;
  session.streakCalendarAckDay = session.visitDay;
  return true;
}

export function publicStreakCalendar(session) {
  const streak = Math.max(0, Number(session?.visitStreak) || 0);
  const day = calendarDay(streak);
  const claims = new Set(session?.visitStreakClaims || []);
  const today = session?.visitDay || null;
  const instances = session?.instances || [];
  return {
    streak,
    day,
    today,
    showPopup: Boolean(today && session?.streakCalendarAckDay !== today),
    days: Array.from({ length: STREAK_CALENDAR_DAYS }, (_, index) => {
      const n = index + 1;
      const reward = streakRewardForDay(n);
      const acquiredBy = streakAcquiredBy(streak, n);
      const granted = acquiredBy
        ? instances.find((item) => item?.acquiredBy === acquiredBy)
        : null;
      return {
        day: n,
        checked: day > 0 && n <= day,
        current: n === day,
        reward,
        claimed: Boolean(reward && claims.has(n)),
        opened: Boolean(granted?.seenAt),
      };
    }),
  };
}
