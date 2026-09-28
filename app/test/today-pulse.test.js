import assert from "node:assert/strict";
import test from "node:test";
import {
  TODAY_PULSE_MIN_PACKS,
  TODAY_PULSE_MIN_USERS,
  TODAY_PULSE_QUIET_COPY,
  TODAY_PULSE_REFRESH_MS,
  countTodayPulse,
  emptyTodayPulse,
  jerusalemDayKey,
  todayPulseCopy,
} from "../public/today-pulse.js";

const DAY = "2026-09-27";
const IN_DAY = "2026-09-27T10:00:00.000Z";
const OTHER_DAY = "2026-09-26T10:00:00.000Z";

function sessionsFromGrants(grants) {
  const sessions = {};
  for (const [token, instances] of Object.entries(grants)) {
    sessions[token] = {
      instances: instances.map((item, index) => (
        typeof item === "string"
          ? { instanceId: `${token}-${index}`, acquiredBy: "idle", pulledAt: item }
          : item
      )),
    };
  }
  return sessions;
}

test("quiet copy hides a small launch crowd", () => {
  assert.equal(TODAY_PULSE_MIN_USERS, 5);
  assert.equal(TODAY_PULSE_MIN_PACKS, 8);
  assert.equal(TODAY_PULSE_REFRESH_MS, 15 * 60 * 1000);
  assert.equal(TODAY_PULSE_QUIET_COPY, "המחסן ממשיך לאסוף חבילות גם עכשיו");
  assert.equal(todayPulseCopy(), "");
  assert.equal(todayPulseCopy({ packs: 8, users: 1 }), "");
  assert.equal(todayPulseCopy({ packs: 7, users: 5 }), "");
  assert.equal(
    todayPulseCopy({ packs: 12, users: 6 }),
    "היום ניתנו 12 חבילות ל־6 שחקנים",
  );
});

test("pulse counts idle grants for Jerusalem today, not opens or other sources", () => {
  const counted = countTodayPulse(sessionsFromGrants({
    a: [IN_DAY, IN_DAY, { acquiredBy: "quiz", pulledAt: IN_DAY }],
    b: [IN_DAY],
    c: [OTHER_DAY],
    d: [{ acquiredBy: "idle", pulledAt: "not-a-date" }],
    e: [{ acquiredBy: "event-pull", pulledAt: IN_DAY }],
  }), DAY);
  assert.deepEqual(counted, { day: DAY, packs: 3, users: 2 });
});

test("empty pulse keeps today's Jerusalem day", () => {
  const pulse = emptyTodayPulse(Date.parse(IN_DAY));
  assert.equal(pulse.day, jerusalemDayKey(Date.parse(IN_DAY)));
  assert.equal(pulse.packs, 0);
  assert.equal(pulse.users, 0);
});
