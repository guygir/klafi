import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PACKRIP_ASSETS,
  PACKRIP_PARAMS,
  PACKRIP_TIMELINE,
  glowLevels,
  packPose,
  packRipAssetsDecoded,
  packRipMarkup,
  preloadPackRipAssets,
  stripPose,
} from "../public/packrip.js";

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");

test("pack-rip timeline keeps the approved beats", () => {
  assert.deepEqual({ ...PACKRIP_TIMELINE }, {
    ANTIC: 420,
    RIP: 1000,
    THROW: 560,
    GLOW_IN: 1150,
    GLOW_DUR: 1000,
    END: 2600,
  });
  assert.equal(PACKRIP_PARAMS.throwUp, 520);
  assert.equal(PACKRIP_PARAMS.throwRight, 300);
  assert.equal(PACKRIP_PARAMS.squashY, 0.955);
});

test("idle bob, then shake and squash before the rip", () => {
  const idle = packPose(300);
  assert.equal(idle.scaleY, 1);
  assert.equal(idle.rotate, 0);
  const antic = packPose(900);
  assert.ok(antic.scaleY < 1 && antic.scaleX > 1, "whole pack squashes before the rip");
  assert.ok(Math.abs(packPose(700).x) > 0, "shake is running mid-anticipation");
});

test("strip is hidden until the rip and gone by ~1560 ms", () => {
  assert.equal(stripPose(999), null);
  assert.ok(stripPose(1000));
  assert.equal(stripPose(1560), null);
  assert.equal(stripPose(2000), null);
});

test("strip is thrown up and right in one motion with no hold", () => {
  let prev = stripPose(1000);
  let prevStep = Infinity;
  for (let t = 1033; t < 1560; t += 33) {
    const pose = stripPose(t);
    const step = Math.hypot(pose.x - prev.x, pose.y - prev.y);
    assert.ok(pose.x >= prev.x, `moves right at ${t}`);
    assert.ok(pose.y < prev.y, `rises at ${t}`);
    assert.ok(step > 0.5, `still moving at ${t} (${step.toFixed(2)} site px/frame)`);
    assert.ok(pose.opacity <= prev.opacity + 1e-9);
    prevStep = step;
    prev = pose;
  }
  assert.ok(prevStep > 0.5);
  assert.ok(prev.opacity < 0.05, "fully faded as it leaves");
});

test("glow swells from 1150 to 2150 ms and is steady at the end", () => {
  assert.equal(glowLevels(1100).swell, 0);
  assert.ok(glowLevels(1600).swell > 0.3);
  assert.equal(glowLevels(2150).swell, 1);
  assert.equal(glowLevels(PACKRIP_TIMELINE.END).rays, 1);
  assert.ok(glowLevels(1030).flash > 0.5, "flash at the opening on the rip");
});

test("markup ships every layer on the transparent site stage and existing assets", async () => {
  const html = packRipMarkup();
  for (const layer of ["pr-shade", "pr-rays-a", "pr-rays-b", "pr-halo", "pr-beam", "pr-body", "pr-strip-closed", "pr-rim", "pr-bloom", "pr-strip", "pr-sparks"]) {
    assert.match(html, new RegExp(`class="[^"]*${layer}`), layer);
  }
  assert.match(html, /data-stage="site"/);
  assert.doesNotMatch(html, /data-stage="dark"/);
  for (const src of Object.values(PACKRIP_ASSETS)) {
    assert.match(src, /^\/packrip\/[a-z-]+\.webp$/, "rip layers ship as WebP");
    const info = await stat(path.join(publicDir, src));
    assert.ok(info.size > 0 && info.size < 400_000, `${src} ${info.size}`);
    const head = await readFile(path.join(publicDir, src));
    assert.equal(head.subarray(0, 4).toString("latin1"), "RIFF");
    assert.equal(head.subarray(8, 12).toString("latin1"), "WEBP");
  }
});

test("prefetch decodes every rip layer once and reports readiness", async () => {
  const created = [];
  const previous = globalThis.Image;
  globalThis.Image = class {
    constructor() { created.push(this); }
    decode() { return Promise.resolve(); }
  };
  try {
    assert.equal(packRipAssetsDecoded(), false);
    const first = preloadPackRipAssets();
    assert.equal(preloadPackRipAssets(), first, "idempotent");
    assert.equal(await first, true);
    assert.deepEqual(created.map(({ src }) => src).sort(), Object.values(PACKRIP_ASSETS).sort());
    assert.equal(packRipAssetsDecoded(), true);
  } finally {
    globalThis.Image = previous;
  }
});
