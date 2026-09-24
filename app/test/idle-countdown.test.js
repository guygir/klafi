import assert from "node:assert/strict";
import test from "node:test";
import {
  IDLE_FULL_COPY,
  IDLE_INTERVAL_MS,
  applyIdleCountdown,
  formatCountdown,
  idleCountdownCopy,
  idleScheduleIsDue,
  nextCollectionRemaining,
} from "../public/idle-countdown.js";

const CLOCK_DIGITS = /\d{2}:\d{2}:\d{2}/;
const NOW = Date.parse("2026-09-23T12:00:00.000Z");

function fakeCooldownEl() {
  const classes = new Set(["next-pack-clock"]);
  return {
    textContent: "הבא בעוד 00:00:00",
    hidden: false,
    classList: {
      toggle(name, on) {
        if (on) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
  };
}

function paint(serverState, extras = {}) {
  const el = fakeCooldownEl();
  const view = idleCountdownCopy({ serverState, now: NOW, ...extras });
  applyIdleCountdown(el, view);
  return { el, view };
}

function assertVisibleClock(el, view) {
  assert.equal(view.full, false);
  assert.equal(el.hidden, false);
  assert.equal(view.hidden, false);
  assert.equal(el.classList.contains("is-clock"), true);
  assert.equal(el.classList.contains("is-full"), false);
  assert.match(el.textContent, /^הבא בעוד /);
  assert.match(el.textContent, CLOCK_DIGITS);
  assert.doesNotMatch(el.textContent, /00:00:00/);
  assert.equal(view.remaining > 0, true);
}

test("full idle storage hides the clock and shows the Hebrew full message", () => {
  const { el, view } = paint({
    unseenCount: 8,
    idleCapacity: 8,
    nextIdleAt: new Date(NOW + 3 * 60 * 60 * 1000).toISOString(),
    preparedPulls: [],
  });

  assert.equal(view.full, true);
  assert.equal(el.hidden, false);
  assert.equal(el.textContent, IDLE_FULL_COPY);
  assert.match(el.textContent, /המחסן מלא/);
  assert.doesNotMatch(el.textContent, CLOCK_DIGITS);
  assert.equal(el.classList.contains("is-full"), true);
  assert.equal(el.classList.contains("is-clock"), false);
  assert.equal(view.needsSettle, false);
});

test("under capacity with a future nextIdleAt shows a non-zero ticking clock", () => {
  const nextIdleAt = new Date(NOW + (2 * 60 * 60 * 1000) + (15 * 60 * 1000) + 4000).toISOString();
  const first = paint({
    unseenCount: 3,
    idleCapacity: 8,
    nextIdleAt,
    preparedPulls: [{ availableAt: nextIdleAt }],
  });

  assertVisibleClock(first.el, first.view);
  assert.equal(first.view.needsSettle, false);
  assert.equal(first.el.textContent, `הבא בעוד ${formatCountdown(nextCollectionRemaining({
    nextIdleAt,
    preparedPulls: [{ availableAt: nextIdleAt }],
  }, NOW))}`);

  const later = idleCountdownCopy({
    serverState: { unseenCount: 3, idleCapacity: 8, nextIdleAt },
    now: NOW + 1000,
  });
  assert.match(later.text, /^הבא בעוד /);
  assert.equal(later.remaining, first.view.remaining - 1000);
  assert.doesNotMatch(later.text, /00:00:00/);
});

test("five ready cards still show the clock for the next pack", () => {
  const nextIdleAt = new Date(NOW + (1 * 60 * 60 * 1000) + (12 * 60 * 1000)).toISOString();
  const { el, view } = paint({
    unseenCount: 5,
    idleCapacity: 8,
    nextIdleAt,
    preparedPulls: [{ availableAt: nextIdleAt }],
  });

  assertVisibleClock(el, view);
  assert.equal(view.unseen, 5);
  assert.equal(view.needsSettle, false);
});

test("five ready cards with a due schedule still show a next-pack clock, not a blank line", () => {
  const dueAt = new Date(NOW - 1000).toISOString();
  const { el, view } = paint({
    unseenCount: 5,
    idleCapacity: 8,
    nextIdleAt: dueAt,
    preparedPulls: [{ availableAt: dueAt }],
  });

  assertVisibleClock(el, view);
  assert.equal(view.needsSettle, true);
  assert.equal(idleScheduleIsDue({
    nextIdleAt: dueAt,
    preparedPulls: [{ availableAt: dueAt }],
  }, NOW), true);
  assert.ok(view.remaining <= IDLE_INTERVAL_MS);
  assert.ok(view.remaining > IDLE_INTERVAL_MS - 2000);
});

test("due or remaining 0 never renders 00:00:00 or hides the line", () => {
  const due = paint({
    unseenCount: 6,
    idleCapacity: 8,
    nextIdleAt: new Date(NOW - 1000).toISOString(),
    preparedPulls: [{ availableAt: new Date(NOW - 1000).toISOString() }],
  });

  assertVisibleClock(due.el, due.view);
  assert.equal(due.view.needsSettle, true);

  const zeroClock = paint({
    unseenCount: 1,
    idleCapacity: 8,
    nextIdleAt: new Date(NOW).toISOString(),
    preparedPulls: [],
  });
  assertVisibleClock(zeroClock.el, zeroClock.view);
  assert.equal(zeroClock.view.needsSettle, true);

  const missing = paint({
    unseenCount: 5,
    idleCapacity: 8,
    nextIdleAt: null,
    preparedPulls: [],
  });
  assertVisibleClock(missing.el, missing.view);
  assert.equal(missing.view.needsSettle, true);
  assert.equal(missing.view.remaining, IDLE_INTERVAL_MS);
});

test("empty warehouse still shows the first-pack clock", () => {
  const nextIdleAt = new Date(NOW + 45 * 60 * 1000).toISOString();
  const { el, view } = paint({
    unseenCount: 0,
    idleCapacity: 8,
    nextIdleAt,
    preparedPulls: [{ availableAt: nextIdleAt }],
  });
  assertVisibleClock(el, view);
  assert.equal(view.unseen, 0);
});

test("formatCountdown never prints 00:00:00", () => {
  assert.equal(formatCountdown(0), "00:00:01");
  assert.equal(formatCountdown(-100), "00:00:01");
  assert.doesNotMatch(formatCountdown(IDLE_INTERVAL_MS), /00:00:00/);
});

function futureIso(ms) {
  return new Date(NOW + ms).toISOString();
}

function pastIso(ms) {
  return new Date(NOW - ms).toISOString();
}

function assertFullWarehouse(el, view, unseen, cap = 8) {
  assert.equal(view.full, true);
  assert.equal(view.isFull, true);
  assert.equal(view.isClock, false);
  assert.equal(view.hidden, false);
  assert.equal(el.hidden, false);
  assert.equal(view.remaining, 0);
  assert.equal(view.unseen, unseen);
  assert.equal(view.cap, cap);
  assert.equal(view.needsSettle, false);
  assert.equal(el.textContent, IDLE_FULL_COPY);
  assert.match(el.textContent, /המחסן מלא/);
  assert.doesNotMatch(el.textContent, CLOCK_DIGITS);
  assert.equal(el.classList.contains("is-full"), true);
  assert.equal(el.classList.contains("is-clock"), false);
}

test("unseen 0, 1, 5, and 7 stay under capacity and always show a next-pack clock", () => {
  const nextIdleAt = futureIso((2 * 60 * 60 * 1000) + (5 * 60 * 1000) + 8000);
  for (const unseen of [0, 1, 5, 7]) {
    const { el, view } = paint({
      unseenCount: unseen,
      idleCapacity: 8,
      nextIdleAt,
      preparedPulls: [{ availableAt: nextIdleAt }],
    });
    assertVisibleClock(el, view);
    assert.equal(view.unseen, unseen);
    assert.equal(view.full, false);
    assert.equal(view.needsSettle, false);
    assert.equal(view.remaining, Date.parse(nextIdleAt) - NOW);
    assert.equal(view.text, `הבא בעוד ${formatCountdown(Date.parse(nextIdleAt) - NOW)}`);
  }
});

test("unseen 8 and 9 fill idle storage and drop clock digits", () => {
  const nextIdleAt = futureIso(IDLE_INTERVAL_MS);
  for (const unseen of [8, 9]) {
    const { el, view } = paint({
      unseenCount: unseen,
      idleCapacity: 8,
      nextIdleAt,
      preparedPulls: [{ availableAt: nextIdleAt }],
    });
    assertFullWarehouse(el, view, unseen);
  }
});

test("nextIdleAt null, past, and exact now still show a stepped future clock and need settle", () => {
  const cases = [
    { nextIdleAt: null, preparedPulls: [] },
    { nextIdleAt: pastIso(1500), preparedPulls: [] },
    { nextIdleAt: new Date(NOW).toISOString(), preparedPulls: [] },
  ];

  for (const serverState of cases) {
    const { el, view } = paint({
      unseenCount: 4,
      idleCapacity: 8,
      ...serverState,
    });
    assertVisibleClock(el, view);
    assert.equal(view.needsSettle, true);
    assert.ok(view.remaining > 0);
    assert.ok(view.remaining <= IDLE_INTERVAL_MS);
    assert.notEqual(formatCountdown(view.remaining), "00:00:00");
  }

  const missing = paint({
    unseenCount: 2,
    idleCapacity: 8,
    nextIdleAt: null,
    preparedPulls: [],
  });
  assert.equal(missing.view.remaining, IDLE_INTERVAL_MS);
});

test("nextIdleAt +1ms and +3h match that instant and do not need settle", () => {
  const plusOne = futureIso(1);
  const plusThreeHours = futureIso(IDLE_INTERVAL_MS);

  const oneMs = paint({
    unseenCount: 3,
    idleCapacity: 8,
    nextIdleAt: plusOne,
    preparedPulls: [],
  });
  assertVisibleClock(oneMs.el, oneMs.view);
  assert.equal(oneMs.view.needsSettle, false);
  assert.equal(oneMs.view.remaining, 1);
  assert.equal(oneMs.el.textContent, `הבא בעוד ${formatCountdown(1)}`);
  assert.equal(oneMs.el.textContent, "הבא בעוד 00:00:01");

  const threeHours = paint({
    unseenCount: 3,
    idleCapacity: 8,
    nextIdleAt: plusThreeHours,
    preparedPulls: [{ availableAt: plusThreeHours }],
  });
  assertVisibleClock(threeHours.el, threeHours.view);
  assert.equal(threeHours.view.needsSettle, false);
  assert.equal(threeHours.view.remaining, IDLE_INTERVAL_MS);
  assert.equal(threeHours.el.textContent, `הבא בעוד ${formatCountdown(IDLE_INTERVAL_MS)}`);
});

test("invalid nextIdleAt still shows a future clock instead of 00:00:00", () => {
  const { el, view } = paint({
    unseenCount: 2,
    idleCapacity: 8,
    nextIdleAt: "not-a-date",
    preparedPulls: [],
  });
  assertVisibleClock(el, view);
  assert.equal(view.remaining, IDLE_INTERVAL_MS);
  assert.equal(view.needsSettle, true);
  assert.notEqual(el.textContent, "הבא בעוד 00:00:00");
});

test("preparedPulls empty, all past, mix, and only future pick the next real slot", () => {
  const pastA = pastIso(4000);
  const pastB = pastIso(1000);
  const futureA = futureIso((45 * 60 * 1000) + 2000);
  const futureB = futureIso((2 * 60 * 60 * 1000) + 12_000);

  const empty = paint({
    unseenCount: 1,
    idleCapacity: 8,
    nextIdleAt: futureA,
    preparedPulls: [],
  });
  assertVisibleClock(empty.el, empty.view);
  assert.equal(empty.view.needsSettle, false);
  assert.equal(empty.view.remaining, Date.parse(futureA) - NOW);

  const allPast = paint({
    unseenCount: 1,
    idleCapacity: 8,
    nextIdleAt: pastB,
    preparedPulls: [{ availableAt: pastA }, { availableAt: pastB }],
  });
  assertVisibleClock(allPast.el, allPast.view);
  assert.equal(allPast.view.needsSettle, true);
  assert.equal(allPast.view.remaining, IDLE_INTERVAL_MS - 1000);

  const mixed = paint({
    unseenCount: 5,
    idleCapacity: 8,
    nextIdleAt: pastA,
    preparedPulls: [{ availableAt: pastA }, { availableAt: futureA }, { availableAt: futureB }],
  });
  assertVisibleClock(mixed.el, mixed.view);
  assert.equal(mixed.view.needsSettle, true);
  assert.equal(mixed.view.remaining, Date.parse(futureA) - NOW);
  assert.equal(mixed.el.textContent, `הבא בעוד ${formatCountdown(Date.parse(futureA) - NOW)}`);

  const onlyFuture = paint({
    unseenCount: 5,
    idleCapacity: 8,
    nextIdleAt: futureB,
    preparedPulls: [{ availableAt: futureA }, { availableAt: futureB }],
  });
  assertVisibleClock(onlyFuture.el, onlyFuture.view);
  assert.equal(onlyFuture.view.needsSettle, false);
  assert.equal(onlyFuture.view.remaining, Date.parse(futureA) - NOW);
});

test("custom idleIntervalMs steps a due clock and is ignored when a future slot exists", () => {
  const customMs = 90 * 60 * 1000;
  const due = paint({
    unseenCount: 2,
    idleCapacity: 8,
    idleIntervalMs: customMs,
    nextIdleAt: pastIso(10_000),
    preparedPulls: [],
  });
  assertVisibleClock(due.el, due.view);
  assert.equal(due.view.needsSettle, true);
  assert.equal(due.view.remaining, customMs - 10_000);
  assert.notEqual(due.view.remaining, IDLE_INTERVAL_MS - 10_000);

  const missing = paint({
    unseenCount: 0,
    idleCapacity: 8,
    idleIntervalMs: 45_000,
    nextIdleAt: null,
    preparedPulls: [],
  });
  assertVisibleClock(missing.el, missing.view);
  assert.equal(missing.view.remaining, 45_000);

  const future = paint({
    unseenCount: 1,
    idleCapacity: 8,
    idleIntervalMs: customMs,
    nextIdleAt: futureIso(12_000),
    preparedPulls: [],
  });
  assertVisibleClock(future.el, future.view);
  assert.equal(future.view.remaining, 12_000);
});

test("missing serverState or an empty object still show a first-pack clock", () => {
  const missing = paint(undefined);
  assertVisibleClock(missing.el, missing.view);
  assert.equal(missing.view.unseen, 0);
  assert.equal(missing.view.cap, 8);
  assert.equal(missing.view.remaining, IDLE_INTERVAL_MS);
  assert.equal(missing.view.needsSettle, true);

  const empty = paint({});
  assertVisibleClock(empty.el, empty.view);
  assert.equal(empty.view.unseen, 0);
  assert.equal(empty.view.cap, 8);
  assert.equal(empty.view.remaining, IDLE_INTERVAL_MS);
  assert.equal(empty.view.needsSettle, true);

  const fromQueue = idleCountdownCopy({ idleQueueLength: 3, now: NOW });
  assert.equal(fromQueue.unseen, 3);
  assert.equal(fromQueue.full, false);
  assert.match(fromQueue.text, /^הבא בעוד /);

  const fullFromQueue = idleCountdownCopy({ idleQueueLength: 8, now: NOW });
  assert.equal(fullFromQueue.full, true);
  assert.equal(fullFromQueue.text, IDLE_FULL_COPY);
});

test("clock ticks one second later without hitting 00:00:00", () => {
  const nextIdleAt = futureIso((1 * 60 * 60 * 1000) + (3 * 60 * 1000) + 4000);
  const serverState = {
    unseenCount: 6,
    idleCapacity: 8,
    nextIdleAt,
    preparedPulls: [{ availableAt: nextIdleAt }],
  };
  const first = idleCountdownCopy({ serverState, now: NOW });
  const later = idleCountdownCopy({ serverState, now: NOW + 1000 });

  assert.equal(first.remaining, Date.parse(nextIdleAt) - NOW);
  assert.equal(later.remaining, first.remaining - 1000);
  assert.equal(later.text, `הבא בעוד ${formatCountdown(first.remaining - 1000)}`);
  assert.match(later.text, /^הבא בעוד /);
  assert.doesNotMatch(later.text, /הבא בעוד 00:00:00/);
  assert.equal(later.needsSettle, false);

  const dueState = {
    unseenCount: 4,
    idleCapacity: 8,
    nextIdleAt: pastIso(500),
    preparedPulls: [],
  };
  const dueFirst = idleCountdownCopy({ serverState: dueState, now: NOW });
  const dueLater = idleCountdownCopy({ serverState: dueState, now: NOW + 1000 });
  assert.equal(dueLater.remaining, dueFirst.remaining - 1000);
  assert.equal(dueLater.needsSettle, true);
  assert.ok(dueLater.remaining > 0);
  assert.notEqual(formatCountdown(dueLater.remaining), "00:00:00");
});

test("applyIdleCountdown toggles is-clock and is-full and never hides the line", () => {
  const el = fakeCooldownEl();
  const nextIdleAt = futureIso((20 * 60 * 1000) + 3000);
  const clockView = idleCountdownCopy({
    serverState: {
      unseenCount: 2,
      idleCapacity: 8,
      nextIdleAt,
      preparedPulls: [{ availableAt: nextIdleAt }],
    },
    now: NOW,
  });
  const fullView = idleCountdownCopy({
    serverState: { unseenCount: 8, idleCapacity: 8, nextIdleAt },
    now: NOW,
  });

  const paintedClock = applyIdleCountdown(el, clockView);
  assert.equal(paintedClock, clockView);
  assert.equal(el.textContent, clockView.text);
  assert.equal(el.hidden, false);
  assert.equal(el.classList.contains("is-clock"), true);
  assert.equal(el.classList.contains("is-full"), false);
  assert.equal(el.classList.contains("next-pack-clock"), true);

  applyIdleCountdown(el, fullView);
  assert.equal(el.textContent, IDLE_FULL_COPY);
  assert.equal(el.hidden, false);
  assert.equal(el.classList.contains("is-clock"), false);
  assert.equal(el.classList.contains("is-full"), true);

  applyIdleCountdown(el, clockView);
  assert.equal(el.classList.contains("is-clock"), true);
  assert.equal(el.classList.contains("is-full"), false);
  assert.equal(el.hidden, false);

  const skipped = applyIdleCountdown(null, clockView);
  assert.equal(skipped, clockView);
});

test("formatCountdown clamps zero and sub-second leftovers to 00:00:01", () => {
  assert.equal(formatCountdown(1), "00:00:01");
  assert.equal(formatCountdown(999), "00:00:01");
  assert.equal(formatCountdown(1000), "00:00:01");
  assert.equal(formatCountdown(1001), "00:00:02");
  assert.equal(formatCountdown(IDLE_INTERVAL_MS), "03:00:00");
  for (const ms of [0, -1, -1000]) {
    assert.equal(formatCountdown(ms), "00:00:01");
    assert.notEqual(formatCountdown(ms), "00:00:00");
  }
});
