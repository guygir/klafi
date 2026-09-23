import assert from "node:assert/strict";
import test from "node:test";
import {
  TIPS_COOKIE,
  TIPS_STORAGE,
  PAGES_STORAGE,
  TIPS_STEPS,
  PAGE_GUIDES,
  unionBoxes,
  intersectBox,
  toFrame,
  specToFrame,
  activeGuidePage,
  advanceStepFromView,
  firstVisible,
  leftoverPackHint,
  markPageSeen,
  mutePageGuides,
  unmarkPageSeen,
  pageGuideReady,
  parseTipsCookie,
  readSeenPages,
  readTipsPref,
  shouldAutoOpen,
  shouldAutoOpenPage,
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

test("each nav page has a first-visit guide; seen pages and mute stop auto-open", () => {
  assert.deepEqual(Object.keys(PAGE_GUIDES), ["home", "pack", "binder", "achievements", "growth", "dialog"]);
  assert.equal(PAGE_GUIDES.home.length, 3);
  assert.equal(PAGE_GUIDES.binder.length, 2);
  assert.equal(PAGE_GUIDES.achievements.length, 1);
  assert.equal(PAGE_GUIDES.growth.length, 3);
  assert.match(PAGE_GUIDES.home[0].body, /היום/);
  assert.match(PAGE_GUIDES.home[0].ring, /today-open-cue/);
  assert.match(PAGE_GUIDES.home[0].body, /השעון/);
  assert.match(PAGE_GUIDES.binder[0].body, /תמונה/);
  assert.match(PAGE_GUIDES.binder[1].body, /סדרה/);
  assert.match(PAGE_GUIDES.growth[0].body, /החלפות/);
  assert.match(PAGE_GUIDES.growth[1].body, /מפרסמים/);
  assert.match(PAGE_GUIDES.growth[2].body, /הצעות/);
  assert.match(PAGE_GUIDES.achievements[0].body, /כל התגים/);
  assert.match(PAGE_GUIDES.achievements[0].body, /פס התקדמות/);
  assert.equal(PAGE_GUIDES.achievements[0].place, "above");
  assert.equal(PAGE_GUIDES.achievements[0].ringUnion, true);
  assert.equal(PAGE_GUIDES.growth[0].ringUnion, true);
  assert.equal(PAGE_GUIDES.growth[0].ring, "#community-tabs");
  const shifted = toFrame(
    { left: 20, top: 30, width: 10, height: 8, right: 30, bottom: 38 },
    { left: 8, top: 8 },
  );
  assert.equal(shifted.left, 12);
  assert.equal(shifted.top, 22);
  assert.equal(shifted.right, 22);
  assert.equal(shifted.bottom, 30);
  const local = specToFrame({ kind: "circle", box: { left: 20, top: 30, width: 10, height: 8, right: 30, bottom: 38 }, cx: 25, cy: 34, radius: 12 }, { left: 8, top: 8 });
  assert.equal(local.cx, 17);
  assert.equal(local.cy, 26);
  assert.equal(local.box.left, 12);
  const left = { getBoundingClientRect: () => ({ left: 10, top: 80, width: 40, height: 20, right: 50, bottom: 100 }) };
  const right = { getBoundingClientRect: () => ({ left: 60, top: 90, width: 30, height: 25, right: 90, bottom: 115 }) };
  const offscreen = { getBoundingClientRect: () => ({ left: -80, top: 80, width: 40, height: 20, right: -40, bottom: 100 }) };
  const clip = { getBoundingClientRect: () => ({ left: 8, top: 78, width: 70, height: 30, right: 78, bottom: 108 }) };
  const united = unionBoxes([left, right]);
  assert.equal(united.left, 10);
  assert.equal(united.top, 80);
  assert.equal(united.right, 90);
  assert.equal(united.bottom, 115);
  const clipped = unionBoxes([left, right, offscreen], clip);
  assert.equal(clipped.left, 10);
  assert.equal(clipped.right, 78);
  assert.equal(intersectBox(
    { left: 10, top: 80, right: 50, bottom: 100 },
    { left: 8, top: 78, right: 78, bottom: 108 },
  ).width, 40);
  assert.equal(PAGES_STORAGE, "klafi:page-tips");
  assert.equal(activeGuidePage({ homeActive: true }), "home");
  assert.equal(activeGuidePage({ binderActive: true, dialogOpen: true }), "dialog");
  assert.equal(activeGuidePage({ achievementsActive: true }), "achievements");
  assert.equal(activeGuidePage({ growthActive: true }), "growth");
  assert.equal(pageGuideReady("binder", { binderActive: true }), true);
  assert.equal(pageGuideReady("binder", { homeActive: true }), false);
  assert.equal(shouldAutoOpenPage({}, "home"), true);
  assert.equal(shouldAutoOpenPage({ home: true }, "home"), false);
  assert.equal(shouldAutoOpenPage({ home: true }, "binder"), true);
  assert.equal(shouldAutoOpenPage({ "*": true }, "binder"), false);
  assert.equal(shouldAutoOpenPage({}, "studio"), false);

  const store = {};
  const env = {
    localStorage: {
      getItem: (key) => store[key] ?? null,
      setItem: (key, value) => { store[key] = value; },
    },
  };
  assert.deepEqual(readSeenPages(env), {});
  markPageSeen("home", env);
  assert.equal(JSON.parse(store[PAGES_STORAGE]).home, true);
  assert.equal(shouldAutoOpenPage(readSeenPages(env), "home"), false);
  assert.equal(shouldAutoOpenPage(readSeenPages(env), "binder"), true);
  unmarkPageSeen("home", env);
  assert.equal(shouldAutoOpenPage(readSeenPages(env), "home"), true);
  markPageSeen("home", env);
  mutePageGuides(env);
  assert.equal(shouldAutoOpenPage(readSeenPages(env), "binder"), false);
});
