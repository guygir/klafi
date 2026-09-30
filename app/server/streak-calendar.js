import { jerusalemDay, previousJerusalemDay } from "./numbered.js";

/** Sunday of the week that contains 30 September 2026, through election month. */
export const ELECTION_GRID_START = "2026-09-27";
export const ELECTION_GRID_END = "2026-10-31";
export const ELECTION_DAY = "2026-10-27";

const RARITY = (stars) => Object.freeze({ kind: "rarity", stars });
const PACK = Object.freeze({ kind: "pack" });

/** Even run days: 11 prizes, then 3-star, pack, pack forever. Odd days have no streak prize. */
const STREAK_REWARD_PREFIX = Object.freeze([
  RARITY(1), RARITY(1), PACK, RARITY(1), PACK, PACK, RARITY(2), PACK, PACK, RARITY(2), PACK,
]);
const STREAK_REWARD_TAIL = Object.freeze([RARITY(3), PACK, PACK]);

/**
 * Showing up on that Jerusalem date. 1/2/3 are one card of that star tier, p is one pack, n is no gift.
 * October 2026, from the 1st.
 */
const OCTOBER_DATE_PATTERN = "1,p,n,p,1,p,n,p,2,p,n,2,p,2,n,p,3,n,p,3,p,p,2,2,3,3,3,p,3,p,3";

function prizeFromToken(token) {
  if (token === "p") return PACK;
  const stars = Number(token);
  if (stars === 1 || stars === 2 || stars === 3) return RARITY(stars);
  return null;
}

function buildDatePrizes() {
  const prizes = {};
  OCTOBER_DATE_PATTERN.split(",").forEach((token, index) => {
    const reward = prizeFromToken(token);
    if (!reward) return;
    prizes[`2026-10-${String(index + 1).padStart(2, "0")}`] = reward;
  });
  return Object.freeze(prizes);
}

export const DATE_PRIZES = buildDatePrizes();

export const STREAK_STAR_TIERS = Object.freeze({
  1: "Common",
  2: "Uncommon",
  3: "Rare",
});

const DAY_MS = 24 * 60 * 60 * 1000;

function shiftJerusalemDay(iso, days) {
  const noon = Date.parse(`${iso}T12:00:00+03:00`);
  return jerusalemDay(noon + days * DAY_MS);
}

function buildElectionGridDates() {
  const dates = [];
  for (let offset = 0; offset < 40; offset += 1) {
    const date = shiftJerusalemDay(ELECTION_GRID_START, offset);
    dates.push(date);
    if (date === ELECTION_GRID_END) break;
  }
  return Object.freeze(dates);
}

export const ELECTION_GRID_DATES = buildElectionGridDates();

/** The run day itself. Streak prizes do not wrap onto a 30-day table. */
export function calendarDay(streak) {
  return Math.max(0, Math.round(Number(streak) || 0));
}

/** The prize earned when the run reached `cellDay`. Run day 6 is `streak-6`. */
export function streakAcquiredBy(visitStreak, cellDay) {
  const streak = Math.max(0, Math.round(Number(visitStreak) || 0));
  const day = Math.round(Number(cellDay) || 0);
  if (!streak || day < 1 || day > streak) return null;
  return `streak-${day}`;
}

export function datePrizeFor(date) {
  return DATE_PRIZES[date] || null;
}

export function dateAcquiredBy(date) {
  return datePrizeFor(date) ? `date-${date}` : null;
}

export function streakRewardForDay(day) {
  const count = Math.round(Number(day) || 0);
  if (count < 2 || count % 2 !== 0) return null;
  const index = count / 2 - 1;
  if (index < STREAK_REWARD_PREFIX.length) return STREAK_REWARD_PREFIX[index];
  const tail = index - STREAK_REWARD_PREFIX.length;
  return STREAK_REWARD_TAIL[tail % STREAK_REWARD_TAIL.length];
}

function validVisitDates(value) {
  const dates = new Set();
  for (const item of Array.isArray(value) ? value : []) {
    const day = String(item || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) dates.add(day);
  }
  return [...dates].sort();
}

function rememberVisit(session, day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) return;
  if (session.visitDates.includes(day)) return;
  session.visitDates = [...session.visitDates, day].sort();
}

export function visitStreakExtras(session) {
  return {
    visitDay: session.visitDay || null,
    visitDates: validVisitDates(session.visitDates),
    visitStreak: session.visitStreak || 0,
    bestVisitStreak: Math.max(Number(session.bestVisitStreak) || 0, session.visitStreak || 0),
    visitStreakClaims: Array.isArray(session.visitStreakClaims) ? session.visitStreakClaims : [],
    visitDateClaims: Array.isArray(session.visitDateClaims) ? session.visitDateClaims : [],
    pendingStreakReward: session.pendingStreakReward || null,
    streakCalendarAckDay: session.streakCalendarAckDay || null,
    streakPrizeSkipped: Boolean(session.streakPrizeSkipped),
  };
}

export function normalizeVisitStreak(session) {
  if (!session || typeof session !== "object") return session;
  session.visitDay ??= null;
  session.visitStreak ??= 0;
  session.bestVisitStreak ??= session.visitStreak;
  session.visitStreakClaims ??= [];
  session.visitDateClaims ??= [];
  session.pendingStreakReward ??= null;
  session.streakCalendarAckDay ??= null;
  session.streakPrizeSkipped = Boolean(session.streakPrizeSkipped);
  session.visitDates = validVisitDates(session.visitDates);
  if (session.visitDay && !session.visitDates.includes(session.visitDay)) {
    session.visitDates = [...session.visitDates, session.visitDay].sort();
  }
  return session;
}

