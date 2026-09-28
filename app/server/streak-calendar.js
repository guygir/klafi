import { jerusalemDay, previousJerusalemDay } from "./numbered.js";

export const STREAK_CALENDAR_DAYS = 30;

/** Absolute day 1–30. Pack = warehouse pull. Stars = 1 Common / 2 Uncommon / 3 Rare. */
export const STREAK_REWARDS = Object.freeze({
  3: Object.freeze({ kind: "pack" }),
  7: Object.freeze({ kind: "rarity", stars: 1 }),
  10: Object.freeze({ kind: "pack" }),
  14: Object.freeze({ kind: "rarity", stars: 2 }),
  21: Object.freeze({ kind: "pack" }),
  25: Object.freeze({ kind: "rarity", stars: 2 }),
  30: Object.freeze({ kind: "rarity", stars: 3 }),
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
    return { stamped: false, day: dayNow, reward: session.pendingStreakReward || streakRewardForDay(dayNow) };
  }
  const previous = Math.max(0, Number(session.visitStreak) || 0);
  const consecutive = session.visitDay === previousJerusalemDay(nowMs);
  const next = consecutive ? previous + 1 : 1;
  const wrapped = consecutive && calendarDay(next) === 1 && previous >= STREAK_CALENDAR_DAYS;
  if (!consecutive || wrapped) {
    session.visitStreakClaims = [];
    session.pendingStreakReward = null;
  }
  session.visitStreak = next;
  session.visitDay = today;
  session.bestVisitStreak = Math.max(Number(session.bestVisitStreak) || 0, next);
  const day = calendarDay(next);
  const reward = streakRewardForDay(day);
  const claims = new Set(session.visitStreakClaims || []);
  if (reward && !claims.has(day)) {
    session.pendingStreakReward = { day, ...reward };
  }
  return { stamped: true, day, reward: session.pendingStreakReward || reward };
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
  const pending = session?.pendingStreakReward || null;
  const today = session?.visitDay || null;
  return {
    streak,
    day,
    today,
    showPopup: Boolean(today && session?.streakCalendarAckDay !== today),
    pendingReward: pending,
    days: Array.from({ length: STREAK_CALENDAR_DAYS }, (_, index) => {
      const n = index + 1;
      const reward = streakRewardForDay(n);
      return {
        day: n,
        checked: day > 0 && n <= day,
        current: n === day,
        reward,
        claimed: Boolean(reward && claims.has(n)),
        held: Boolean(pending && pending.day === n && !claims.has(n)),
      };
    }),
  };
}
