/**
 * Pack-rip VFX: sealed pack -> shake/squash -> strip torn off and thrown -> glow from the opening.
 * Display only. The server has already granted the pull; nothing here decides what is inside.
 *
 * The sequence is a pure function of time (renderPackRipFrame), so seek() is deterministic.
 * Events on the stage element (#rip-stage):
 *   packrip:start once per play when the clock starts: detail { t0, ripAt } in performance.now() ms
 *   packrip:rip   once per play at PACKRIP_TIMELINE.RIP  (1000 ms)
 *   packrip:done  once per play at PACKRIP_TIMELINE.END  (2600 ms), or promptly under reduced motion
 * Layer geometry is in the site pack's pixel space (769 x 1390), tear line at y = 196.
 */

export const PACKRIP_TIMELINE = Object.freeze({
  ANTIC: 420,
  RIP: 1000,
  THROW: 560,
  GLOW_IN: 1150,
  GLOW_DUR: 1000,
  END: 2600,
});

export const PACKRIP_PARAMS = Object.freeze({
  throwUp: 520,
  throwRight: 300,
  throwRot: 28,
  throwScale: 0.78,
  squashY: 0.955,
  squashX: 1.025,
  sparkCount: 38,
  rayTurnDegPerSec: 3.2,
});

export const PACKRIP_ASSETS = Object.freeze({
  body: "/packrip/body.webp",
  strip: "/packrip/strip.webp",
  stripClosed: "/packrip/strip-closed.webp",
  closed: "/packrip/pack-closed.webp",
});

const T = PACKRIP_TIMELINE;
const P = PACKRIP_PARAMS;
const SITE_W = 769;
const TEAR_Y = 196;
const DECODE_WAIT_MS = 1200;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const seg = (t, start, duration) => clamp01((t - start) / duration);
const lerp = (a, b, p) => a + (b - a) * p;
const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function packRipMarkup({ label = "חבילת קְלָפִי סגורה" } = {}) {
  return `
    <div class="pr-stage" data-stage="site">
      <div class="pr-pack" role="img" aria-label="${label}">
        <div class="pr-shade" aria-hidden="true"></div>
        <div class="pr-rays" aria-hidden="true">
          <div class="pr-rays-inner pr-rays-a"></div>
          <div class="pr-rays-inner pr-rays-b"></div>
        </div>
        <div class="pr-halo" aria-hidden="true"></div>
        <div class="pr-beam" aria-hidden="true"></div>
        <img class="pr-body" src="${PACKRIP_ASSETS.body}" alt="" draggable="false" decoding="async" />
        <img class="pr-strip-closed" src="${PACKRIP_ASSETS.stripClosed}" alt="" draggable="false" decoding="async" />
        <div class="pr-rim" aria-hidden="true"></div>
        <div class="pr-bloom" aria-hidden="true"></div>
        <img class="pr-strip" src="${PACKRIP_ASSETS.strip}" alt="" draggable="false" decoding="async" />
      </div>
      <canvas class="pr-sparks" aria-hidden="true"></canvas>
    </div>`;
}

/** Pack wrapper transform inputs at time t (site px / deg / scale). Pure. */
export function packPose(t) {
  const bob = t < T.ANTIC ? Math.sin(t / 260) * 1.5 : 0;
  const a = seg(t, T.ANTIC, T.RIP - T.ANTIC);
  const shakeAmp = t < T.RIP && t >= T.ANTIC ? lerp(0.6, 2.2, a) : 0;
  const shake = Math.sin((t - T.ANTIC) / 22) * shakeAmp;
  const recoilP = seg(t, T.RIP, 420);
  const recoil = t >= T.RIP ? Math.sin(recoilP * Math.PI * 2.5) * (1 - recoilP) * 9 : 0;
  const squash = easeInOut(seg(t, T.ANTIC + 150, T.RIP - T.ANTIC - 150));
  const release = seg(t, T.RIP, 360);
  const spring = t >= T.RIP ? (1 - release) * Math.cos(release * Math.PI * 2.2) : squash;
  return {
    x: shake * 0.8,
    y: bob + recoil,
    rotate: shake * 0.55,
    scaleX: 1 + (P.squashX - 1) * spring,
    scaleY: 1 - (1 - P.squashY) * spring,
    recoil,
  };
}

