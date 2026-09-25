import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  RARITY_CLIPS,
  sfxRarityKey,
  RIP_CYCLE,
  RIP_INDEX_KEY,
  RIP_LEAD_MS,
  RIP_PREROLL_MS,
  SFX_CLIPS,
  SOUND_PREF_KEY,
  detectTransientLead,
  nextRipClip,
  perfToAudioTime,
  readSoundOn,
  revealClipForStage,
  ripStartTime,
  writeSoundOn,
  audioExtensions,
  createSfx,
  isAppleWebKit,
} from "../public/sfx.js";
import { PACKRIP_TIMELINE } from "../public/packrip.js";

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");

function memoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    data,
  };
}

test("pack rip cycles PC4, PC7, PC11 in order and wraps", () => {
  assert.deepEqual([...RIP_CYCLE], ["rip-pc4", "rip-pc7", "rip-pc11"]);
  const storage = memoryStorage();
  const clips = Array.from({ length: 7 }, () => nextRipClip(storage).clip);
  assert.deepEqual(clips, ["rip-pc4", "rip-pc7", "rip-pc11", "rip-pc4", "rip-pc7", "rip-pc11", "rip-pc4"]);
});

test("rip cycle survives a reload through localStorage", () => {
  const storage = memoryStorage();
  assert.equal(nextRipClip(storage).clip, "rip-pc4");
  assert.equal(nextRipClip(storage).clip, "rip-pc7");
  // "Reload": a fresh reader over the same persisted storage continues the cycle.
  const reloaded = memoryStorage(Object.fromEntries(storage.data));
  assert.equal(reloaded.getItem(RIP_INDEX_KEY), "2");
  assert.equal(nextRipClip(reloaded).clip, "rip-pc11");
  assert.equal(nextRipClip(reloaded).clip, "rip-pc4");
});

test("rip cycle tolerates junk or missing storage", () => {
  assert.equal(nextRipClip(memoryStorage({ [RIP_INDEX_KEY]: "banana" })).clip, "rip-pc4");
  assert.equal(nextRipClip(memoryStorage({ [RIP_INDEX_KEY]: "7" })).clip, "rip-pc7");
  assert.equal(nextRipClip(null).clip, "rip-pc4");
  const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(nextRipClip(throwing).clip, "rip-pc4");
});

test("rip audio starts at ripAt minus each file's lead", () => {
  assert.equal(RIP_PREROLL_MS, 0);
  const ripAtAudio = 12.345;
  for (const clip of RIP_CYCLE) {
    const lead = RIP_LEAD_MS[clip];
    assert.ok(lead > 0, clip);
    const start = ripStartTime(ripAtAudio, lead);
    assert.ok(Math.abs(start - (ripAtAudio - lead / 1000)) < 1e-12, clip);
    assert.ok(Math.abs(start + lead / 1000 - ripAtAudio) < 1e-12, `${clip} attack lands on ripAt`);
  }
  assert.ok(Math.abs(ripStartTime(5, 40, 20) - 4.94) < 1e-12, "preroll moves the start earlier");
});

test("animation clock maps onto AudioContext time", () => {
  const stamp = { contextTime: 3.5, performanceTime: 10_000 };
  const t0 = 10_250;
  const ripAt = t0 + PACKRIP_TIMELINE.RIP;
  assert.ok(Math.abs(perfToAudioTime(ripAt, stamp) - 4.75) < 1e-12);
  // Same animation offset gives the same audio offset for every clip.
  const a = ripStartTime(perfToAudioTime(ripAt, stamp), RIP_LEAD_MS["rip-pc4"]);
  const b = ripStartTime(perfToAudioTime(ripAt, stamp), RIP_LEAD_MS["rip-pc11"]);
  assert.ok(Math.abs((a + RIP_LEAD_MS["rip-pc4"] / 1000) - (b + RIP_LEAD_MS["rip-pc11"] / 1000)) < 1e-12);
});

test("transient detector finds the attack, not the quiet lead-in", () => {
  const sr = 48000;
  const samples = new Float32Array(sr / 2);
  let seed = 1;
  const noise = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for (let i = 0; i < samples.length; i += 1) samples[i] = noise() * 0.002; // -60 dB bed
  const burstAt = Math.round(0.12 * sr);
  for (let i = burstAt; i < burstAt + 0.1 * sr; i += 1) samples[i] = noise() * 0.8;
  const lead = detectTransientLead(samples, sr);
  assert.ok(lead >= 116 && lead <= 121, `lead ${lead}`);
  assert.equal(detectTransientLead(new Float32Array(1000), sr), 0);
});

test("reveal stages map to the locked kit", () => {
  assert.equal(revealClipForStage("quote"), "reveal-quote");
  assert.equal(revealClipForStage("party"), "reveal-party");
  assert.equal(revealClipForStage("portrait", "common"), "rarity-1");
  assert.equal(revealClipForStage("portrait", "uncommon"), "rarity-2");
  assert.equal(revealClipForStage("portrait", "rare"), "rarity-3");
  assert.equal(revealClipForStage("portrait", "holo"), "rarity-4");
  assert.equal(revealClipForStage("portrait", null), null);
  assert.equal(revealClipForStage("blank"), null);
  assert.equal(revealClipForStage("identity"), null);
  assert.deepEqual({ ...RARITY_CLIPS }, { common: "rarity-1", uncommon: "rarity-2", rare: "rarity-3", holo: "rarity-4" });
});

