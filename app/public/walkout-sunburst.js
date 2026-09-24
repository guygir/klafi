/**
 * Pack-pull walkout sunburst — rays behind the revealed card.
 * Default is V1 hard comic pop. Soft V2 is opt-in via ?sunburst=v2.
 * Force density for QA with ?rarity=common|uncommon|rare|holo (rays only).
 */

export const SUNBURST_GOLD = "#b38d3f";
export const SUNBURST_VERSIONS = ["v1", "v2", "off"];
export const SUNBURST_IMAGE_STAGES = new Set(["portrait", "identity"]);
export const SUNBURST_RARITY = {
  common: { rayPairs: 4, opacity: 0.26, durationSec: 36, rayFrac: 0.28 },
  uncommon: { rayPairs: 9, opacity: 0.44, durationSec: 20, rayFrac: 0.36 },
  rare: { rayPairs: 16, opacity: 0.60, durationSec: 11, rayFrac: 0.44 },
  holo: { rayPairs: 24, opacity: 0.76, durationSec: 6.5, rayFrac: 0.52 },
};

const GOLD_RARITIES = new Set(["holo", "numbered"]);
const RAY_FRAC_FALLBACK = 0.44;
const RAY_CORE_V2 = 0.34;
const RAY_RAMP_V2 = 0.12;
const DEFAULT_PIP = "#c43b3b";

const state = {
  phase: "idle",
  lastPopKey: "",
  exitTimer: 0,
  resizeWired: false,
  resizeObserver: null,
};

export function readSunburstVersion(search = globalThis.location?.search || "") {
  try {
    const value = new URLSearchParams(search).get("sunburst")?.trim().toLowerCase();
    if (SUNBURST_VERSIONS.includes(value)) return value;
  } catch {
    /* ignore */
  }
  return "v1";
}

export function normalizeSunburstRarity(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (!key) return null;
  if (key === "numbered" || key === "number" || key === "ממוספר" || key === "הולו") return "holo";
  if (Object.hasOwn(SUNBURST_RARITY, key)) return key;
  return null;
}

export function readSunburstRarityOverride(search = globalThis.location?.search || "") {
  try {
    return normalizeSunburstRarity(new URLSearchParams(search).get("rarity"));
  } catch {
    return null;
  }
}

export function resolveSunburstRarity(instance = {}, card = {}, search = globalThis.location?.search || "") {
  const override = readSunburstRarityOverride(search);
  if (override) return override;
  if (Number(instance.numberedIndex) > 0) return "holo";
  const finish = String(instance.finish ?? card.rarity ?? "").toLowerCase();
  if (finish.includes("numbered") || finish.includes("ממוספר") || finish.includes("holo") || finish.includes("הולו")) {
    return "holo";
  }
  if (
    finish.includes("promo")
    || finish.includes("promotion")
    || finish.includes("legendary")
    || finish.includes("event")
    || finish.includes("קידום")
  ) {
    return null;
  }
  if (finish.includes("rare") || finish.includes("נדיר")) return "rare";
  if (finish.includes("uncommon") || finish.includes("לא נפוץ")) return "uncommon";
  return "common";
}

export function sunburstRayColor(pip, rarityKey) {
  if (GOLD_RARITIES.has(rarityKey)) return SUNBURST_GOLD;
  return pip || DEFAULT_PIP;
}

function deg(value) {
  return Number.parseFloat(Number(value).toFixed(3));
}

export function buildSunburstGradient(pip, { rayPairs, rayFrac, soft = false } = {}) {
  const pairs = Math.max(1, Number(rayPairs) || 1);
  const pairDeg = deg(360 / pairs);
  const light = `color-mix(in srgb, ${pip} 78%, #f4efe4)`;
  if (soft) {
    const coreFrac = Math.min(0.55, (rayFrac ?? RAY_CORE_V2) * 0.85);
    const coreEnd = deg(pairDeg * coreFrac);
    const rampEnd = deg(pairDeg * Math.min(0.72, coreFrac + RAY_RAMP_V2));
    return `repeating-conic-gradient(from 0deg, ${light} 0deg ${coreEnd}deg, transparent ${rampEnd}deg ${pairDeg}deg)`;
  }
  const frac = rayFrac ?? RAY_FRAC_FALLBACK;
  const rayDeg = deg(pairDeg * Math.min(0.72, Math.max(0.12, frac)));
  return `repeating-conic-gradient(from 0deg, ${light} 0deg ${rayDeg}deg, transparent ${rayDeg}deg ${pairDeg}deg)`;
}