/** Torn strip pose at time t, or null when hidden. One continuous throw, no hold. Pure. */
export function stripPose(t, pose = packPose(t)) {
  const p = seg(t, T.RIP, T.THROW);
  if (t < T.RIP || p >= 1) return null;
  const q = 1.6 * p - 0.6 * p * p;
  // Cancel the pack's recoil and squash-release so the strip path stays monotonic.
  const comp = -pose.recoil - ((pose.scaleY - 1) * (109 - 1279)) / pose.scaleY;
  const fade = clamp01((p - 0.3) / 0.7);
  return {
    x: P.throwRight * Math.pow(p, 1.35),
    y: -P.throwUp * q + comp,
    rotate: -2 + P.throwRot * q,
    scale: 1 - (1 - P.throwScale) * p,
    opacity: 1 - fade * fade * (3 - 2 * fade),
  };
}

/** Glow layer levels at time t. Pure. */
export function glowLevels(t) {
  const flash = t >= T.RIP ? Math.exp(-((t - T.RIP) / 150)) * seg(t, T.RIP, 30) : 0;
  const swell = easeOutCubic(seg(t, T.GLOW_IN, T.GLOW_DUR));
  const breathe = 1 + Math.sin(t / 640) * 0.035 * swell;
  const rays = easeInOut(seg(t, T.GLOW_IN + 100, 1200));
  return { flash, swell, breathe, rays };
}

