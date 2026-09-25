/**
 * Klafi SFX: pre-decoded Web Audio buffers, scheduled on the AudioContext clock.
 * Cosmetic only. Nothing here touches game state; the rip cycle is a display choice, not RNG.
 *
 * Rip sync: packrip.js dispatches `packrip:start` with the animation's t0 (performance.now()) and
 * ripAt = t0 + 1000. scheduleRip() maps ripAt onto AudioContext time and starts the clip at
 * ripAt - lead, so the tear's attack lands on the visual rip frame for every clip, with no
 * setTimeout in the audio path.
 *
 * iOS Safari: the context is only allowed to run if resume() (plus a sound start) happens inside
 * an activation-triggering event (touchend / pointerup / click / keydown; a touch pointerdown or
 * touchstart does not count), it can drop to "interrupted" after a call, lock or app switch, and
 * the ring/silent switch mutes Web Audio. That last one is intended: unlock() sets
 * navigator.audioSession.type = "ambient" (iOS 17+), so Klafi mixes with the user's music, never
 * pauses it, and stays quiet on silent. unlock() is safe to call from every gesture.
 */

export const SFX_BASE = "/sfx/";
export const SFX_CLIPS = Object.freeze([
  "rip-pc4", "rip-pc7", "rip-pc11",
  "click",
  "reveal-quote", "reveal-party",
  "rarity-1", "rarity-2", "rarity-3", "rarity-4",
]);
/** Round-robin pack_rip cycle (not random): PC4 -> PC7 -> PC11 -> PC4 ... */
export const RIP_CYCLE = Object.freeze(["rip-pc4", "rip-pc7", "rip-pc11"]);
/**
 * Attack onset of the tear in each shipped .ogg (ms from file start), measured offline with
 * detectTransientLead() on the ffmpeg-decoded file. Used until the browser's own decode is
 * analysed (which also absorbs any codec priming, e.g. AAC in .m4a).
 */
export const RIP_LEAD_MS = Object.freeze({ "rip-pc4": 44, "rip-pc7": 62, "rip-pc11": 244 });
/** Extra lead so the crack lands this many ms before the visual rip. 0 = exactly on the beat. */
export const RIP_PREROLL_MS = 0;
const RIP_STALE_S = 0.1;
export const RIP_INDEX_KEY = "klafi:sfx-rip-index";
export const SOUND_PREF_KEY = "klafi:sound";
export const RARITY_CLIPS = Object.freeze({
  common: "rarity-1",
  uncommon: "rarity-2",
  rare: "rarity-3",
  holo: "rarity-4",
});

/** Advance the persisted rip cycle by one open and return the clip to play. */
export function nextRipClip(storage = globalThis.localStorage) {
  let index = 0;
  try {
    const stored = Number.parseInt(storage?.getItem(RIP_INDEX_KEY) ?? "0", 10);
    if (Number.isFinite(stored) && stored >= 0) index = stored % RIP_CYCLE.length;
  } catch {
    /* storage blocked: fall back to the start of the cycle */
  }
  try {
    storage?.setItem(RIP_INDEX_KEY, String((index + 1) % RIP_CYCLE.length));
  } catch {
    /* ignore */
  }
  return { clip: RIP_CYCLE[index], index };
}

