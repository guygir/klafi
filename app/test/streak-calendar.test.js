import assert from "node:assert/strict";
import test from "node:test";
import {
  ackStreakCalendar,
  applyVisitStreak,
  noteSkippedStreakPrize,
  calendarDay,
  publicStreakCalendar,
  streakAcquiredBy,
  DATE_PRIZES,
  ELECTION_DAY,
  ELECTION_GRID_DATES,
  ELECTION_GRID_END,
  ELECTION_GRID_START,
  STREAK_STAR_TIERS,
  streakRewardForDay,
  visitStreakExtras,
} from "../server/streak-calendar.js";

const monday = Date.parse("2026-09-21T10:00:00+03:00");
const DAY = 24 * 60 * 60 * 1000;

test("visit streak counts Jerusalem days and resets after a gap", () => {
  const session = {};
  assert.equal(applyVisitStreak(session, monday).stamped, true);
  assert.equal(session.visitDay, "2026-09-21");
  assert.equal(session.visitStreak, 1);
  assert.deepEqual(session.visitDates, ["2026-09-21"]);
  assert.equal(applyVisitStreak(session, monday + 60 * 60 * 1000).stamped, false);
  assert.equal(session.visitStreak, 1);
  assert.deepEqual(session.visitDates, ["2026-09-21"]);
  assert.equal(applyVisitStreak(session, monday + DAY).stamped, true);
  assert.equal(session.visitStreak, 2);
  assert.equal(applyVisitStreak(session, monday + 3 * DAY).stamped, true);
  assert.equal(session.visitStreak, 1);
  assert.equal(session.bestVisitStreak, 2);
  assert.equal(session.visitStreakClaims.length, 0);
  assert.deepEqual(session.visitDates, ["2026-09-21", "2026-09-22", "2026-09-24"]);
});

test("a long run keeps streak claims and does not open a second month", () => {
  const session = {};
  let last;
  for (let index = 0; index < 30; index += 1) {
    last = applyVisitStreak(session, monday + index * DAY);
  }
  assert.equal(session.visitStreak, 30);
  assert.equal(calendarDay(session.visitStreak), 30);
  assert.equal(last.reward.stars, 3);
  assert.equal(session.pendingStreakReward, null);
  session.visitStreakClaims = [30];
  applyVisitStreak(session, monday + 30 * DAY);
  assert.equal(session.visitStreak, 31);
  assert.equal(calendarDay(session.visitStreak), 31);
  assert.deepEqual(session.visitStreakClaims, [30]);
  assert.equal(session.pendingStreakReward, null);
  assert.equal(session.visitDates.length, 31);
  assert.equal(streakAcquiredBy(33, 6), "streak-6");
  assert.equal(streakAcquiredBy(10, 11), null);

  const calendar = publicStreakCalendar(session);
  assert.equal(calendar.day, 31);
  assert.equal(calendar.days.length, 35);
  assert.equal(calendar.days[0].date, ELECTION_GRID_START);
  assert.equal(calendar.days[0].date, "2026-09-27");
  assert.equal(calendar.days.at(-1).date, ELECTION_GRID_END);
  assert.equal(calendar.days.some((cell) => cell.date.startsWith("2026-11")), false);
  assert.equal(calendar.closed, false);
  assert.equal(calendar.days.find((cell) => cell.date === "2026-09-27").checked, true);
  assert.equal(calendar.days.find((cell) => cell.date === "2026-09-26"), undefined);
  assert.equal(calendar.days.find((cell) => cell.date === "2026-10-21").checked, true);
  assert.equal(calendar.days.find((cell) => cell.date === "2026-10-22").checked, false);
});