export function alignSunburstToCard(wrap, cardEl) {
  if (!wrap || !cardEl) return false;
  if (wrap.isConnected === false || cardEl.isConnected === false) return false;
  const wrapRect = wrap.getBoundingClientRect();
  const cardRect = cardEl.getBoundingClientRect();
  if (wrapRect.width < 1 || wrapRect.height < 1 || cardRect.width < 1) return false;
  const cx = cardRect.left + cardRect.width / 2 - wrapRect.left;
  const cy = cardRect.top + cardRect.height / 2 - wrapRect.top;
  wrap.style.setProperty("--sunburst-cx", `${cx}px`);
  wrap.style.setProperty("--sunburst-cy", `${cy}px`);
  wrap.style.setProperty("--sunburst-ox", `${(cx / wrapRect.width) * 100}%`);
  wrap.style.setProperty("--sunburst-oy", `${(cy / wrapRect.height) * 100}%`);
  return true;
}

function prefersReducedMotion() {
  return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

function applyVersionAttr(version) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.walkoutSunburst = version;
}

function pipFromWalkout(walkout, fallback) {
  if (!walkout || typeof getComputedStyle !== "function") return fallback || DEFAULT_PIP;
  const raw = getComputedStyle(walkout).getPropertyValue("--walkout-pip").trim();
  if (raw) return raw;
  const card = walkout.querySelector?.(".kalpi-card");
  const pip = card ? getComputedStyle(card).getPropertyValue("--pip").trim() : "";
  return pip || fallback || DEFAULT_PIP;
}

function ensureOverlay(walkout) {
  let wrap = walkout.querySelector(":scope > .walkout-sunburst");
  if (wrap) return wrap;
  wrap = document.createElement("div");
  wrap.className = "walkout-sunburst";
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = '<div class="walkout-sunburst-rays"></div>';
  walkout.insertBefore(wrap, walkout.firstChild);
  return wrap;
}

function applyParams(wrap, walkout, cardEl, rarityKey, pipHint) {
  const rays = wrap.querySelector(".walkout-sunburst-rays");
  if (!rays) return;
  const rarity = SUNBURST_RARITY[rarityKey];
  if (!rarity) return;
  const version = readSunburstVersion();
  const pip = sunburstRayColor(pipFromWalkout(walkout, pipHint), rarityKey);
  wrap.style.setProperty("--ray-opacity", String(rarity.opacity));
  wrap.style.setProperty("--sunburst-pip", pip);
  wrap.style.setProperty("--ray-frac", String(rarity.rayFrac));
  rays.style.setProperty("--sunburst-pip", pip);
  rays.style.setProperty("--ray-pairs", String(rarity.rayPairs));
  rays.style.setProperty("--spin-duration", `${rarity.durationSec}s`);
  rays.style.background = buildSunburstGradient(pip, {
    rayPairs: rarity.rayPairs,
    rayFrac: rarity.rayFrac,
    soft: version === "v2",
  });
  wrap.dataset.rarity = rarityKey;
  alignSunburstToCard(wrap, cardEl);
}

function clearMotion(wrap) {
  wrap.classList.remove("is-popping", "is-visible", "is-exiting");
  wrap.querySelector(".walkout-sunburst-rays")?.classList.remove("is-spinning");
}

function settleVisible(wrap, cardEl) {
  if (!wrap.isConnected) return;
  wrap.classList.remove("is-popping");
  wrap.classList.add("is-visible");
  alignSunburstToCard(wrap, cardEl);
}