export function readSoundOn(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(SOUND_PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeSoundOn(on, storage = globalThis.localStorage) {
  try {
    storage?.setItem(SOUND_PREF_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

/**
 * Attack onset (ms) of the first event that reaches within `peakDb` of the loudest moment:
 * find the first 4 ms RMS window at peak+peakDb, then walk back along that rising edge until
 * the level falls under peak+peakDb-riseDb. Pure; works on AudioBuffer channel data.
 */
export function detectTransientLead(samples, sampleRate, { windowMs = 4, hopMs = 1, peakDb = -12, riseDb = 15 } = {}) {
  const win = Math.max(1, Math.round((windowMs / 1000) * sampleRate));
  const hop = Math.max(1, Math.round((hopMs / 1000) * sampleRate));
  const count = Math.floor((samples.length - win) / hop) + 1;
  if (count < 1) return 0;
  const squares = new Float64Array(samples.length + 1);
  for (let i = 0; i < samples.length; i += 1) squares[i + 1] = squares[i] + samples[i] * samples[i];
  const env = new Float64Array(count);
  let peak = 0;
  for (let i = 0; i < count; i += 1) {
    const start = i * hop;
    env[i] = Math.sqrt((squares[start + win] - squares[start]) / win);
    if (env[i] > peak) peak = env[i];
  }
  if (!peak) return 0;
  const cross = peak * 10 ** (peakDb / 20);
  const floor = peak * 10 ** ((peakDb - riseDb) / 20);
  let i = env.findIndex((value) => value >= cross);
  if (i < 0) return 0;
  while (i > 0 && env[i - 1] >= floor) i -= 1;
  return Math.round(((i * hop) / sampleRate) * 1000 * 10) / 10;
}

/** Convert a performance.now() time to AudioContext time using an output timestamp pair. */
export function perfToAudioTime(perfMs, stamp) {
  return stamp.contextTime + (perfMs - stamp.performanceTime) / 1000;
}

/** When to call source.start() so the attack at `leadMs` lands at `ripAtAudio` (seconds). */
export function ripStartTime(ripAtAudio, leadMs, prerollMs = RIP_PREROLL_MS) {
  return ripAtAudio - (leadMs + prerollMs) / 1000;
}

/**
 * Rarity tier 1-4 for the reveal sound, from the pulled instance. Every pull path the walkout
 * plays (idle, level, quiz, Studio debug) stamps finish Common / Uncommon / Rare / Holo, and a
 * numbered copy is always tier 4. Anything unrecognised plays tier 1.
 */
export function sfxRarityKey(instance = {}, card = {}) {
  if (Number(instance?.numberedIndex) > 0) return "holo";
  const finish = String(instance?.finish ?? card?.rarity ?? "").toLowerCase();
  if (finish.includes("holo") || finish.includes("numbered") || finish.includes("ממוספר") || finish.includes("הולו")) return "holo";
  if (finish.includes("uncommon") || finish.includes("לא נפוץ")) return "uncommon";
  if (finish.includes("rare") || finish.includes("נדיר")) return "rare";
  return "common";
}

/** Reveal sound for a walkout stage; the final stage uses the rarity tier (see sfxRarityKey). */
export function revealClipForStage(stage, rarityKey) {
  if (stage === "quote") return "reveal-quote";
  if (stage === "party") return "reveal-party";
  if (stage === "portrait") return RARITY_CLIPS[rarityKey] ?? null;
  return null;
}

/** Apple WebKit (Safari, every iOS browser): canPlayType can say "maybe" for Ogg while
 * decodeAudioData still rejects it, so AAC goes first there. */
export function isAppleWebKit(nav = globalThis.navigator) {
  const ua = String(nav?.userAgent ?? "");
  if (!/AppleWebKit/.test(ua) || /Chrome|Chromium|Android/.test(ua)) return false;
  return /iPhone|iPad|iPod|Macintosh/.test(ua) || String(nav?.vendor ?? "").startsWith("Apple");
}

/** Extensions to try, best first. Every clip ships as both; decode failure falls through. */
export function audioExtensions({ nav = globalThis.navigator, AudioImpl = globalThis.Audio } = {}) {
  let ogg = false;
  try {
    const probe = typeof AudioImpl === "function" ? new AudioImpl() : null;
    ogg = Boolean(probe?.canPlayType?.('audio/ogg; codecs="vorbis"'));
  } catch {
    /* ignore */
  }
  if (isAppleWebKit(nav)) return ["m4a", "ogg"];
  return ogg ? ["ogg", "m4a"] : ["m4a", "ogg"];
}

/** iOS 17+: "ambient" = mix with other audio (never pause the user's music), obey the silent switch. */
export function setAudioSessionType(type, nav = globalThis.navigator) {
  try {
    if (nav?.audioSession && nav.audioSession.type !== type) nav.audioSession.type = type;
  } catch {
    /* unsupported */
  }
}

export function createSfx({
  storage = globalThis.localStorage,
  AudioContextImpl = globalThis.AudioContext || globalThis.webkitAudioContext,
  OfflineContextImpl = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext,
} = {}) {
  let ctx = null;
  let master = null;
  let soundOn = readSoundOn(storage);
  const raw = new Map();
  const buffers = new Map();
  const leads = new Map();
  const reveals = new Set();
  let exts = null;
  let prefetching = null;
  let decoding = null;

  /** Fetch and decode the kit (safe before any gesture). */
  function preload() {
    prefetch();
    return decodeAll();
  }

  function prefetch() {
    if (prefetching || typeof fetch !== "function") return prefetching;
    exts = exts || audioExtensions();
    prefetching = Promise.all(SFX_CLIPS.map((name) => fetchClip(name, exts[0])
      .then((data) => { if (data) raw.set(name, data); })));
    return prefetching;
  }

  function fetchClip(name, extension) {
    return fetch(`${SFX_BASE}${name}.${extension}`)
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .catch(() => null);
  }

  function decodeWith(target, data) {
    return new Promise((resolve, reject) => {
      const pending = target.decodeAudioData(data.slice(0), resolve, reject);
      pending?.catch?.(reject);
    });
  }

  // Decode ahead of the first gesture with an OfflineAudioContext (no autoplay warning, no
  // running context needed); AudioBuffers are not tied to the context that decoded them.
  let decoder = null;
  function getDecoder() {
    if (ctx) return ctx;
    if (!decoder && OfflineContextImpl) {
      try {
        decoder = new OfflineContextImpl(1, 1, 48000);
      } catch {
        decoder = null;
      }
    }
    return decoder;
  }

  function decodeAll() {
    if (decoding) return decoding;
    const target = getDecoder();
    if (!target) return null;
    decoding = (prefetch() || Promise.resolve()).then(() => Promise.all(SFX_CLIPS.map(async (name) => {
      if (buffers.has(name)) return;
      // Preferred format first (already prefetched), then the other one if this engine can't
      // decode it (e.g. Ogg on iOS Safari).
      for (const [i, extension] of (exts || audioExtensions()).entries()) {
        const data = i === 0 ? raw.get(name) : await fetchClip(name, extension);
        if (!data) continue;
        try {
          const buffer = await decodeWith(target, data);
          buffers.set(name, buffer);
          if (RIP_CYCLE.includes(name)) {
            const measured = detectTransientLead(buffer.getChannelData(0), buffer.sampleRate);
            leads.set(name, measured > 0 ? measured : RIP_LEAD_MS[name]);
          }
          return;
        } catch {
          /* undecodable in this format: try the next one */
        }
      }
    })));
    return decoding;
  }

  /**
   * Call from every user gesture (pack tap, touchend/click anywhere) so iOS lets the context run.
   * Cheap no-op once running. Resumes "suspended" and iOS "interrupted" alike, and starts a
   * one-sample silent buffer inside the gesture, which older iOS needs before the context plays.
   * Muted: does nothing (no context is created).
   */
  function unlock() {
    if (!AudioContextImpl || !soundOn) return false;
    if (ctx && ctx.state === "running") return true;
    setAudioSessionType("ambient");
    if (!ctx) {
      try {
        ctx = new AudioContextImpl({ latencyHint: "interactive" });
      } catch {
        try {
          ctx = new AudioContextImpl();
        } catch {
          return false;
        }
      }
      master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);
    }
    try {
      const primer = ctx.createBufferSource();
      primer.buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
      primer.connect(ctx.destination);
      primer.start(0);
    } catch {
      /* ignore */
    }
    if (ctx.state !== "running") ctx.resume?.()?.catch?.(() => {});
    decodeAll();
    return ctx.state === "running";
  }

  function outputStamp() {
    const stamp = ctx.getOutputTimestamp?.();
    if (stamp && stamp.performanceTime > 0 && stamp.contextTime > 0) return stamp;
    // Fallback: currentTime is "now" at the graph; the ear hears it after the output latency.
    const latency = ctx.outputLatency || ctx.baseLatency || 0;
    return { contextTime: ctx.currentTime - latency, performanceTime: performance.now() };
  }

  function startClip(name, when, { reveal = false, offset = 0 } = {}) {
    const buffer = buffers.get(name);
    if (!ctx || !buffer || !soundOn) return null;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    source.connect(gain).connect(master);
    const at = Math.max(ctx.currentTime, when);
    source.start(at, offset);
    const entry = { source, gain, name, at };
    if (reveal) {
      reveals.add(entry);
      source.onended = () => reveals.delete(entry);
    }
    return entry;
  }

  /**
   * Schedule the next rip clip so its attack lands at ripAtPerf (a performance.now() time).
   * Advances the round-robin once per call (one call per pack open).
   */
  function scheduleRip(ripAtPerf) {
    const { clip } = nextRipClip(storage);
    if (!soundOn || !ctx) return { clip, scheduled: false };
    const go = () => {
      if (!buffers.has(clip)) return { clip, scheduled: false };
      const leadMs = leads.get(clip) ?? RIP_LEAD_MS[clip];
      const ripAtAudio = perfToAudioTime(ripAtPerf, outputStamp());
      const when = ripStartTime(ripAtAudio, leadMs);
      const now = ctx.currentTime;
      if (when < now) {
        // Start point already passed (reduced motion: ripAt is "now"; or a late decode): skip into
        // the clip so the attack plays at once; drop it if the attack is more than 100 ms stale.
        const offset = now - when;
        if (offset > (leadMs + RIP_PREROLL_MS) / 1000 + RIP_STALE_S) return { clip, scheduled: false, stale: true };
        startClip(clip, now, { offset: Math.min(offset, (leadMs + RIP_PREROLL_MS) / 1000) });
        return { clip, scheduled: true, when: now, offset, leadMs };
      }
      startClip(clip, when);
      return { clip, scheduled: true, when, leadMs };
    };
    if (buffers.has(clip)) return go();
    (decodeAll() || Promise.resolve()).then(go);
    return { clip, scheduled: "pending" };
  }

  function play(name, { reveal = false } = {}) {
    if (!soundOn || !ctx) return null;
    return startClip(name, ctx.currentTime, { reveal });
  }

  /** Fade out and stop reveal/rarity sounds still ringing (e.g. the rarity-4 fanfare). */
  function stopReveals(fadeMs = 120) {
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const entry of reveals) {
      try {
        entry.gain.gain.cancelScheduledValues(now);
        entry.gain.gain.setValueAtTime(entry.gain.gain.value, now);
        entry.gain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
        entry.source.stop(now + fadeMs / 1000 + 0.01);
      } catch {
        /* already stopped */
      }
    }
    reveals.clear();
  }

  function setSoundOn(on) {
    soundOn = Boolean(on);
    writeSoundOn(soundOn, storage);
    if (!soundOn) {
      stopReveals(60);
      // Idle the audio hardware while muted; unlock() resumes on the unmute tap.
      try {
        ctx?.suspend?.()?.catch?.(() => {});
      } catch {
        /* ignore */
      }
    }
  }

  return {
    prefetch,
    preload,
    unlock,
    scheduleRip,
    play,
    stopReveals,
    setSoundOn,
    get soundOn() { return soundOn; },
    get state() { return ctx?.state ?? "none"; },
  };
}
