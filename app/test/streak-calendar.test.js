import assert from "node:assert/strict";
import test from "node:test";
import {
  ackStreakCalendar,
  applyVisitStreak,
  calendarDay,
  publicStreakCalendar,
  streakAcquiredBy,
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
  let last;
  for (let index = 0; index < 30; index += 1) {
    last = applyVisitStreak(session, monday + index * DAY);
  }
  assert.equal(session.visitStreak, 30);
  assert.equal(calendarDay(session.visitStreak), 30);
  assert.equal(last.reward.kind, "rarity");
  assert.equal(last.reward.stars, 3);
  assert.equal(session.pendingStreakReward, null);
  session.visitStreakClaims = [30];
  applyVisitStreak(session, monday + 30 * DAY);
  assert.equal(session.visitStreak, 31);
  assert.equal(calendarDay(session.visitStreak), 1);
  assert.deepEqual(session.visitStreakClaims, []);
  assert.equal(session.pendingStreakReward, null);
  assert.equal(streakAcquiredBy(33, 3), "streak-33");
});

test("reward days stay on the calendar without a warehouse hold", () => {
  assert.equal(STREAK_CALENDAR_DAYS, 30);
  assert.equal(STREAK_REWARDS[3].kind, "pack");
  assert.equal(STREAK_REWARDS[7].stars, 1);
  assert.equal(STREAK_STAR_TIERS[1], "Common");
  const session = {};
  applyVisitStreak(session, monday);
  applyVisitStreak(session, monday + DAY);
  const third = applyVisitStreak(session, monday + 2 * DAY);
  assert.equal(third.day, 3);
  assert.equal(third.reward.kind, "pack");
  assert.equal(session.pendingStreakReward, null);
  session.visitStreakClaims = [3];
  session.instances = [{ acquiredBy: "streak-3", cardId: "x", seenAt: null }];
  const calendar = publicStreakCalendar(session);
  assert.equal(calendar.day, 3);
  assert.equal(calendar.showPopup, true);
  assert.equal(calendar.pendingReward, undefined);
  assert.equal(calendar.days.filter((cell) => cell.checked).length, 3);
  assert.equal(calendar.days[2].held, undefined);
  assert.equal(calendar.days[2].claimed, true);
  assert.equal(calendar.days[2].opened, false);
  assert.equal(calendar.days[2].reward.kind, "pack");
  session.instances[0].seenAt = "2026-09-23T07:00:00.000Z";
  assert.equal(publicStreakCalendar(session).days[2].opened, true);
  assert.equal(ackStreakCalendar(session), true);
  assert.equal(publicStreakCalendar(session).showPopup, false);
  assert.deepEqual(visitStreakExtras(session).visitDay, "2026-09-23");
});
