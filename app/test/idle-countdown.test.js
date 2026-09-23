import assert from "node:assert/strict";
import test from "node:test";
import {
  IDLE_FULL_COPY,
  applyIdleCountdown,
  formatCountdown,
  idleCountdownCopy,
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
});

test("under capacity with a future nextIdleAt shows a non-zero ticking clock", () => {
  const nextIdleAt = new Date(NOW + (2 * 60 * 60 * 1000) + (15 * 60 * 1000) + 4000).toISOString();
  const first = paint({
    unseenCount: 3,
    idleCapacity: 8,
    nextIdleAt,
    preparedPulls: [{ availableAt: nextIdleAt }],
  });

  assert.equal(first.view.full, false);
  assert.equal(first.el.hidden, false);
  assert.equal(first.el.classList.contains("is-clock"), true);
  assert.equal(first.el.classList.contains("is-full"), false);
  assert.match(first.el.textContent, /^הבא בעוד /);
  assert.doesNotMatch(first.el.textContent, /00:00:00/);
  assert.equal(first.el.textContent, `הבא בעוד ${formatCountdown(nextCollectionRemaining({
    nextIdleAt,
    preparedPulls: [{ availableAt: nextIdleAt }],
  }, NOW))}`);
  assert.equal(first.view.remaining > 0, true);

  const later = idleCountdownCopy({
    serverState: { unseenCount: 3, idleCapacity: 8, nextIdleAt },
    now: NOW + 1000,
  });
  assert.match(later.text, /^הבא בעוד /);
  assert.equal(later.remaining, first.view.remaining - 1000);
  assert.doesNotMatch(later.text, /00:00:00/);
});

test("due or remaining 0 never renders 00:00:00", () => {
  const due = paint({
    unseenCount: 6,
    idleCapacity: 8,
    nextIdleAt: new Date(NOW - 1000).toISOString(),
    preparedPulls: [{ availableAt: new Date(NOW - 1000).toISOString() }],
  });

  assert.equal(due.view.remaining, 0);
  assert.equal(due.view.full, false);
  assert.equal(due.el.hidden, true);
  assert.equal(due.el.textContent, "");
  assert.doesNotMatch(due.el.textContent, /00:00:00/);
  assert.doesNotMatch(due.el.textContent, CLOCK_DIGITS);
  assert.equal(due.el.classList.contains("is-clock"), false);

  const zeroClock = paint({
    unseenCount: 1,
    idleCapacity: 8,
    nextIdleAt: new Date(NOW).toISOString(),
    preparedPulls: [],
  });
  assert.equal(zeroClock.view.remaining, 0);
  assert.equal(zeroClock.el.hidden, true);
  assert.doesNotMatch(zeroClock.el.textContent, /00:00:00/);
});