function prefersReducedMotion() {
  return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

/**
 * Bind a player to markup already rendered by packRipMarkup() inside `host`.
 * Returns { seek, play, stop, destroy }. play() resolves true at packrip:done.
 * Only one player is live at a time; mounting a new one destroys the previous one.
 */
let livePlayer = null;

export function mountPackRip(host) {
  livePlayer?.destroy();
  const stageEl = host?.querySelector(".pr-stage");
  const pack = stageEl?.querySelector(".pr-pack");
  const canvas = stageEl?.querySelector(".pr-sparks");
  if (!stageEl || !pack || !canvas) return null;
  const el = {
    stripClosed: pack.querySelector(".pr-strip-closed"),
    strip: pack.querySelector(".pr-strip"),
    rays: pack.querySelector(".pr-rays"),
    raysA: pack.querySelector(".pr-rays-a"),
    raysB: pack.querySelector(".pr-rays-b"),
    halo: pack.querySelector(".pr-halo"),
    shade: pack.querySelector(".pr-shade"),
    rim: pack.querySelector(".pr-rim"),
    beam: pack.querySelector(".pr-beam"),
    bloom: pack.querySelector(".pr-bloom"),
  };
  const ctx = canvas.getContext("2d");
  const dark = () => stageEl.dataset.stage === "dark";
  let unit = 0;
  let packBox = null;
  let raf = 0;
  let doneTimer = 0;
  let destroyed = false;
  let lastT = 0;
  let run = null;
  let playId = 0;

  function measure() {
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(stageEl.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(stageEl.clientHeight * dpr));
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Layout box relative to the stage, ignoring the per-frame transform.
    packBox = { left: pack.offsetLeft, top: pack.offsetTop, width: pack.offsetWidth };
    unit = packBox.width / SITE_W;
  }

  const resizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver(() => {
      if (destroyed) return;
      measure();
      render(lastT);
    })
    : null;
  resizeObserver?.observe(stageEl);

  function render(t) {
    lastT = t;
    if (!unit) measure();
    const u = unit;
    const pose = packPose(t);
    pack.style.transform = `translate3d(${(pose.x * u).toFixed(2)}px, ${(pose.y * u).toFixed(2)}px, 0) rotate(${pose.rotate.toFixed(3)}deg) scale(${pose.scaleX.toFixed(4)}, ${pose.scaleY.toFixed(4)})`;
    el.stripClosed.style.opacity = t < T.RIP ? "1" : "0";

    const strip = stripPose(t, pose);
    if (!strip) {
      el.strip.style.opacity = "0";
    } else {
      el.strip.style.opacity = strip.opacity.toFixed(3);
      el.strip.style.transform = `translate(${(strip.x * u).toFixed(2)}px, ${(strip.y * u).toFixed(2)}px) rotate(${strip.rotate.toFixed(3)}deg) scale(${strip.scale.toFixed(4)})`;
    }

    const { flash, swell, breathe, rays } = glowLevels(t);
    el.halo.style.opacity = Math.min(1, swell * 0.95 + flash * 0.6).toFixed(3);
    el.halo.style.transform = `scale(${((0.3 + 0.7 * swell) * breathe).toFixed(4)})`;
    el.beam.style.opacity = (swell * 0.75).toFixed(3);
    el.beam.style.transform = `scaleY(${(0.2 + 0.8 * swell).toFixed(4)}) scaleX(${breathe.toFixed(4)})`;
    el.bloom.style.opacity = Math.min(1, flash + swell * 0.85).toFixed(3);
    el.bloom.style.transform = `scale(${(lerp(0.45, 1, Math.max(swell, flash * 0.7)) * breathe).toFixed(4)}, ${lerp(0.6, 1, swell).toFixed(4)})`;
    el.rays.style.opacity = (rays * (dark() ? 0.9 : 1)).toFixed(3);
    el.rays.style.transform = `scale(${lerp(0.55, 1, easeOutCubic(rays)).toFixed(4)})`;
    el.shade.style.opacity = (swell * breathe).toFixed(3);
    el.rim.style.opacity = Math.min(1, swell * 0.9 + flash * 0.3).toFixed(3);
    const turn = (t / 1000) * P.rayTurnDegPerSec;
    el.raysA.style.transform = `rotate(${turn.toFixed(3)}deg)`;
    el.raysB.style.transform = `rotate(${(-turn * 1.6).toFixed(3)}deg)`;
    drawSparks(t, swell, pose);
  }

  function drawSparks(t, swell, pose) {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (t < T.RIP + 120 || !packBox) return;
    const u = unit;
    const ox = packBox.left + packBox.width / 2 + pose.x * u;
    const oy = packBox.top + TEAR_Y * u + pose.y * u;
    const additive = dark();
    ctx.save();
    ctx.globalCompositeOperation = additive ? "lighter" : "source-over";
    for (let i = 0; i < P.sparkCount; i += 1) {
      const period = 1500 + hash(i) * 1300;
      const start = T.RIP + 120 + hash(i + 50) * 700;
      if (t < start) continue;
      const k = Math.floor((t - start) / period);
      const age = ((t - start) % period) / 1000;
      const life = period / 1000;
      const r = (n) => hash(i * 17.3 + k * 91.7 + n);
      const x0 = (r(1) - 0.5) * 520;
      const vx = (r(2) - 0.5) * 110 + x0 * 0.35;
      const vy = -(150 + r(3) * 240);
      const x = x0 + vx * age + Math.sin(age * 4 + r(4) * 6) * 10;
      const y = -6 + vy * age + 45 * age * age;
      const fade = Math.sin(Math.PI * Math.min(1, age / life)) * (0.55 + 0.45 * Math.sin(age * 18 + r(5) * 9) ** 2);
      const alpha = fade * Math.min(1, swell * 1.4 + (k > 0 ? 1 : 0));
      if (alpha <= 0.01) continue;
      const size = (1.2 + r(6) * 2.4) * u * (additive ? 1.7 : 2.4);
      const sx = ox + x * u;
      const sy = oy + y * u;
      if (additive) {
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 2.6);
        g.addColorStop(0, `rgba(255,252,235,${alpha})`);
        g.addColorStop(0.18, `rgba(255,236,170,${alpha})`);
        g.addColorStop(0.4, `rgba(255,196,80,${alpha * 0.45})`);
        g.addColorStop(1, "rgba(255,150,30,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(sx, sy, size * 2.6, 0, Math.PI * 2); ctx.fill();
      } else {
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 2.4);
        g.addColorStop(0, `rgba(250,200,80,${alpha * 0.55})`);
        g.addColorStop(1, "rgba(230,150,40,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(sx, sy, size * 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(sx, sy, size * 0.62, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,226,120,${alpha})`; ctx.fill();
        ctx.lineWidth = Math.max(0.6, size * 0.16);
        ctx.strokeStyle = `rgba(150,86,16,${alpha * 0.75})`; ctx.stroke();
        ctx.beginPath(); ctx.arc(sx - size * 0.15, sy - size * 0.15, size * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,252,236,${alpha})`; ctx.fill();
      }
    }
    ctx.restore();
  }

  function emit(type, detail) {
    host.dispatchEvent(new CustomEvent(`packrip:${type}`, { bubbles: true, detail }));
  }

  function stop() {
    playId += 1;
    cancelAnimationFrame(raf);
    raf = 0;
    clearTimeout(doneTimer);
    doneTimer = 0;
  }

  function settle(completed) {
    const current = run;
    run = null;
    current?.resolve(completed);
  }

  function seek(ms) {
    stop();
    settle(false);
    render(Number(ms) || 0);
  }

  // null = every layer is loaded and was already decoded by the prefetch, so start this frame.
  function imagesReady() {
    const images = [...pack.querySelectorAll("img")];
    if (packRipAssetsDecoded() && images.every((img) => img.complete && img.naturalWidth > 0)) return null;
    const decodes = images.map((img) => (img.decode ? img.decode().catch(() => {}) : null));
    return Promise.race([
      Promise.all(decodes),
      new Promise((resolve) => setTimeout(resolve, DECODE_WAIT_MS)),
    ]);
  }

  /** Resolves true at packrip:done, false if the play was cut short (seek/destroy). */
  function play({ reducedMotion = prefersReducedMotion() } = {}) {
    if (destroyed) return Promise.resolve(false);
    if (run) return run.promise; // re-entry: keep the play already running
    stop();
    const id = playId;
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    run = { promise, resolve };
    if (reducedMotion) {
      render(T.END + 400);
      const now = performance.now();
      emit("start", { t0: now, ripAt: now, reduced: true });
      doneTimer = setTimeout(() => {
        if (destroyed || id !== playId) return;
        emit("done", { t: T.END, reduced: true });
        settle(true);
      }, 0);
      return promise;
    }
    const begin = () => {
      if (destroyed || id !== playId) return;
      measure();
      let ripFired = false;
      let doneFired = false;
      const t0 = performance.now();
      // Clock anchor for anything that must land on a beat (audio is scheduled from ripAt).
      emit("start", { t0, ripAt: t0 + T.RIP, reduced: false });
      const frame = (now) => {
        if (destroyed || id !== playId) return;
        if (!pack.isConnected) {
          destroy();
          return;
        }
        const t = now - t0;
        if (!ripFired && t >= T.RIP) {
          ripFired = true;
          emit("rip", { t: T.RIP, t0 });
        }
        render(t);
        if (!doneFired && t >= T.END) {
          doneFired = true;
          emit("done", { t: T.END, t0 });
          settle(true);
        }
        // Past END the glow keeps breathing until the host replaces the markup.
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };
    const ready = imagesReady();
    if (ready) ready.then(begin);
    else begin();
    return promise;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stop();
    resizeObserver?.disconnect();
    settle(false);
    if (livePlayer === player) livePlayer = null;
  }

  const player = { seek, play, stop, destroy, stage: host };
  livePlayer = player;
  return player;
}

export function destroyPackRip() {
  livePlayer?.destroy();
}

const prefetched = [];
let prefetch = null;
let decodedAll = false;

/** True once every rip layer has been fetched and decoded by preloadPackRipAssets(). */
export function packRipAssetsDecoded() {
  return decodedAll;
}

/**
 * Fetch and decode every rip layer (new Image + img.decode()) so the first tap starts the rip at
 * once instead of waiting on decode. Idempotent; the Image objects are kept so the decoded
 * bitmaps stay warm. Resolves when all layers are decoded (failures are ignored).
 */
export function preloadPackRipAssets() {
  if (prefetch) return prefetch;
  if (typeof Image !== "function") return Promise.resolve(false);
  prefetch = Promise.all(Object.values(PACKRIP_ASSETS).map((src) => {
    const image = new Image();
    image.decoding = "async";
    image.src = src;
    prefetched.push(image);
    return image.decode ? image.decode().then(() => true, () => false) : Promise.resolve(false);
  })).then((results) => {
    decodedAll = results.every(Boolean);
    return decodedAll;
  });
  return prefetch;
}

/** Prefetch on the first idle moment after the app shell loads (falls back to a short timeout). */
export function schedulePackRipPrefetch({ timeout = 1500 } = {}) {
  const run = () => { preloadPackRipAssets(); };
  if (typeof globalThis.requestIdleCallback === "function") globalThis.requestIdleCallback(run, { timeout });
  else setTimeout(run, 200);
}