test("reward days stay on the ladder without a warehouse hold", () => {
  assert.equal(Object.keys(DATE_PRIZES).length, 26);
  assert.equal(DATE_PRIZES["2026-10-01"].stars, 1);
  assert.equal(DATE_PRIZES["2026-10-02"].kind, "pack");
  assert.equal(DATE_PRIZES["2026-10-03"], undefined);
  assert.equal(DATE_PRIZES["2026-09-30"], undefined);
  assert.equal(DATE_PRIZES[ELECTION_DAY].stars, 3);
  assert.equal(DATE_PRIZES["2026-10-31"].stars, 3);
  assert.equal(ELECTION_GRID_DATES.length, 35);
  assert.equal(ELECTION_GRID_DATES[0], "2026-09-27");
  assert.equal(ELECTION_GRID_DATES.at(-1), "2026-10-31");
  assert.equal(ELECTION_GRID_DATES.includes(ELECTION_DAY), true);
  assert.equal(streakRewardForDay(1), null);
  assert.equal(streakRewardForDay(2).stars, 1);
  assert.equal(streakRewardForDay(4).stars, 1);
  assert.equal(streakRewardForDay(6).kind, "pack");
  assert.equal(streakRewardForDay(8).stars, 1);
  assert.equal(streakRewardForDay(14).stars, 2);
  assert.equal(streakRewardForDay(22).kind, "pack");
  assert.equal(streakRewardForDay(24).stars, 3);
  assert.equal(streakRewardForDay(26).kind, "pack");
  assert.equal(streakRewardForDay(28).kind, "pack");
  assert.equal(streakRewardForDay(30).stars, 3);
  assert.equal(streakRewardForDay(7), null);
  assert.equal(STREAK_STAR_TIERS[1], "Common");
  const session = {};
  let sixth;
  for (let index = 0; index < 6; index += 1) {
    sixth = applyVisitStreak(session, monday + index * DAY);
  }
  assert.equal(sixth.day, 6);
  assert.equal(sixth.reward.kind, "pack");
  assert.equal(session.pendingStreakReward, null);
  session.visitStreakClaims = [6];
  session.instances = [{ acquiredBy: "streak-6", cardId: "x", seenAt: null }];
  const calendar = publicStreakCalendar(session);
  assert.equal(calendar.day, 6);
  assert.equal(calendar.streak, 6);
  assert.equal(calendar.showPopup, true);
  assert.equal(calendar.pendingReward, undefined);
  assert.equal(calendar.days.find((cell) => cell.date === "2026-10-01").reward.stars, 1);
  assert.equal(calendar.days.find((cell) => cell.date === "2026-09-27").reward, null);
  assert.equal(calendar.days.filter((cell) => cell.checked).length, 0);
  assert.equal(calendar.ladder[0].held, undefined);
  assert.equal(calendar.ladder[0].runDay, 6);
  assert.equal(calendar.ladder[0].claimed, true);
  assert.equal(calendar.ladder[0].opened, false);
  assert.equal(calendar.ladder[0].reward.kind, "pack");
  assert.equal(calendar.ladder[1].runDay, 8);
  assert.equal(calendar.ladder[1].reward.stars, 1);
  session.instances[0].seenAt = "2026-09-25T07:00:00.000Z";
  assert.equal(publicStreakCalendar(session).ladder[0].opened, true);
  assert.equal(ackStreakCalendar(session), true);
  assert.equal(publicStreakCalendar(session).showPopup, false);
  assert.deepEqual(visitStreakExtras(session).visitDay, "2026-09-26");
  assert.equal(visitStreakExtras(session).visitDates.includes("2026-09-21"), true);
});

test("a mid-grid start checks only stored visit dates", () => {
  const session = {
    visitStreak: 3,
    visitDay: "2026-10-18",
    visitDates: ["2026-10-18"],
  };
  const calendar = publicStreakCalendar(session);
  assert.deepEqual(
    calendar.days.filter((cell) => cell.checked).map((cell) => cell.date),
    ["2026-10-18"],
  );
  assert.equal(calendar.days.find((cell) => cell.date === "2026-10-04").checked, false);
  assert.equal(calendar.days.find((cell) => cell.date === "2026-10-16").checked, false);
  assert.equal(calendar.days.find((cell) => cell.election).date, ELECTION_DAY);
  assert.equal(calendar.days.find((cell) => cell.election).reward.stars, 3);
  assert.equal(calendar.ladder[0].runDay, 3);
  assert.equal(calendar.ladder[0].reward, null);
  assert.equal(calendar.ladder[1].runDay, 4);
  assert.equal(calendar.ladder[1].reward.stars, 1);
  assert.equal(calendar.ladder[2].runDay, 6);
  assert.equal(calendar.ladder[2].reward.kind, "pack");
  assert.equal(calendar.ladder.some((rung) => rung.runDay === 7), false);
  assert.equal(calendar.nextDatePrize.date, "2026-10-19");
  assert.equal(calendar.nextDatePrize.wait, 1);
  assert.equal(calendar.nextDatePrize.reward.kind, "pack");
});

test("an old run length does not invent visit dates", () => {
  const session = { visitStreak: 3, visitDay: "2026-10-15" };
  const calendar = publicStreakCalendar(session);
  assert.deepEqual(session.visitDates, ["2026-10-15"]);
  assert.deepEqual(
    calendar.days.filter((cell) => cell.checked).map((cell) => cell.date),
    ["2026-10-15"],
  );
});

test("1 November keeps the October grid and the run ladder", () => {
  const session = {
    visitStreak: 40,
    visitDay: "2026-11-01",
    visitDates: ["2026-10-20", "2026-10-27", "2026-11-01"],
    visitStreakClaims: [],
    instances: [],
  };
  const calendar = publicStreakCalendar(session);
  assert.equal(calendar.closed, true);
  assert.equal(calendar.streak, 40);
  assert.equal(calendar.day, 40);
  assert.equal(calendar.days.length, 35);
  assert.equal(calendar.days.some((cell) => cell.date.startsWith("2026-11")), false);
  assert.equal(calendar.days.some((cell) => cell.current), false);
  assert.deepEqual(
    calendar.days.filter((cell) => cell.checked).map((cell) => cell.date),
    ["2026-10-20", "2026-10-27"],
  );
  assert.equal(calendar.ladder[0].runDay, 40);
  assert.equal(calendar.ladder[0].reward.kind, "pack");
  assert.equal(calendar.ladder[1].runDay, 42);
  assert.equal(calendar.ladder[1].reward.stars, 3);
  assert.equal(calendar.ladder[2].runDay, 44);
  assert.equal(calendar.ladder[2].reward.kind, "pack");
  assert.equal(calendar.nextDatePrize, null);
  assert.equal(calendar.days.find((cell) => cell.date === "2026-09-27").reward, null);
  assert.equal(calendar.days.find((cell) => cell.date === "2026-10-01").reward.stars, 1);
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