test("sound preference defaults on and persists", () => {
  const storage = memoryStorage();
  assert.equal(readSoundOn(storage), true);
  writeSoundOn(false, storage);
  assert.equal(storage.getItem(SOUND_PREF_KEY), "off");
  assert.equal(readSoundOn(storage), false);
  writeSoundOn(true, storage);
  assert.equal(readSoundOn(storage), true);
});

test("every clip ships as ogg + m4a and stays small", async () => {
  let total = 0;
  for (const clip of SFX_CLIPS) {
    for (const ext of ["ogg", "m4a"]) {
      const info = await stat(path.join(publicDir, "sfx", `${clip}.${ext}`));
      assert.ok(info.size > 0 && info.size < 40 * 1024, `${clip}.${ext} ${info.size}`);
      total += info.size;
    }
  }
  assert.ok(total < 300 * 1024, `sfx kit total ${total}`);
  assert.ok((await stat(path.join(publicDir, "sfx", "CREDITS.md"))).size > 0);
});

test("reveal rarity maps strictly to tiers 1-4 from the pulled finish", () => {
  assert.equal(sfxRarityKey({ finish: "Common" }), "common");
  assert.equal(sfxRarityKey({ finish: "Uncommon" }), "uncommon");
  assert.equal(sfxRarityKey({ finish: "Rare" }), "rare");
  assert.equal(sfxRarityKey({ finish: "Holo" }), "holo");
  assert.equal(sfxRarityKey({ finish: "Rare", numberedIndex: 3 }), "holo");
  assert.equal(sfxRarityKey({}, { rarity: "Uncommon" }), "uncommon");
  assert.equal(sfxRarityKey({ finish: "Something else" }), "common");
  for (const key of ["common", "uncommon", "rare", "holo"]) {
    assert.match(revealClipForStage("portrait", sfxRarityKey({ finish: key === "holo" ? "Holo" : key })), /^rarity-[1-4]$/);
  }
});

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IOS_CHROME_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";

test("Apple WebKit gets AAC first; others keep Ogg first when supported", () => {
  const oggYes = function Audio() { return { canPlayType: () => "maybe" }; };
  const oggNo = function Audio() { return { canPlayType: () => "" }; };
  assert.equal(isAppleWebKit({ userAgent: IPHONE_UA }), true);
  assert.equal(isAppleWebKit({ userAgent: IOS_CHROME_UA }), true);
  assert.equal(isAppleWebKit({ userAgent: ANDROID_UA }), false);
  assert.deepEqual(audioExtensions({ nav: { userAgent: IPHONE_UA }, AudioImpl: oggYes }), ["m4a", "ogg"]);
  assert.deepEqual(audioExtensions({ nav: { userAgent: ANDROID_UA }, AudioImpl: oggYes }), ["ogg", "m4a"]);
  assert.deepEqual(audioExtensions({ nav: { userAgent: ANDROID_UA }, AudioImpl: oggNo }), ["m4a", "ogg"]);
});

function fakeAudioContext(log) {
  return class FakeContext {
    constructor() { this.state = "suspended"; this.sampleRate = 48000; this.currentTime = 0; this.destination = {}; log.push("new"); FakeContext.last = this; }
    createGain() { return { gain: { value: 1 }, connect: (n) => n }; }
    createBuffer() { return {}; }
    createBufferSource() { return { connect: (n) => n, start: () => log.push("primer") }; }
    resume() { log.push("resume"); this.state = "running"; return Promise.resolve(); }
    suspend() { log.push("suspend"); this.state = "suspended"; return Promise.resolve(); }
  };
}

test("unlock resumes suspended and iOS 'interrupted' contexts, and is a no-op when running or muted", () => {
  const log = [];
  const Impl = fakeAudioContext(log);
  const sfx = createSfx({ storage: memoryStorage(), AudioContextImpl: Impl, OfflineContextImpl: null });
  assert.equal(sfx.unlock(), true);
  const lastContext = Impl.last;
  assert.deepEqual(log, ["new", "primer", "resume"]);
  log.length = 0;
  sfx.unlock();
  assert.deepEqual(log, [], "running: nothing to do");
  // iOS drops the context to "interrupted" after a phone call / lock / app switch.
  lastContext.state = "interrupted";
  assert.equal(sfx.unlock(), true);
  assert.deepEqual(log, ["primer", "resume"]);
  log.length = 0;
  sfx.setSoundOn(false);
  assert.deepEqual(log, ["suspend"]);
  log.length = 0;
  assert.equal(sfx.unlock(), false, "muted: stays silent");
  assert.deepEqual(log, []);
  sfx.setSoundOn(true);
  assert.equal(sfx.unlock(), true);
  assert.deepEqual(log, ["primer", "resume"]);
});

test("unlock uses the ambient audio session: mixes with music, obeys the silent switch", () => {
  const nav = globalThis.navigator;
  const session = { type: "auto" };
  Object.defineProperty(globalThis, "navigator", { value: { audioSession: session }, configurable: true });
  try {
    const sfx = createSfx({ storage: memoryStorage(), AudioContextImpl: fakeAudioContext([]), OfflineContextImpl: null });
    sfx.unlock();
    assert.equal(session.type, "ambient");
    sfx.setSoundOn(false);
    assert.equal(session.type, "ambient", "mute never switches to a music-pausing session");
  } finally {
    Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true });
  }
});

test("sfx never requests the playback audio session", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(path.join(publicDir, "sfx.js"), "utf8");
  assert.doesNotMatch(source, /setAudioSessionType\("playback"\)|type\s*=\s*"playback"/);
});
