import assert from "node:assert/strict";
import test from "node:test";
import {
  IDLE_FULL_COPY,
  IDLE_INTERVAL_MS,
  formatCountdown,
  idleCountdownCopy,
} from "../public/idle-countdown.js";

const NOW = Date.parse("2026-09-24T12:00:00.000Z");
const CAP = 8;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function iso(ms) {
  return new Date(ms).toISOString();
}

// Mirrors settleIdle's nextIdleAt write (app/server/app.js) without granting cards.
function projectedSettleNextIdleAt(state, now = NOW) {
  const interval = IDLE_INTERVAL_MS;
  const cap = state.idleCapacity ?? CAP;
  let unseen = state.unseenCount ?? 0;
  let prepared = (state.preparedPulls || [])
    .filter((pull) => pull?.availableAt && Number.isFinite(Date.parse(pull.availableAt)))
    .map((pull) => Date.parse(pull.availableAt))
    .sort((left, right) => left - right);
  const fallbackAnchor = Date.parse(state.nextIdleAt || state.idleAnchorAt || state.createdAt);
  const anchorAt = Number.isFinite(fallbackAnchor) ? fallbackAnchor : now;
  let scheduleAt = prepared.length ? prepared.at(-1) + interval : anchorAt;

  const fillPreparedQueue = () => {
    const preparedCapacity = Math.max(0, cap - unseen);
    while (prepared.length < preparedCapacity) {
      prepared.push(scheduleAt);
      scheduleAt += interval;
    }
  };

  fillPreparedQueue();
  while (unseen < cap && prepared[0] != null && prepared[0] <= now) {
    prepared.shift();
    unseen += 1;
  }
  if (unseen >= cap && scheduleAt <= now) {
    scheduleAt = now + interval;
  }
  fillPreparedQueue();
  return prepared[0] ?? scheduleAt;
}

const CASES = [
  {
    id: 1,
    name: "new session: nextIdleAt=createdAt (now), unseen=0, prepared=[]",
    state: {
      unseenCount: 0,
      idleCapacity: CAP,
      nextIdleAt: iso(NOW),
      createdAt: iso(NOW),
      preparedPulls: [],
    },
    expect: {
      remaining: IDLE_INTERVAL_MS,
      text: `הבא בעוד ${formatCountdown(IDLE_INTERVAL_MS)}`,
      full: false,
      needsSettle: true,
    },
  },
  {
    id: 2,
    name: "5 unseen, nextIdleAt=now+2h, prepared one future",
    state: {
      unseenCount: 5,
      idleCapacity: CAP,
      nextIdleAt: iso(NOW + TWO_HOURS_MS),
      preparedPulls: [{ availableAt: iso(NOW + TWO_HOURS_MS) }],
    },
    expect: {
      remaining: TWO_HOURS_MS,
      text: `הבא בעוד ${formatCountdown(TWO_HOURS_MS)}`,
      full: false,
      needsSettle: false,
    },
  },
  {
    id: 3,
    name: "5 unseen, nextIdleAt=now-1s (ready, must keep a clock)",
    state: {
      unseenCount: 5,
      idleCapacity: CAP,
      nextIdleAt: iso(NOW - 1000),
      preparedPulls: [],
    },
    expect: {
      remaining: IDLE_INTERVAL_MS - 1000,
      text: `הבא בעוד ${formatCountdown(IDLE_INTERVAL_MS - 1000)}`,
      full: false,
      needsSettle: true,
    },
  },
  {
    id: 4,
    name: "8 unseen (full), nextIdleAt=now+3h",
    state: {
      unseenCount: 8,
      idleCapacity: CAP,
      nextIdleAt: iso(NOW + IDLE_INTERVAL_MS),
      preparedPulls: [],
    },
    expect: {
      remaining: 0,
      text: IDLE_FULL_COPY,
      full: true,
      needsSettle: false,
    },
  },
  {
    id: 5,
    name: "7 unseen, prepared[0] due now, prepared[1] in 3h",
    state: {
      unseenCount: 7,
      idleCapacity: CAP,
      nextIdleAt: iso(NOW),
      preparedPulls: [
        { availableAt: iso(NOW) },
        { availableAt: iso(NOW + IDLE_INTERVAL_MS) },
      ],
    },
    expect: {
      remaining: IDLE_INTERVAL_MS,
      text: `הבא בעוד ${formatCountdown(IDLE_INTERVAL_MS)}`,
      full: false,
      needsSettle: true,
    },
  },
  {
    id: 6,
    name: "unseen=0, nextIdleAt null",
    state: {
      unseenCount: 0,
      idleCapacity: CAP,
      nextIdleAt: null,
      preparedPulls: [],
    },
    expect: {
      remaining: IDLE_INTERVAL_MS,
      text: `הבא בעוד ${formatCountdown(IDLE_INTERVAL_MS)}`,
      full: false,
      needsSettle: true,
    },
  },
  {
    id: 7,
    name: "unseen=3, nextIdleAt invalid, prepared empty",
    state: {
      unseenCount: 3,
      idleCapacity: CAP,
      nextIdleAt: "not-a-date",
      preparedPulls: [],
    },
    expect: {
      remaining: IDLE_INTERVAL_MS,
      text: `הבא בעוד ${formatCountdown(IDLE_INTERVAL_MS)}`,
      full: false,
      needsSettle: true,
    },
  },
];

test("seven settleIdle edges: remaining/text/full/needsSettle and nextIdleAt after settle", () => {
  for (const item of CASES) {
    const view = idleCountdownCopy({ serverState: item.state, now: NOW });
    const settledAt = projectedSettleNextIdleAt(item.state, NOW);

    assert.equal(view.remaining, item.expect.remaining, `${item.id} remaining`);
    assert.equal(view.text, item.expect.text, `${item.id} text`);
    assert.equal(view.full, item.expect.full, `${item.id} full`);
    assert.equal(view.needsSettle, item.expect.needsSettle, `${item.id} needsSettle`);
    assert.equal(view.hidden, false, `${item.id} hidden`);
    assert.ok(settledAt > NOW, `${item.id} settleIdle nextIdleAt stays in the future`);

    if (view.full) {
      assert.equal(view.isClock, false, `${item.id} omits clock only when full`);
      assert.doesNotMatch(view.text, /\d{2}:\d{2}:\d{2}/);
      assert.equal(settledAt, NOW + IDLE_INTERVAL_MS, `${item.id} full warehouse nextIdleAt`);
      continue;
    }

    assert.equal(view.isClock, true, `${item.id} keeps a clock under capacity`);
    assert.match(view.text, /^הבא בעוד \d{2}:\d{2}:\d{2}$/);
    assert.notEqual(view.text, "הבא בעוד 00:00:00");
    assert.ok(view.remaining > 0, `${item.id} remaining > 0`);
    assert.equal(
      view.remaining,
      settledAt - NOW,
      `${item.id} countdown remaining matches settleIdle nextIdleAt`,
    );
  }
});
