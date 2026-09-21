export const TIPS_COOKIE = "klafi_tips";
export const TIPS_STORAGE = "klafi:tips";
export const PAGES_STORAGE = "klafi:page-tips";
export const TIPS_MAX_AGE = 31536000;

export const TIPS_STEPS = Object.freeze([
  {
    id: 1,
    ring: "#open-pack",
    arrowTo: "",
    title: "המשחק",
    body: "קלף אחד באיסוף. פתחו את החבילה.",
  },
  {
    id: 2,
    ring: "#pack-action",
    arrowTo: "#rip-stage",
    title: "קריעה",
    body: "קרעו. הקלף כבר שמור בשרת.",
  },
  {
    id: 3,
    ring: "#binder-grid .binder-shared-card, #binder-grid button, #dialog-card",
    emptyRing: 'button[data-nav="binder"]',
    arrowTo: "#dialog-whatsapp, #dialog-source",
    title: "האלבום",
    body: "הקלף באוסף. פתחו אותו — מקור ושיתוף למטה.",
  },
]);

export const PAGE_GUIDES = Object.freeze({
  home: Object.freeze([
    {
      ring: "#home-title",
      title: "היום",
      body: "מסך היום. האיסוף רץ גם בלי לגעת — פתיחה, שעון והמרוץ כאן.",
    },
    {
      ring: "#open-pack",
      arrowTo: "#cooldown-copy",
      title: "פתיחה",
      body: "כשיש קלף מוכן — פתיחת קלף. אחרת השעון כאן.",
    },
    {
      ring: ".today-docket",
      title: "המרוץ",
      body: "האתגר היומי וטבלת האספנים. מי אסף היום.",
    },
  ]),
  pack: Object.freeze([
    {
      ring: "#pack-action",
      arrowTo: "#rip-stage",
      title: "קריעה",
      body: "קרעו. הקלף כבר שמור בשרת.",
    },
  ]),
  binder: Object.freeze([
    {
      ring: "#earned-badge-rail, .binder-head",
      title: "האלבום",
      body: "כל הקלפים שנאספו. למעלה האחוז והתגים.",
    },
    {
      ring: "#binder-filters",
      emptyRing: "#binder-grid, #binder-empty",
      arrowTo: "#binder-grid .binder-shared-card, #binder-grid button",
      title: "הסדרות",
      body: "סינון לפי סדרה. לחצו על קלף — מקור ושיתוף.",
    },
  ]),
  achievements: Object.freeze([
    {
      ring: "#achievement-grid .achievement-badge, #achievement-grid, #achievements-empty",
      title: "הישגים",
      body: "תגים שנפתחים באיסוף ובמשחק. כאן מה כבר הושג.",
    },
  ]),
  growth: Object.freeze([
    {
      ring: "#community-tabs",
      title: "קהילה",
      body: "החלפות, סיעות, טבלת אספנים והאתגר היומי. כל לשונית היא לוח.",
    },
  ]),
  dialog: Object.freeze([
    {
      ring: "#dialog-card",
      arrowTo: "#dialog-whatsapp, #dialog-source",
      title: "הקלף",
      body: "הציטוט והאמנות. למטה המקור, וואטסאפ ושיתוף לסטורי.",
    },
  ]),
});

const PULL_PAGES = Object.freeze(["home", "pack", "binder", "dialog"]);

export function parseTipsCookie(header) {
  const match = String(header || "").match(/(?:^|;\s*)klafi_tips=(on|off)(?:;|$)/);
  return match?.[1] || null;
}

export function readTipsPref(env = globalThis) {
  try {
    const fromCookie = parseTipsCookie(env.document?.cookie);
    if (fromCookie) return fromCookie;
    const stored = env.localStorage?.getItem(TIPS_STORAGE);
    if (stored === "on" || stored === "off") return stored;
  } catch {
    // Private mode / blocked storage: fail quiet, default on.
  }
  return "on";
}