/**
 * visitStreak is the run. The home flame reads it. A missed Jerusalem day resets it to 1.
 * visitDates is the set of Jerusalem dates actually stamped. It is not rebuilt from the run length.
 * A missed day resets the run. It does not erase visit dates or date-prize claims.
 * Streak prizes continue on every even run day. They do not restart after day 30.
 */
export function applyVisitStreak(session, nowMs) {
  normalizeVisitStreak(session);
  const today = jerusalemDay(nowMs);
  const dayNow = calendarDay(session.visitStreak);
  if (session.visitDay === today) {
    rememberVisit(session, today);
    return { stamped: false, day: dayNow, reward: streakRewardForDay(dayNow), reset: false };
  }
  const consecutive = session.visitDay === previousJerusalemDay(nowMs);
  const next = consecutive ? Math.max(0, Number(session.visitStreak) || 0) + 1 : 1;
  const reset = !consecutive;
  if (reset) {
    session.visitStreakClaims = [];
    session.pendingStreakReward = null;
  }
  session.visitStreak = next;
  session.visitDay = today;
  rememberVisit(session, today);
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

/** Closing the table while today's prize is still unopened. Opening the prize does not set this. */
export function noteSkippedStreakPrize(session) {
  if (!session || session.streakPrizeSkipped) return false;
  const day = calendarDay(session.visitStreak);
  if (!streakRewardForDay(day)) return false;
  if (!(session.visitStreakClaims || []).includes(day)) return false;
  const acquiredBy = streakAcquiredBy(session.visitStreak, day);
  const instance = (session.instances || []).find((item) => item?.acquiredBy === acquiredBy);
  if (!instance || instance.seenAt) return false;
  session.streakPrizeSkipped = true;
  return true;
}

function nextPrizeRunDays(streak, count) {
  const found = [];
  const start = Math.max(0, Math.round(Number(streak) || 0));
  for (let ahead = 1; ahead <= 8 && found.length < count; ahead += 1) {
    const runDay = start + ahead;
    if (streakRewardForDay(calendarDay(runDay))) found.push(runDay);
  }
  return found;
}

function ladderRung(streak, runDay, { current = false, claims, instances }) {
  const cycleDay = calendarDay(runDay);
  const reward = streakRewardForDay(cycleDay);
  const claimed = Boolean(current && reward && claims.has(cycleDay));
  const acquiredBy = claimed ? streakAcquiredBy(streak, cycleDay) : null;
  const granted = acquiredBy ? instances.find((item) => item?.acquiredBy === acquiredBy) : null;
  return {
    runDay,
    cycleDay,
    wait: current ? 0 : Math.max(0, runDay - streak),
    current,
    reward: reward || null,
    claimed,
    opened: Boolean(granted?.seenAt),
  };
}

/** Current run day, then the next two streak prizes. The client paints this and does not own the table. */
export function publicStreakLadder(session) {
  const streak = Math.max(0, Number(session?.visitStreak) || 0);
  const claims = new Set(session?.visitStreakClaims || []);
  const instances = session?.instances || [];
  const current = ladderRung(streak, streak, { current: true, claims, instances });
  const upcoming = nextPrizeRunDays(streak, 2).map((runDay) => (
    ladderRung(streak, runDay, { claims, instances })
  ));
  return [current, ...upcoming];
}

function daysBetween(from, to) {
  const start = Date.parse(`${from}T12:00:00+03:00`);
  const end = Date.parse(`${to}T12:00:00+03:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / DAY_MS);
}

/** Next calendar gift, or today's gift while it is still unopened. The client does not own DATE_PRIZES. */
export function publicNextDatePrize(session) {
  const today = session?.visitDay || null;
  if (!today) return null;
  const claims = new Set(session?.visitDateClaims || []);
  const instances = session?.instances || [];
  const todayReward = datePrizeFor(today);
  if (todayReward) {
    const granted = instances.find((item) => item?.acquiredBy === dateAcquiredBy(today));
    if (!granted?.seenAt) {
      return {
        date: today,
        wait: 0,
        reward: todayReward,
        waiting: true,
        claimed: claims.has(today),
        opened: false,
      };
    }
  }
  const upcoming = Object.keys(DATE_PRIZES).filter((date) => date > today).sort();
  const date = upcoming[0];
  if (!date) return null;
  return {
    date,
    wait: daysBetween(today, date),
    reward: datePrizeFor(date),
    waiting: false,
    claimed: false,
    opened: false,
  };
}

function monthChip(date) {
  if (date === "2026-10-01") return "אוק׳";
  return "";
}

export function publicStreakCalendar(session) {
  if (session && typeof session === "object") normalizeVisitStreak(session);
  const streak = Math.max(0, Number(session?.visitStreak) || 0);
  const today = session?.visitDay || null;
  const visited = new Set(session?.visitDates || []);
  const dateClaims = new Set(session?.visitDateClaims || []);
  const instances = session?.instances || [];
  return {
    streak,
    day: streak,
    cycleDay: calendarDay(streak),
    today,
    closed: Boolean(today && today > ELECTION_GRID_END),
    showPopup: Boolean(today && session?.streakCalendarAckDay !== today),
    days: ELECTION_GRID_DATES.map((date) => {
      const reward = datePrizeFor(date);
      const granted = reward ? instances.find((item) => item?.acquiredBy === dateAcquiredBy(date)) : null;
      return {
        date,
        day: Number(date.slice(-2)),
        monthChip: monthChip(date),
        checked: visited.has(date),
        current: date === today,
        election: date === ELECTION_DAY,
        reward,
        claimed: Boolean(reward && dateClaims.has(date)),
        opened: Boolean(granted?.seenAt),
      };
    }),
    ladder: publicStreakLadder(session),
    nextDatePrize: publicNextDatePrize(session),
  };
}
