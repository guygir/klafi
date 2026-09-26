import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { LIVE_RELEASE_SET_IDS } from "../server/visible-sets.js";
import { DEFAULT_PACK_SETS } from "../server/pack-config.js";

// Guards for Guy's rule: every card that can be pulled must count everywhere.
// These fail when a new pullable set is added to Studio but one of the hand-kept
// lists is not updated, or when server code falls back to the party-only cards.json.

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");

test("client and server agree on the live release sets", async () => {
  const client = await readFile(path.join(appRoot, "public/app.js"), "utf8");
  const match = /const LIVE_RELEASE_SET_IDS = (\[[^\]]*\]);/.exec(client);
  assert.ok(match, "public/app.js declares LIVE_RELEASE_SET_IDS");
  assert.deepEqual(JSON.parse(match[1]), [...LIVE_RELEASE_SET_IDS]);
});

test("every set packs can pull from is live and known to the pack config", async () => {
  const studio = JSON.parse(await readFile(path.join(appRoot, "data/studio-content.json"), "utf8"));
  const defaults = new Set(DEFAULT_PACK_SETS.map(({ id }) => id));
  const pullable = (studio.gameConfig?.pack?.sets || []).filter(({ weight }) => Number(weight) > 0).map(({ id }) => id);
  assert.ok(pullable.includes("set-5"), "fixture sanity: set-5 is pullable");
  for (const id of pullable) {
    assert.ok(LIVE_RELEASE_SET_IDS.includes(id), `${id} is pullable but not in LIVE_RELEASE_SET_IDS`);
    assert.ok(defaults.has(id), `${id} is pullable but normalizePackConfig would drop it (not in DEFAULT_PACK_SETS)`);
  }
  for (const { id, runtimeState } of studio.gameConfig?.releaseSets || []) {
    if (runtimeState === "active") assert.ok(LIVE_RELEASE_SET_IDS.includes(id), `active release ${id} is not live`);
  }
});

test("server scoring paths use the full catalog, not the party-only cards.json", async () => {
  const source = await readFile(path.join(appRoot, "server/app.js"), "utf8");
  assert.doesNotMatch(source, /scoreLeagueMembers\([^)]*,\s*cards\)/);
  assert.doesNotMatch(source, /buildOwnedCardQuiz\(current,\s*cards,/);
  assert.doesNotMatch(source, /leaderboardSummary\([^)]*\bcards\b[^)]*\)/);
});
