import assert from "node:assert/strict";
import test from "node:test";
import {
  TIPS_COOKIE,
  TIPS_STORAGE,
  TIPS_STEPS,
  advanceStepFromView,
  firstVisible,
  leftoverPackHint,
  parseTipsCookie,
  readTipsPref,
  shouldAutoOpen,
  stepViewReady,
  writeTipsPref,
} from "../public/tips.js";

test("cookie off stops auto-open; replay re-enables later views", () => {
  assert.equal(TIPS_STEPS.length, 3);
  assert.equal(TIPS_COOKIE, "klafi_tips");
  assert.equal(TIPS_STORAGE, "klafi:tips");
  assert.equal(parseTipsCookie("theme=dark; klafi_tips=off; other=1"), "off");
  assert.equal(shouldAutoOpen("off", { homeActive: true, started: false }), false);
  assert.equal(shouldAutoOpen("on", { homeActive: true, started: false }), true);
  assert.equal(shouldAutoOpen("on", { homeActive: false, started: false }), false);

  const store = {};
  const env = {
    document: { cookie: "" },
    localStorage: {
      getItem: (key) => store[key] ?? null,
      setItem: (key, value) => { store[key] = value; },
    },
  };
  writeTipsPref("off", env);
  assert.match(env.document.cookie, /klafi_tips=off/);
  assert.match(env.document.cookie, /Max-Age=31536000/);
  assert.match(env.document.cookie, /SameSite=Lax/);
  assert.equal(store[TIPS_STORAGE], "off");
  assert.equal(readTipsPref(env), "off");
  assert.equal(shouldAutoOpen(readTipsPref(env), { homeActive: true, started: false }), false);

  writeTipsPref("on", env);
  assert.equal(readTipsPref(env), "on");
  assert.equal(shouldAutoOpen(readTipsPref(env), { homeActive: true, started: false }), true);
  assert.equal(advanceStepFromView(1, { packActive: true }), 2);
  assert.equal(advanceStepFromView(2, { binderActive: true }), 3);
  assert.equal(stepViewReady(2, { packActive: false }), false);
  assert.equal(stepViewReady(2, { packActive: true }), true);
  assert.equal(stepViewReady(3, { dialogOpen: true }), true);
});

test("firstVisible falls back when boxes are 0x0 and leftover pack hint is recognized", () => {
  const zero = { getBoundingClientRect: () => ({ width: 0, height: 0 }) };
  const real = { getBoundingClientRect: () => ({ width: 40, height: 18 }) };
  const root = {
    querySelectorAll: () => [zero, real],
  };
  assert.equal(firstVisible("#open-pack", root), real);
  const happy = { querySelectorAll: () => [zero] };
  assert.equal(firstVisible("#open-pack", happy), zero);
  assert.equal(leftoverPackHint("הקלף כבר נשמר."), true);
  assert.equal(leftoverPackHint("הקלף הבא בעוד 03:00:00"), false);
});