export function writeTipsPref(value, env = globalThis) {
  const next = value === "off" ? "off" : "on";
  try {
    env.document.cookie = `${TIPS_COOKIE}=${next}; Max-Age=${TIPS_MAX_AGE}; Path=/; SameSite=Lax`;
  } catch {}
  try {
    env.localStorage.setItem(TIPS_STORAGE, next);
  } catch {}
  return next;
}

export function shouldAutoOpen(pref, flags) {
  return pref === "on" && Boolean(flags?.homeActive) && !flags?.started;
}

export function readSeenPages(env = globalThis) {
  try {
    const raw = env.localStorage?.getItem(PAGES_STORAGE);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

export function writeSeenPages(seen, env = globalThis) {
  const next = seen && typeof seen === "object" ? seen : {};
  try {
    env.localStorage?.setItem(PAGES_STORAGE, JSON.stringify(next));
  } catch {}
  return next;
}

export function markPageSeen(page, env = globalThis) {
  if (!page) return readSeenPages(env);
  const seen = readSeenPages(env);
  seen[page] = true;
  return writeSeenPages(seen, env);
}

export function mutePageGuides(env = globalThis) {
  const seen = readSeenPages(env);
  seen["*"] = true;
  return writeSeenPages(seen, env);
}

export function shouldAutoOpenPage(seen, page) {
  return Boolean(page && PAGE_GUIDES[page] && !seen?.["*"] && !seen?.[page]);
}

export function activeGuidePage(flags) {
  if (flags?.dialogOpen) return "dialog";
  if (flags?.homeActive) return "home";
  if (flags?.packActive) return "pack";
  if (flags?.binderActive) return "binder";
  if (flags?.achievementsActive) return "achievements";
  if (flags?.growthActive) return "growth";
  return null;
}

export function pageGuideReady(page, flags) {
  return Boolean(page) && activeGuidePage(flags) === page;
}

export function firstVisible(selector, root) {
  if (!selector || !root?.querySelectorAll) return null;
  try {
    const nodes = [...root.querySelectorAll(selector)];
    const visible = nodes.find((node) => {
      const box = node.getBoundingClientRect?.() || { width: 0, height: 0 };
      return box.width > 0 && box.height > 0;
    });
    return visible || nodes[0] || null;
  } catch {
    return null;
  }
}

export function stepViewReady(stepId, flags) {
  if (stepId === 1) return Boolean(flags.homeActive);
  if (stepId === 2) return Boolean(flags.packActive);
  return Boolean(flags.binderActive || flags.dialogOpen);
}

export function advanceStepFromView(stepId, flags) {
  if (stepId === 1 && flags.packActive) return 2;
  if (stepId === 2 && (flags.binderActive || flags.dialogOpen)) return 3;
  return stepId;
}

export function leftoverPackHint(text) {
  return /הקלף כבר נשמר/.test(String(text || ""));
}

function boxOf(node) {
  const box = node.getBoundingClientRect();
  return { left: box.left, top: box.top, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
}

function inflate(box, pad) {
  return {
    left: box.left - pad,
    top: box.top - pad,
    width: box.width + pad * 2,
    height: box.height + pad * 2,
    right: box.right + pad,
    bottom: box.bottom + pad,
  };
}

function overlaps(left, top, width, height, box) {
  return left < box.right && left + width > box.left && top < box.bottom && top + height > box.top;
}

function arrowBand(from, to, thickness) {
  const left = Math.min(from.left, to.left) - thickness;
  const top = Math.min(from.top, to.top) - thickness;
  const right = Math.max(from.right, to.right) + thickness;
  const bottom = Math.max(from.bottom, to.bottom) + thickness;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function roundedHole(box, radius) {
  const r = Math.min(radius, box.width / 2, box.height / 2);
  const { left: x, top: y, width: w, height: h } = box;
  return `M${x + r} ${y}h${w - r * 2}a${r} ${r} 0 0 1 ${r} ${r}v${h - r * 2}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - r * 2)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - r * 2)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
}

function circleHole(cx, cy, radius) {
  return `M${cx - radius} ${cy}a${radius} ${radius} 0 1 0 ${radius * 2} 0a${radius} ${radius} 0 1 0 ${-radius * 2} 0`;
}

function highlightSpec(node, pad = 8) {
  const box = inflate(boxOf(node), pad);
  const style = typeof getComputedStyle === "function" ? getComputedStyle(node) : null;
  const computed = Number.parseFloat(style?.borderTopLeftRadius || "0") || 0;
  const compact = Math.max(box.width, box.height) <= 72 && box.width / box.height < 1.35 && box.height / box.width < 1.35;
  const pillish = node.matches?.("#open-pack, #pack-action, .primary-action, .share-icon-button, .contained-tabs button, .filter-strip button")
    || computed >= Math.min(box.width, box.height) / 2 - 1;
  const cardish = node.matches?.("#dialog-card, .binder-shared-card, .kalpi-card, .today-docket, #earned-badge-rail, #community-tabs, .work-card");
  if (compact || node.matches?.("button[data-nav]")) {
    const radius = Math.max(box.width, box.height) / 2 + 7;
    return { kind: "circle", box, cx: box.left + box.width / 2, cy: box.top + box.height / 2, radius };
  }
  if (pillish) {
    return { kind: "pill", box, radius: Math.min(box.width, box.height) / 2 };
  }
  if (node.matches?.("#rip-stage")) {
    const radius = 18;
    return { kind: "circle", box, cx: box.left + box.width / 2, cy: box.top + box.height / 2, radius, markOnly: true };
  }
  return { kind: "round", box, radius: Math.max(computed, cardish ? 14 : 12) };
}

function holePath(spec) {
  if (spec.kind === "circle") return circleHole(spec.cx, spec.cy, spec.radius);
  return roundedHole(spec.box, spec.radius);
}

function svgEl(name, attrs) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function drawRing(svg, spec) {
  if (spec.kind === "circle") {
    svg.append(svgEl("circle", { class: "klafi-tips-ring klafi-tips-ring-gold", cx: spec.cx, cy: spec.cy, r: spec.radius }));
    svg.append(svgEl("circle", { class: "klafi-tips-ring klafi-tips-ring-seal", cx: spec.cx, cy: spec.cy, r: Math.max(10, spec.radius - 4) }));
    return;
  }
  const { box, radius } = spec;
  svg.append(svgEl("rect", {
    class: "klafi-tips-ring klafi-tips-ring-gold",
    x: box.left, y: box.top, width: box.width, height: box.height, rx: radius, ry: radius,
  }));
  svg.append(svgEl("rect", {
    class: "klafi-tips-ring klafi-tips-ring-seal",
    x: box.left + 3.5, y: box.top + 3.5, width: Math.max(8, box.width - 7), height: Math.max(8, box.height - 7),
    rx: Math.max(6, radius - 3), ry: Math.max(6, radius - 3),
  }));
}

function placeCard(card, ring, to) {
  const pad = 16;
  const width = card.offsetWidth || 280;
  const height = card.offsetHeight || 190;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const forbidden = [inflate(ring, 14)];
  if (to) {
    forbidden.push(inflate(to, 12));
    forbidden.push(arrowBand(ring, to, 26));
  }
  const spots = [
    { left: vw - width - pad, top: pad },
    { left: vw - width - pad, top: vh - height - pad },
    { left: pad, top: pad },
    { left: pad, top: vh - height - pad },
    { left: Math.max(pad, (vw - width) / 2), top: pad },
    { left: Math.max(pad, (vw - width) / 2), top: vh - height - pad },
  ];
  const fit = spots.find(({ left, top }) => !forbidden.some((box) => overlaps(left, top, width, height, box)))
    || spots.find(({ left, top }) => !overlaps(left, top, width, height, forbidden[0]))
    || spots[0];
  card.style.left = `${Math.max(pad, Math.min(fit.left, vw - width - pad))}px`;
  card.style.top = `${Math.max(pad, Math.min(fit.top, vh - height - pad))}px`;
}

function drawArrow(svg, fromSpec, toSpec) {
  const start = fromSpec.kind === "circle"
    ? { x: fromSpec.cx, y: fromSpec.cy }
    : { x: fromSpec.box.left + fromSpec.box.width / 2, y: fromSpec.box.top + fromSpec.box.height / 2 };
  const end = toSpec.kind === "circle"
    ? { x: toSpec.cx, y: toSpec.cy }
    : { x: toSpec.box.left + toSpec.box.width / 2, y: toSpec.box.top + toSpec.box.height / 2 };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const fromR = fromSpec.kind === "circle" ? fromSpec.radius : Math.min(fromSpec.box.width, fromSpec.box.height) / 2;
  const toR = toSpec.kind === "circle" ? toSpec.radius : Math.min(toSpec.box.width, toSpec.box.height) / 2;
  const x1 = start.x + (dx / len) * (fromR + 6);
  const y1 = start.y + (dy / len) * (fromR + 6);
  const x2 = end.x - (dx / len) * (toR + 10);
  const y2 = end.y - (dy / len) * (toR + 10);
  const mx = (x1 + x2) / 2 + Math.max(-56, Math.min(56, -dy / len * 42));
  const my = (y1 + y2) / 2 + Math.max(-56, Math.min(56, dx / len * 42));
  svg.append(svgEl("path", {
    class: "klafi-tips-arrow",
    fill: "none",
    d: `M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`,
  }));
  const angle = Math.atan2(y2 - my, x2 - mx);
  const size = 11;
  svg.append(svgEl("polygon", {
    class: "klafi-tips-arrow-head",
    points: [
      `${x2},${y2}`,
      `${x2 - Math.cos(angle - 0.42) * size},${y2 - Math.sin(angle - 0.42) * size}`,
      `${x2 - Math.cos(angle + 0.42) * size},${y2 - Math.sin(angle + 0.42) * size}`,
    ].join(" "),
  }));
  svg.append(svgEl("circle", { class: "klafi-tips-dot", cx: x1, cy: y1, r: 4.5 }));
  svg.append(svgEl("circle", { class: "klafi-tips-dot", cx: x2, cy: y2, r: 3.5 }));
}

function readFlags(doc) {
  return {
    homeActive: Boolean(doc.querySelector("#home-view")?.classList.contains("active")),
    packActive: Boolean(doc.querySelector("#pack-view")?.classList.contains("active")),
    binderActive: Boolean(doc.querySelector("#binder-view")?.classList.contains("active")),
    achievementsActive: Boolean(doc.querySelector("#achievements-view")?.classList.contains("active")),
    growthActive: Boolean(doc.querySelector("#growth-view")?.classList.contains("active")),
    dialogOpen: Boolean(doc.querySelector("#card-dialog")?.open),
  };
}

export function attachKlafiTips(env = globalThis) {
  const doc = env.document;
  const overlay = doc.querySelector("#klafi-tips");
  const dim = doc.querySelector("#klafi-tips-dim");
  const marks = doc.querySelector("#klafi-tips-marks");
  const card = doc.querySelector("#klafi-tips-card");
  const title = doc.querySelector("#klafi-tips-title");
  const body = doc.querySelector("#klafi-tips-body");
  const stepLabel = doc.querySelector("#klafi-tips-step");
  const mute = doc.querySelector("#klafi-tips-mute");
  const nextBtn = doc.querySelector("#klafi-tips-next");
  const backBtn = doc.querySelector("#klafi-tips-back");
  const skipBtn = doc.querySelector("#klafi-tips-skip");
  const replay = doc.querySelector("#replay-tips");
  const packHint = doc.querySelector("#pack-hint");
  if (!overlay || !dim || !marks || !card) {
    return { sync() {}, maybeStart() {}, replay() {}, getState() { return { mode: null, started: false, step: 1, parked: false, page: null }; } };
  }

  const state = { mode: null, started: false, step: 1, parked: false, page: null };
  let drawTimer = 0;

  function flags() {
    return env.getFlags ? env.getFlags() : readFlags(doc);
  }

  function persistOff() {
    writeTipsPref("off", env);
    syncPackHint();
  }

  function persistOn() {
    writeTipsPref("on", env);
    syncPackHint();
  }

  function syncPackHint() {
    if (!packHint) return;
    const hide = leftoverPackHint(packHint.textContent) && readTipsPref(env) === "off";
    packHint.classList.toggle("visually-hidden", hide);
    packHint.classList.toggle("tips-covered", hide);
  }

  function host() {
    const dialog = doc.querySelector("#card-dialog");
    return dialog?.open ? dialog : overlay.parentElement === dialog ? doc.querySelector("#app") || doc.body : overlay.parentElement;
  }

  function park() {
    state.parked = true;
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
  }

  function hideOverlay() {
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
  }

  function currentSteps() {
    if (state.mode === "pull") return TIPS_STEPS;
    return PAGE_GUIDES[state.page] || [];
  }

  function firstPaintTarget(selector) {
    const node = firstVisible(selector, doc);
    const box = node?.getBoundingClientRect?.() || { width: 0, height: 0 };
    return box.width > 0 && box.height > 0 ? node : null;
  }

  function seedMute(kind) {
    if (!mute) return;
    mute.checked = kind === "pull";
    mute.dataset.seeded = kind;
  }

  function markPullPages() {
    for (const page of PULL_PAGES) markPageSeen(page, env);
  }

  function finish({ forceOff = false } = {}) {
    if (state.mode === "page" && state.page) {
      markPageSeen(state.page, env);
      if (forceOff || mute?.checked) mutePageGuides(env);
    } else if (state.mode === "pull") {
      markPullPages();
      if (forceOff || !mute || mute.checked) persistOff();
      else persistOn();
    }
    state.mode = null;
    state.started = false;
    state.parked = false;
    state.page = null;
    hideOverlay();
  }

  function paint() {
    try {
    const steps = currentSteps();
    const step = steps[state.step - 1];
    const ready = state.mode === "pull"
      ? stepViewReady(state.step, flags())
      : pageGuideReady(state.page, flags());
    if (!step || !ready) {
      park();
      return;
    }
    const ringNode = firstPaintTarget(step.ring) || firstPaintTarget(step.emptyRing) || firstVisible(step.ring, doc) || firstVisible(step.emptyRing, doc);
    if (!ringNode) {
      park();
      return;
    }
    const dest = host();
    if (dest && overlay.parentElement !== dest) dest.append(overlay);
    state.parked = false;
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    title.textContent = step.title;
    body.textContent = step.body;
    stepLabel.textContent = `${state.step} / ${steps.length}`;
    nextBtn.textContent = state.step === steps.length ? "הבנתי" : "הבא";
    skipBtn.hidden = state.step !== 1;
    backBtn.hidden = state.step === 1;
    if (mute && mute.dataset.seeded !== state.mode) seedMute(state.mode);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const preferredRing = state.mode === "pull" && state.step === 3 && flags().dialogOpen
      ? firstVisible("#dialog-card", doc)
      : null;
    const fromSpec = highlightSpec(preferredRing || ringNode, 8);
    const toNode = step.arrowTo ? firstPaintTarget(step.arrowTo) : null;
    const toSpec = toNode && toNode !== ringNode ? highlightSpec(toNode, 6) : null;
    dim.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
    dim.setAttribute("width", String(vw));
    dim.setAttribute("height", String(vh));
    dim.replaceChildren();
    dim.append(svgEl("path", {
      "fill-rule": "evenodd",
      class: "klafi-tips-veil",
      d: `M0 0H${vw}V${vh}H0Z${holePath(fromSpec)}`,
    }));
    marks.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
    marks.setAttribute("width", String(vw));
    marks.setAttribute("height", String(vh));
    marks.replaceChildren();
    if (!fromSpec.markOnly) drawRing(marks, fromSpec);
    if (toSpec) {
      drawRing(marks, toSpec);
      drawArrow(marks, fromSpec, toSpec);
    }
    placeCard(card, fromSpec.box, toSpec?.box || null);
    queueMicrotask(() => nextBtn?.focus({ preventScroll: true }));
    } catch {
      park();
    }
  }

  function schedulePaint() {
    cancelAnimationFrame(drawTimer);
    drawTimer = requestAnimationFrame(paint);
  }

  function startPage(page) {
    state.mode = "page";
    state.started = true;
    state.page = page;
    state.step = 1;
    state.parked = false;
    seedMute("page");
    schedulePaint();
  }

  function maybeStartPage() {
    if (state.mode === "pull") return;
    const page = activeGuidePage(flags());
    if (!shouldAutoOpenPage(readSeenPages(env), page)) return;
    startPage(page);
  }

  function sync() {
    syncPackHint();
    if (state.mode === "pull") {
      if (!state.started) return;
      state.step = advanceStepFromView(state.step, flags());
      if (stepViewReady(state.step, flags())) schedulePaint();
      else park();
      return;
    }
    if (state.mode === "page") {
      const page = activeGuidePage(flags());
      if (page === state.page) {
        if (pageGuideReady(state.page, flags())) schedulePaint();
        else park();
        return;
      }
      park();
      state.mode = null;
      state.started = false;
      state.page = null;
      maybeStartPage();
      return;
    }
    maybeStartPage();
  }

  function maybeStart() {
    if (state.mode === "pull") return;
    maybeStartPage();
  }

  function replayTour() {
    persistOn();
    state.mode = "pull";
    state.started = true;
    state.step = 1;
    state.page = null;
    state.parked = false;
    seedMute("pull");
    sync();
  }

  function goNext() {
    if (state.step >= currentSteps().length) {
      finish();
      return;
    }
    state.step += 1;
    sync();
  }

  function goBack() {
    state.step = Math.max(1, state.step - 1);
    sync();
  }

  nextBtn?.addEventListener("click", goNext);
  backBtn?.addEventListener("click", goBack);
  skipBtn?.addEventListener("click", () => finish({ forceOff: state.mode === "pull" }));
  replay?.addEventListener("click", replayTour);
  window.addEventListener("resize", () => { if (state.started && !state.parked) schedulePaint(); });
  doc.addEventListener("scroll", () => { if (state.started && !state.parked) schedulePaint(); }, true);
  const dialog = doc.querySelector("#card-dialog");
  if (dialog) {
    const observer = new MutationObserver(() => sync());
    observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
  }
  for (const id of ["home-view", "pack-view", "binder-view", "achievements-view", "growth-view"]) {
    const view = doc.querySelector(`#${id}`);
    if (!view) continue;
    new MutationObserver(() => sync()).observe(view, { attributes: true, attributeFilter: ["class"] });
  }
  const binderGrid = doc.querySelector("#binder-grid");
  if (binderGrid) {
    const observer = new MutationObserver(() => {
      if (state.mode === "pull" && state.step === 3) sync();
      if (state.mode === "page" && state.page === "binder") sync();
    });
    observer.observe(binderGrid, { childList: true, subtree: true });
  }
  const binderFilters = doc.querySelector("#binder-filters");
  if (binderFilters) {
    new MutationObserver(() => { if (state.mode === "page" && state.page === "binder") sync(); })
      .observe(binderFilters, { childList: true, subtree: true });
  }
  const achievementGrid = doc.querySelector("#achievement-grid");
  if (achievementGrid) {
    new MutationObserver(() => { if (state.mode === "page" && state.page === "achievements") sync(); })
      .observe(achievementGrid, { childList: true, subtree: true });
  }
  const communityTabs = doc.querySelector("#community-tabs");
  if (communityTabs) {
    new MutationObserver(() => { if (state.mode === "page" && state.page === "growth") sync(); })
      .observe(communityTabs, { attributes: true, subtree: true, attributeFilter: ["class", "aria-selected"] });
  }

  return {
    sync,
    maybeStart,
    replay: replayTour,
    getState() { return { ...state }; },
  };
}
