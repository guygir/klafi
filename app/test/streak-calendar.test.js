import assert from "node:assert/strict";
import test from "node:test";
import {
  ackStreakCalendar,
  applyVisitStreak,
  noteSkippedStreakPrize,
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
  assert.equal(session.bestVisitStreak, 2);
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
  assert.equal(last.reward.kind, "pack");
  assert.equal(last.reward.stars, undefined);
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
  assert.equal(STREAK_REWARDS[5].kind, "pack");
  assert.equal(STREAK_REWARDS[10].kind, "pack");
  assert.equal(STREAK_REWARDS[30].kind, "pack");
  assert.equal(STREAK_REWARDS[2].stars, 1);
  assert.equal(STREAK_REWARDS[4].stars, 1);
  assert.equal(STREAK_REWARDS[6].stars, 1);
  assert.equal(STREAK_REWARDS[8].stars, 2);
  assert.equal(STREAK_REWARDS[12].stars, 2);
  assert.equal(STREAK_REWARDS[14].stars, 2);
  assert.equal(STREAK_REWARDS[16].stars, 2);
  assert.equal(STREAK_REWARDS[19].stars, 3);
  assert.equal(STREAK_REWARDS[23].stars, 3);
  assert.equal(STREAK_REWARDS[28].stars, 3);
  assert.equal(STREAK_STAR_TIERS[1], "Common");
  const session = {};
  let fifth;
  for (let index = 0; index < 5; index += 1) {
    fifth = applyVisitStreak(session, monday + index * DAY);
  }
  assert.equal(fifth.day, 5);
  assert.equal(fifth.reward.kind, "pack");
  assert.equal(session.pendingStreakReward, null);
  session.visitStreakClaims = [5];
  session.instances = [{ acquiredBy: "streak-5", cardId: "x", seenAt: null }];
  const calendar = publicStreakCalendar(session);
  assert.equal(calendar.day, 5);
  assert.equal(calendar.showPopup, true);
  assert.equal(calendar.pendingReward, undefined);
  assert.equal(calendar.days.filter((cell) => cell.checked).length, 5);
  assert.equal(calendar.days[4].held, undefined);
  assert.equal(calendar.days[4].claimed, true);
  assert.equal(calendar.days[4].opened, false);
  assert.equal(calendar.days[4].reward.kind, "pack");
  assert.equal(calendar.days[1].reward.stars, 1);
  session.instances[0].seenAt = "2026-09-25T07:00:00.000Z";
  assert.equal(publicStreakCalendar(session).days[4].opened, true);
  assert.equal(ackStreakCalendar(session), true);
  assert.equal(publicStreakCalendar(session).showPopup, false);
  assert.deepEqual(visitStreakExtras(session).visitDay, "2026-09-25");
});

test("closing the table on an unopened prize marks the skip; opening it does not", () => {
  const session = {
    visitDay: "2026-09-22",
    visitStreak: 2,
    visitStreakClaims: [2],
    instances: [{ acquiredBy: "streak-2", seenAt: null }],
  };
  assert.equal(noteSkippedStreakPrize(session), true);
  assert.equal(session.streakPrizeSkipped, true);
  assert.equal(noteSkippedStreakPrize(session), false);
  assert.equal(visitStreakExtras(session).streakPrizeSkipped, true);

  const opened = {
    visitDay: "2026-09-22",
    visitStreak: 2,
    visitStreakClaims: [2],
    instances: [{ acquiredBy: "streak-2", seenAt: "2026-09-22T08:00:00.000Z" }],
  };
  assert.equal(noteSkippedStreakPrize(opened), false);
  assert.equal(opened.streakPrizeSkipped, undefined);

  const quiet = { visitDay: "2026-09-21", visitStreak: 1, visitStreakClaims: [], instances: [] };
  assert.equal(noteSkippedStreakPrize(quiet), false);
});
