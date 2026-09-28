import assert from "node:assert/strict";
import test from "node:test";
import {
  ackStreakCalendar,
  applyVisitStreak,
  calendarDay,
  publicStreakCalendar,
  STREAK_CALENDAR_DAYS,
  STREAK_REWARDS,
  STREAK_STAR_TIERS,
  visitStreakExtras,
} from "../server/streak-calendar.js";

const monday = Date.parse("2026-09-21T10:00:00+03:00");
const DAY = 24 * 60 * 60 * 1000;

test("visit streak counts Jerusalem days and resets after a gap", () => {
  const session = {};
  assert.equal(applyVisitStreak(session, monday).stamped, true);
  assert.equal(session.visitDay, "2026-09-21");
  assert.equal(session.visitStreak, 1);
  assert.equal(applyVisitStreak(session, monday + 60 * 60 * 1000).stamped, false);
  assert.equal(session.visitStreak, 1);
  assert.equal(applyVisitStreak(session, monday + DAY).stamped, true);
  assert.equal(session.visitStreak, 2);
  assert.equal(applyVisitStreak(session, monday + 3 * DAY).stamped, true);
  assert.equal(session.visitStreak, 1);
  assert.equal(session.visitStreakClaims.length, 0);
});

test("calendar days stay 1-30 and wrap claims after a full table", () => {
  const session = {};
  for (let index = 0; index < 30; index += 1) {
    applyVisitStreak(session, monday + index * DAY);
  }
  assert.equal(session.visitStreak, 30);
  assert.equal(calendarDay(session.visitStreak), 30);
  assert.equal(session.pendingStreakReward.kind, "rarity");
  assert.equal(session.pendingStreakReward.stars, 3);
  session.visitStreakClaims = [30];
  session.pendingStreakReward = null;
  applyVisitStreak(session, monday + 30 * DAY);
  assert.equal(session.visitStreak, 31);
  assert.equal(calendarDay(session.visitStreak), 1);
  assert.deepEqual(session.visitStreakClaims, []);
  assert.equal(session.pendingStreakReward, null);
});

test("reward days queue a pack or rarity until claimed", () => {
  assert.equal(STREAK_CALENDAR_DAYS, 30);
  assert.equal(STREAK_REWARDS[3].kind, "pack");
  assert.equal(STREAK_REWARDS[7].stars, 1);
  assert.equal(STREAK_STAR_TIERS[1], "Common");
  const session = {};
  applyVisitStreak(session, monday);
  applyVisitStreak(session, monday + DAY);
  const third = applyVisitStreak(session, monday + 2 * DAY);
  assert.equal(third.day, 3);
  assert.equal(session.pendingStreakReward.kind, "pack");
  assert.equal(session.pendingStreakReward.day, 3);
  const calendar = publicStreakCalendar(session);
  assert.equal(calendar.day, 3);
  assert.equal(calendar.showPopup, true);
  assert.equal(calendar.days.filter((cell) => cell.checked).length, 3);
  assert.equal(calendar.days[2].held, true);
  assert.equal(calendar.days[2].reward.kind, "pack");
  assert.equal(ackStreakCalendar(session), true);
  assert.equal(publicStreakCalendar(session).showPopup, false);
  assert.deepEqual(visitStreakExtras(session).visitDay, "2026-09-23");
});
