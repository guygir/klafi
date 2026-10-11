import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(here, "..");

/**
 * Clients load /catalog.json?v=STATIC_DATA_VERSION with cache: "force-cache", so a changed card list
 * under the same version is never fetched by anyone who already has it (set 7 shipped invisible that way).
 * When this fails: bump STATIC_DATA_VERSION in app.js and boot-warmup.js, then record the new version + hash here.
 */
function catalogFingerprint(cards) {
  const rows = cards.map((card) => [card.id, card.releaseSetId || "", card.artKey || "", card.rarity || ""].join("|")).sort();
  return createHash("sha256").update(rows.join("\n")).digest("hex").slice(0, 16);
}

test("a changed catalog card list ships with a new STATIC_DATA_VERSION", async () => {
  const [catalog, app, warmup, recorded] = await Promise.all([
    readFile(path.join(appRoot, "public/catalog.json"), "utf8").then(JSON.parse),
    readFile(path.join(appRoot, "public/app.js"), "utf8"),
    readFile(path.join(appRoot, "public/boot-warmup.js"), "utf8"),
    readFile(path.join(here, "fixtures/static-data-version.json"), "utf8").then(JSON.parse),
  ]);
  const version = app.match(/const STATIC_DATA_VERSION = "([^"]+)"/)?.[1];
  assert.ok(version, "app.js declares STATIC_DATA_VERSION");
  assert.equal(warmup.match(/const staticDataVersion = "([^"]+)"/)?.[1], version, "boot-warmup.js uses the same version as app.js");
  const fingerprint = catalogFingerprint(catalog.cards || catalog);
  if (fingerprint !== recorded.fingerprint) {
    assert.notEqual(version, recorded.version,
      `catalog.json card list changed (${recorded.fingerprint} -> ${fingerprint}) but STATIC_DATA_VERSION is still "${version}". `
      + "Bump it in app.js and boot-warmup.js, then update test/fixtures/static-data-version.json.");
    assert.fail(`Record the new pair in test/fixtures/static-data-version.json: {"version":"${version}","fingerprint":"${fingerprint}"}`);
  }
  assert.equal(version, recorded.version, "STATIC_DATA_VERSION changed: record it in test/fixtures/static-data-version.json");
});

test("a stale cached catalog is reloaded past the HTTP cache when the server sends an unknown card", async () => {
  const app = await readFile(path.join(appRoot, "public/app.js"), "utf8");
  assert.match(app, /await ensureCatalogKnows\(body\);\n  return body;/, "every request() response is checked for unknown cards");
  assert.match(app, /fetch\(`\/catalog\.json\?v=\$\{STATIC_DATA_VERSION\}`, \{ cache: "reload" \}\)/);
  assert.match(app, /model\.catalogIds = new Set\(cards\.map/);
});
