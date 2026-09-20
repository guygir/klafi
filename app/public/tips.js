export const TIPS_COOKIE = "klafi_tips";
export const TIPS_STORAGE = "klafi:tips";
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
    || spots[0];
  card.style.left = `${Math.max(pad, Math.min(fit.left, vw - width - pad))}px`;
  card.style.top = `${Math.max(pad, Math.min(fit.top, vh - height - pad))}px`;
}

function drawArrow(svg, from, to) {
  const start = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
  const end = { x: to.left + to.width / 2, y: to.top + to.height / 2 };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const inset = Math.min(from.width, from.height) / 2 + 10;
  const tipInset = Math.min(to.width, to.height) / 2 + 8;
  const x1 = start.x + (dx / len) * inset;
  const y1 = start.y + (dy / len) * inset;
  const x2 = end.x - (dx / len) * tipInset;
  const y2 = end.y - (dy / len) * tipInset;
  const mx = (x1 + x2) / 2 + Math.max(-48, Math.min(48, -dy / len * 36));
  const my = (y1 + y2) / 2 + Math.max(-48, Math.min(48, dx / len * 36));
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", `M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`);
  path.setAttribute("class", "klafi-tips-arrow");
  path.setAttribute("fill", "none");
  svg.append(path);
  const angle = Math.atan2(y2 - my, x2 - mx);
  const head = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  const size = 9;
  head.setAttribute("class", "klafi-tips-arrow-head");
  head.setAttribute("points", [
    `${x2},${y2}`,
    `${x2 - Math.cos(angle - 0.45) * size},${y2 - Math.sin(angle - 0.45) * size}`,
    `${x2 - Math.cos(angle + 0.45) * size},${y2 - Math.sin(angle + 0.45) * size}`,
  ].join(" "));
  svg.append(head);
}

function readFlags(doc) {
  return {
    homeActive: Boolean(doc.querySelector("#home-view")?.classList.contains("active")),
    packActive: Boolean(doc.querySelector("#pack-view")?.classList.contains("active")),
    binderActive: Boolean(doc.querySelector("#binder-view")?.classList.contains("active")),
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
    return { sync() {}, maybeStart() {}, replay() {}, getState() { return { started: false, step: 1, parked: false }; } };
  }

  const state = { started: false, step: 1, parked: false };
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

  function finish({ forceOff = false } = {}) {
    state.started = false;
    state.parked = false;
    hideOverlay();
    if (forceOff || !mute || mute.checked) persistOff();
    else persistOn();
  }

  function paint() {
    const step = TIPS_STEPS[state.step - 1];
    if (!step || !stepViewReady(state.step, flags())) {
      park();
      return;
    }
    const ringNode = firstVisible(step.ring, doc) || (step.emptyRing ? firstVisible(step.emptyRing, doc) : null);
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
    stepLabel.textContent = `${state.step} / ${TIPS_STEPS.length}`;
    nextBtn.textContent = state.step === TIPS_STEPS.length ? "הבנתי" : "הבא";
    skipBtn.hidden = state.step !== 1;
    backBtn.hidden = state.step === 1;
    if (mute) mute.checked = true;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const ring = inflate(boxOf(ringNode), 8);
    const toNode = step.arrowTo ? firstVisible(step.arrowTo, doc) : null;
    const to = toNode && toNode !== ringNode ? boxOf(toNode) : null;
    dim.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
    dim.setAttribute("width", String(vw));
    dim.setAttribute("height", String(vh));
    dim.replaceChildren();
    const veil = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    veil.setAttribute("fill-rule", "evenodd");
    veil.setAttribute("class", "klafi-tips-veil");
    veil.setAttribute("d", `M0 0H${vw}V${vh}H0Z${roundedHole(ring, 16)}`);
    dim.append(veil);
    marks.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
    marks.setAttribute("width", String(vw));
    marks.setAttribute("height", String(vh));
    marks.replaceChildren();
    const halo = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
    halo.setAttribute("class", "klafi-tips-ring");
    halo.setAttribute("x", String(ring.left));
    halo.setAttribute("y", String(ring.top));
    halo.setAttribute("width", String(ring.width));
    halo.setAttribute("height", String(ring.height));
    halo.setAttribute("rx", "16");
    marks.append(halo);
    if (to) drawArrow(marks, ring, inflate(to, 4));
    placeCard(card, ring, to);
    queueMicrotask(() => nextBtn?.focus({ preventScroll: true }));
  }

  function schedulePaint() {
    cancelAnimationFrame(drawTimer);
    drawTimer = requestAnimationFrame(paint);
  }

  function sync() {
    syncPackHint();
    if (!state.started) return;
    state.step = advanceStepFromView(state.step, flags());
    if (stepViewReady(state.step, flags())) schedulePaint();
    else park();
  }

  function maybeStart() {
    if (!shouldAutoOpen(readTipsPref(env), { ...flags(), started: state.started })) return;
    state.started = true;
    state.step = 1;
    sync();
  }

  function replayTour() {
    persistOn();
    state.started = true;
    state.step = 1;
    state.parked = false;
    sync();
  }

  function goNext() {
    if (state.step >= TIPS_STEPS.length) {
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
  skipBtn?.addEventListener("click", () => finish({ forceOff: true }));
  replay?.addEventListener("click", replayTour);
  window.addEventListener("resize", () => { if (state.started && !state.parked) schedulePaint(); });
  doc.addEventListener("scroll", () => { if (state.started && !state.parked) schedulePaint(); }, true);
  const dialog = doc.querySelector("#card-dialog");
  if (dialog) {
    const observer = new MutationObserver(() => sync());
    observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
  }
  const binderGrid = doc.querySelector("#binder-grid");
  if (binderGrid) {
    const observer = new MutationObserver(() => { if (state.started && state.step === 3) sync(); });
    observer.observe(binderGrid, { childList: true, subtree: true });
  }

  return {
    sync,
    maybeStart,
    replay: replayTour,
    getState() { return { ...state }; },
  };
}
