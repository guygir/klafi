/**
 * Daily race ("who collected the most cards of today's party"): a card scores on the Jerusalem day
 * the player OPENED it (seenAt), matching credit-on-open for unique/level/faction (#53). Warehouse
 * cards not yet opened do not score, and a backlog collected overnight scores the day it is opened.
 * Trade moves and debug grants never score.
 */
export const DAILY_RACE_TIME_ZONE = "Asia/Jerusalem";

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: DAILY_RACE_TIME_ZONE });

export function dailyRaceDay(ms) {
  return dayFormat.format(new Date(ms));
}

export function scoresInDailyRace(instance, day) {
  if (!instance?.seenAt) return false;
  const acquiredBy = String(instance.acquiredBy || "");
  if (acquiredBy.includes("trade") || acquiredBy.includes("debug")) return false;
  const seenMs = Date.parse(instance.seenAt);
  return Number.isFinite(seenMs) && dailyRaceDay(seenMs) === day;
}

export function dailyRaceScore(instances, day, targetPartyId, cardsById) {
  if (!targetPartyId) return 0;
  return (instances || [])
    .filter((instance) => scoresInDailyRace(instance, day))
    .filter((instance) => cardsById.get(instance.cardId)?.set === targetPartyId)
    .length;
}

export const DAILY_RACE_BOARD_SIZE = 8;

/**
 * The race board as served: players on 0 are hidden, except the requesting player, who always sees
 * their own row (even at 0) — in the top rows, or swapped into the last row when they rank lower.
 */
export function visibleDailyRaceLeaders(entries, size = DAILY_RACE_BOARD_SIZE) {
  const ranked = (entries || [])
    .filter((entry) => entry.current || Number(entry.cards) > 0)
    .sort((a, b) => b.cards - a.cards || Number(Boolean(b.current)) - Number(Boolean(a.current)));
  const board = ranked.slice(0, size);
  const current = ranked.find(({ current }) => current);
  if (current && !board.some(({ current }) => current)) board.splice(size - 1, 1, current);
  return board;
}
