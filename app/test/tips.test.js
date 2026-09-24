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
  navReserve,
  placeCard,
  markPageSeen,
  mutePageGuides,
  resetAllPageGuides,
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
  assert.equal(leftoverPackHint("הקלף כבר שמור אצלכם."), true);
  assert.equal(leftoverPackHint("הקלף הבא בעוד 03:00:00"), false);
});

test("each nav page has a first-visit guide; seen pages and mute stop auto-open", () => {
  assert.deepEqual(Object.keys(PAGE_GUIDES), ["home", "pack", "binder", "achievements", "growth", "dialog"]);
  assert.equal(PAGE_GUIDES.home.length, 5);
  assert.equal(PAGE_GUIDES.binder.length, 2);
  assert.equal(PAGE_GUIDES.achievements.length, 1);
  assert.equal(PAGE_GUIDES.growth.length, 4);
  assert.match(PAGE_GUIDES.home[0].body, /היום/);
  assert.match(PAGE_GUIDES.home[0].ring, /today-open-copy|#home-title/);
  assert.match(PAGE_GUIDES.home[0].body, /המחסן/);
  assert.match(PAGE_GUIDES.home[0].body, /השעון/);
  assert.match(PAGE_GUIDES.home[1].body, /רואים אותו/);
  assert.match(PAGE_GUIDES.home[2].ring, /level-avatar-button/);
  assert.match(PAGE_GUIDES.home[2].body, /אווטאר/);
  assert.match(PAGE_GUIDES.home[3].body, /האתגר/);
  assert.match(PAGE_GUIDES.home[4].ring, /open-advocacy|open-bug-report|bottom-nav/);
  assert.match(PAGE_GUIDES.home[4].body, /גילוי נאות/);
  assert.match(PAGE_GUIDES.home[4].body, /דיווח באג/);
  assert.equal(PAGE_GUIDES.home[4].ringUnion, true);
  assert.equal(PAGE_GUIDES.home[4].place, "above");
  assert.match(PAGE_GUIDES.binder[0].body, /תמונה/);
  assert.match(PAGE_GUIDES.binder[0].ring, /earned-badge-list/);
  assert.match(PAGE_GUIDES.binder[1].body, /סדרה/);
  assert.match(PAGE_GUIDES.binder[1].body, /מעל הניווט/);
  assert.match(PAGE_GUIDES.growth[0].body, /החלפות/);
  assert.match(PAGE_GUIDES.growth[0].ring, /community-sections/);
  assert.match(PAGE_GUIDES.growth[1].body, /מפרסמים/);
  assert.match(PAGE_GUIDES.growth[2].body, /הצעות/);
  assert.match(PAGE_GUIDES.growth[3].ring, /community-section-race/);
  assert.match(PAGE_GUIDES.growth[3].body, /מחסן/);
  assert.match(PAGE_GUIDES.achievements[0].body, /כל התגים/);
  assert.match(PAGE_GUIDES.achievements[0].body, /פס התקדמות/);
  assert.match(PAGE_GUIDES.achievements[0].body, /מעל האלבום/);
  assert.equal(PAGE_GUIDES.achievements[0].place, "above");
  assert.equal(PAGE_GUIDES.achievements[0].ringUnion, true);
  assert.equal(PAGE_GUIDES.growth[0].ringUnion, true);
  assert.match(TIPS_STEPS[0].body, /מחסן/);
  assert.match(TIPS_STEPS[1].body, /רואים את הקלף/);
  assert.match(PAGE_GUIDES.pack[0].body, /מחסן/);
  assert.match(PAGE_GUIDES.dialog[0].body, /תמונה בלבד/);
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
  assert.equal(shouldAutoOpenPage({}, "binder", { guestBinder: true }), false);
  assert.equal(shouldAutoOpenPage({}, "binder", { guestBinder: false }), true);

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
  resetAllPageGuides(env);
  assert.deepEqual(readSeenPages(env), {});
  assert.equal(shouldAutoOpenPage(readSeenPages(env), "home"), true);
  assert.equal(shouldAutoOpenPage(readSeenPages(env), "binder"), true);
});

test("coachmark card stays clear of the measured bottom nav", () => {
  assert.equal(navReserve({ querySelector: () => null }, 915), 56);
  const nav = {
    hidden: false,
    getBoundingClientRect: () => ({ left: 0, top: 853, right: 412, bottom: 915, width: 412, height: 62 }),
  };
  const doc = { querySelector: (sel) => (sel === ".top-nav-row" || sel === ".bottom-nav" ? nav : null) };
  assert.equal(navReserve(doc, 915), 70);
  const card = { offsetWidth: 280, offsetHeight: 190, style: {} };
  const ring = { left: 12, top: 210, width: 388, height: 44, right: 400, bottom: 254 };
  placeCard(card, ring, null, "", { width: 412, height: 915 }, doc);
  const top = Number.parseFloat(card.style.top);
  assert.ok(Number.isFinite(top));
  assert.ok(top + 190 <= 853, `card bottom ${top + 190} overlaps nav at 853`);
});