function popSunburst(wrap, walkout, cardEl, rarityKey, pipHint) {
  const version = readSunburstVersion();
  if (version === "off") return;
  clearTimeout(state.exitTimer);
  applyParams(wrap, walkout, cardEl, rarityKey, pipHint);
  clearMotion(wrap);
  void wrap.offsetWidth;
  alignSunburstToCard(wrap, cardEl);
  wrap.querySelector(".walkout-sunburst-rays")?.classList.add("is-spinning");
  state.phase = "revealed";
  if (prefersReducedMotion()) {
    settleVisible(wrap, cardEl);
    return;
  }
  wrap.classList.add("is-popping");
  requestAnimationFrame(() => {
    if (!wrap.isConnected) return;
    alignSunburstToCard(wrap, cardEl);
    requestAnimationFrame(() => alignSunburstToCard(wrap, cardEl));
  });
  const settleMs = version === "v2" ? 700 : 430;
  state.exitTimer = globalThis.setTimeout(() => settleVisible(wrap, cardEl), settleMs);
}

function cardPopKey(walkout, cardEl, stage, rarityKey) {
  const id = walkout?.closest?.("#rip-stage")?.dataset?.cardId
    || cardEl?.getAttribute?.("aria-label")
    || "";
  return `${id}|${stage}|${rarityKey || "none"}`;
}

function ripStageRoot() {
  return typeof document === "undefined" ? null : document.querySelector("#rip-stage");
}

function realignVisible() {
  const root = ripStageRoot();
  const wrap = root?.querySelector(".walkout > .walkout-sunburst");
  const cardEl = root?.querySelector(".walkout .kalpi-card");
  if (wrap && cardEl) alignSunburstToCard(wrap, cardEl);
}

function wireResize() {
  if (state.resizeWired || typeof window === "undefined") return;
  state.resizeWired = true;
  window.addEventListener("resize", realignVisible);
  const root = ripStageRoot();
  if (root && typeof ResizeObserver === "function") {
    state.resizeObserver = new ResizeObserver(realignVisible);
    state.resizeObserver.observe(root);
  }
}

export function teardownWalkoutSunburst({ immediate = true } = {}) {
  clearTimeout(state.exitTimer);
  if (typeof document !== "undefined") {
    document.querySelectorAll(".walkout-sunburst").forEach((wrap) => {
      if (immediate) {
        clearMotion(wrap);
        wrap.remove();
      } else {
        exitWalkoutSunburst({ wrap, remove: true });
      }
    });
  }
  state.phase = "idle";
  state.lastPopKey = "";
}

export function exitWalkoutSunburst({ wrap, remove = false } = {}) {
  const node = wrap || ripStageRoot()?.querySelector(".walkout > .walkout-sunburst");
  if (!node || !node.isConnected) {
    state.phase = "idle";
    state.lastPopKey = "";
    return;
  }
  if (state.phase !== "revealed" && !node.classList.contains("is-visible") && !node.classList.contains("is-popping")) {
    return;
  }
  clearTimeout(state.exitTimer);
  node.classList.remove("is-popping", "is-visible");
  void node.offsetWidth;
  node.classList.add("is-exiting");
  state.phase = "exiting";
  state.lastPopKey = "";
  const ms = readSunburstVersion() === "v2" ? 280 : 400;
  state.exitTimer = globalThis.setTimeout(() => {
    clearMotion(node);
    node.classList.remove("is-exiting");
    state.phase = "idle";
    if (remove) node.remove();
  }, prefersReducedMotion() ? 0 : ms);
}

export function syncWalkoutSunburst({
  walkout,
  cardEl,
  stage,
  rarityKey,
  pip,
} = {}) {
  const version = readSunburstVersion();
  applyVersionAttr(version);
  if (version === "off" || !walkout || !cardEl || !rarityKey) {
    if (state.phase !== "idle") teardownWalkoutSunburst({ immediate: true });
    return;
  }
  wireResize();
  const wrap = ensureOverlay(walkout);
  applyParams(wrap, walkout, cardEl, rarityKey, pip);
  cardEl.querySelector?.(".card-art")?.addEventListener("load", () => {
    alignSunburstToCard(wrap, cardEl);
  }, { once: true });

  if (SUNBURST_IMAGE_STAGES.has(stage)) {
    const key = cardPopKey(walkout, cardEl, stage, rarityKey);
    if (key !== state.lastPopKey || state.phase === "idle") {
      state.lastPopKey = key;
      popSunburst(wrap, walkout, cardEl, rarityKey, pip);
    } else {
      alignSunburstToCard(wrap, cardEl);
    }
    return;
  }

  if (state.phase === "revealed" || state.phase === "exiting") {
    clearMotion(wrap);
    state.phase = "idle";
    state.lastPopKey = "";
  }
}
