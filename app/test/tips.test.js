import assert from "node:assert/strict";
import test from "node:test";
import {
  TIPS_COOKIE,
  TIPS_STORAGE,
  PAGES_STORAGE,
  TIPS_STEPS,
  CARD_CALLOUTS,
  PAGE_GUIDES,
  calloutBadgePoint,
  calloutStub,
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
  assert.equal(TIPS_STEPS.length, 1);
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
  assert.equal(advanceStepFromView(1, { packActive: true }), 1);
  assert.equal(advanceStepFromView(1, { binderActive: true }), 1);
  assert.equal(stepViewReady(1, { packActive: true }), true);
  assert.equal(stepViewReady(1, { cardRevealed: true }), true);
  assert.equal(stepViewReady(1, { homeActive: true }), true);
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
  assert.deepEqual(Object.keys(PAGE_GUIDES), ["home", "pack", "card", "binder", "achievements", "growth", "dialog"]);
  assert.equal(PAGE_GUIDES.home.length, 7);
  assert.equal(PAGE_GUIDES.binder.length, 4);
  assert.equal(PAGE_GUIDES.achievements.length, 2);
  assert.equal(PAGE_GUIDES.growth.length, 4);
  assert.equal(PAGE_GUIDES.card.length, 2);
  assert.equal(PAGE_GUIDES.dialog.length, 2);
  assert.match(PAGE_GUIDES.home[0].title, /המטרה/);
  assert.match(PAGE_GUIDES.home[0].body, /מטרת המשחק היא לאסוף/);
  assert.match(PAGE_GUIDES.home[0].body, /בחירות 2026/);
  assert.match(PAGE_GUIDES.home[0].body, /עותק אחד בלבד/);
  assert.match(PAGE_GUIDES.home[0].ring, /today-hero/);
  assert.equal(PAGE_GUIDES.home[0].ringUnion, undefined);
  assert.match(PAGE_GUIDES.home[1].body, /היום/);
  assert.match(PAGE_GUIDES.home[1].ring, /today-open-cue|cooldown-copy/);
  assert.match(PAGE_GUIDES.home[1].body, /כל שלוש שעות/);
  assert.match(PAGE_GUIDES.home[1].body, /8 חבילות/);
  assert.match(PAGE_GUIDES.home[1].body, /השעון/);
  assert.equal(PAGE_GUIDES.home[1].ringUnion, true);
  assert.match(PAGE_GUIDES.home[2].body, /יש חבילות שמחכות/);
  assert.match(PAGE_GUIDES.home[2].body, /פתיחת קלף/);
  assert.match(PAGE_GUIDES.home[3].ring, /level-avatar-button/);
  assert.match(PAGE_GUIDES.home[3].ring, /level-streak/);
  assert.match(PAGE_GUIDES.home[3].ring, /player-name/);
  assert.equal(PAGE_GUIDES.home[3].ringUnion, true);
  assert.equal(PAGE_GUIDES.home[3].pad, 16);
  assert.equal(PAGE_GUIDES.home[3].clipPad, 2);
  assert.match(PAGE_GUIDES.home[3].body, /התמונה שלכם/);
  assert.match(PAGE_GUIDES.home[3].body, /השם \(הזמני\)/);
  assert.match(PAGE_GUIDES.home[3].body, /ליגות, תחרויות וטבלאות/);
  assert.match(PAGE_GUIDES.home[3].body, /לחץ עליו כדי לשנות/);
  assert.match(PAGE_GUIDES.home[4].body, /האתגר היומי/);
  assert.match(PAGE_GUIDES.home[4].body, /בטופ/);
  assert.equal(PAGE_GUIDES.home[5].ring, ".bottom-nav");
  assert.match(PAGE_GUIDES.home[5].body, /תפריט הניווט/);
  assert.match(PAGE_GUIDES.home[5].body, /לדווח על באגים/);
  assert.match(PAGE_GUIDES.home[5].body, /לבקש פיצ׳רים/);
  assert.equal(PAGE_GUIDES.home[5].ringUnion, undefined);
  assert.equal(PAGE_GUIDES.home[5].place, "above");
  assert.equal(PAGE_GUIDES.home[6].ring, "#open-pack");
  assert.equal(PAGE_GUIDES.home[6].title, "יאללה, בואו נפתח!");
  assert.equal(PAGE_GUIDES.home[6].body, "יאללה, בואו נפתח!");
  assert.equal(CARD_CALLOUTS.length, 5);
  assert.deepEqual(CARD_CALLOUTS.map(({ label }) => label), ["ציטוט", "שם", "מפלגה", "נדירות", "סדרה"]);
  assert.equal(PAGE_GUIDES.card[0].callouts, CARD_CALLOUTS);
  assert.match(PAGE_GUIDES.card[0].body, /ציטוט שלו \(1\)/);
  assert.match(PAGE_GUIDES.card[0].body, /נדירות הקלף \(4\)/);
  assert.match(PAGE_GUIDES.card[0].body, /הסט והמספר של הקלף \(5\)/);
  assert.match(PAGE_GUIDES.card[0].body, /מיקומו באלבום/);
  assert.equal(PAGE_GUIDES.card[0].place, "top");
  assert.equal(PAGE_GUIDES.card[0].hideLegend, true);
  assert.equal(PAGE_GUIDES.card[1].title, "הוספה לאוסף");
  assert.equal(PAGE_GUIDES.card[1].body, "ברכותיי על הקלף החדש! לחצו לאוסף כדי להכניס אותו לאלבום שלכם.");
  assert.equal(PAGE_GUIDES.card[1].ring, "#pack-action");
  for (const steps of [...Object.values(PAGE_GUIDES), TIPS_STEPS]) {
    for (const step of steps) {
      assert.doesNotMatch(step.body, /\u2014/, `${step.title} body uses a normal dash`);
      assert.doesNotMatch(step.title, /\u2014/, `${step.title} uses a normal dash`);
    }
  }
  assert.match(CARD_CALLOUTS[3].sel, /card-rarity-run|card-image-meta/);
  assert.match(PAGE_GUIDES.binder[0].body, /שיתוף האלבום/);
  assert.match(PAGE_GUIDES.binder[0].body, /להשוויץ לחברים/);
  assert.match(PAGE_GUIDES.binder[0].body, /כל הקלפים במשחק/);
  assert.match(PAGE_GUIDES.binder[0].ring, /binder-stats-row|binder-head/);
  assert.equal(PAGE_GUIDES.binder[0].arrowTo, undefined);
  assert.match(PAGE_GUIDES.binder[1].title, /תגים/);
  assert.match(PAGE_GUIDES.binder[1].ring, /earned-badge-list|collection-star-count/);
  assert.match(PAGE_GUIDES.binder[1].body, /כוכבי האוסף/);
  assert.match(PAGE_GUIDES.binder[1].body, /סימני היכר/);
  assert.match(PAGE_GUIDES.binder[2].body, /סדרה/);
  assert.match(PAGE_GUIDES.binder[2].body, /תנסו ללחוץ על קלף שהשגתם/);
  assert.match(PAGE_GUIDES.binder[2].body, /מקור לציטוט/);
  assert.match(PAGE_GUIDES.binder[3].title, /גודל השורה/);
  assert.match(PAGE_GUIDES.binder[3].ring, /#binder-grid/);
  assert.match(PAGE_GUIDES.binder[3].body, /לצבוט את האלבום/);
  assert.match(PAGE_GUIDES.binder[3].body, /כל קלף נשאר שלם/);
  assert.doesNotMatch(PAGE_GUIDES.growth[0].body, /שתי קומות/);
  assert.match(PAGE_GUIDES.growth[0].body, /בקהילה ניתן להחליף/);
  assert.match(PAGE_GUIDES.growth[0].body, /הציעו טרייד/);
  assert.doesNotMatch(PAGE_GUIDES.growth[3].body, /שתי קומות/);
  assert.match(PAGE_GUIDES.growth[0].ring, /community-sections/);
  assert.match(PAGE_GUIDES.growth[1].body, /הצעה להחלפה/);
  assert.match(PAGE_GUIDES.growth[2].body, /הצעות/);
  assert.match(PAGE_GUIDES.growth[2].body, /לפלטר/);
  assert.match(PAGE_GUIDES.growth[3].ring, /community-section-race|community-tab-leagues|community-tab-challenge/);
  assert.match(PAGE_GUIDES.growth[3].body, /ליגות/);
  assert.match(PAGE_GUIDES.growth[3].body, /האתגר היומי/);
  assert.match(PAGE_GUIDES.growth[3].body, /מפלגות/);
  assert.match(PAGE_GUIDES.growth[3].body, /אולי אלו אתם/);
  assert.match(PAGE_GUIDES.achievements[0].ring, /achievement-tiers/);
  assert.match(PAGE_GUIDES.achievements[0].body, /הקלים/);
  assert.match(PAGE_GUIDES.achievements[0].body, /המשימות על הפרק/);
  assert.match(PAGE_GUIDES.achievements[1].ring, /achievement-grid/);
  assert.match(PAGE_GUIDES.achievements[1].body, /מד התקדמות/);
  assert.match(PAGE_GUIDES.achievements[1].body, /מעל האלבום/);
  assert.equal(PAGE_GUIDES.achievements[1].place, "above");
  assert.equal(PAGE_GUIDES.growth[0].ringUnion, true);
  assert.equal(TIPS_STEPS[0].title, "ברכותיי על הקלף החדש!");
  assert.equal(TIPS_STEPS[0].body, "לחצו לאוסף כדי להכניס אותו לאלבום שלכם.");
  assert.equal(TIPS_STEPS[0].ring, "#pack-action");
  assert.equal(TIPS_STEPS[1], undefined);
  assert.equal(PAGE_GUIDES.pack.length, 0);
  assert.equal(shouldAutoOpenPage({}, "pack"), false);
  assert.match(PAGE_GUIDES.dialog[0].body, /מי לא אוהב להתרפק/);
  assert.match(PAGE_GUIDES.dialog[0].body, /לכמה עוד אנשים/);
  assert.match(PAGE_GUIDES.dialog[1].ring, /dialog-whatsapp|dialog-instagram/);
  assert.match(PAGE_GUIDES.dialog[1].body, /להשוויץ לחברים/);
  assert.match(PAGE_GUIDES.dialog[1].body, /רק לראות - לא לגעת/);
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
  assert.equal(activeGuidePage({ packActive: true, cardRevealed: true }), "card");
  assert.equal(activeGuidePage({ packActive: true, cardRevealed: true }, { card: true }), "pack");
  assert.equal(activeGuidePage({ achievementsActive: true }), "achievements");
  assert.equal(activeGuidePage({ growthActive: true }), "growth");
  assert.equal(pageGuideReady("binder", { binderActive: true }), true);
  assert.equal(pageGuideReady("binder", { homeActive: true }), false);
  assert.equal(pageGuideReady("pack", { packActive: true, cardRevealed: true }), true);
  assert.equal(pageGuideReady("card", { cardRevealed: true }), true);
  assert.equal(pageGuideReady("card", { packActive: true }), false);
  const badge = calloutBadgePoint(
    { left: 40, right: 300, top: 80, bottom: 500 },
    { left: 60, right: 280, top: 400, bottom: 440, height: 40 },
    "start",
    { width: 390, height: 844 },
  );
  assert.equal(badge.x, 289);
  assert.equal(badge.y, 420);
  const chip = calloutBadgePoint(
    { left: 40, right: 300, top: 80, bottom: 500 },
    { left: 250, right: 274, top: 96, bottom: 120, height: 24 },
    "chip",
    { width: 390, height: 844 },
  );
  assert.equal(chip.x, 294);
  const stub = calloutStub(289, 420, 170, 420);
  assert.equal(stub.reach, 16);
  assert.ok(Math.abs(stub.x2 - 273) < 0.5);
  const topCard = { offsetWidth: 300, offsetHeight: 180, style: {} };
  const cardRing = { left: 40, top: 210, width: 310, height: 420, right: 350, bottom: 630 };
  placeCard(topCard, cardRing, null, "top", { width: 390, height: 844 }, { querySelector: () => null });
  assert.equal(topCard.style.top, "16px");
  assert.ok(Number.parseFloat(topCard.style.left) > 16, "top coachmark stays off the left series mark");
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
