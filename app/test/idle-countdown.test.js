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
