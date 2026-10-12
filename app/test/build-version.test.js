import assert from "node:assert/strict";
import test from "node:test";
import { deriveVersion, highestPrRef, stampIndexHtml } from "../../scripts/build-version.mjs";

test("version: squash-merge commit message wins", () => {
  assert.deepEqual(deriveVersion({ env: { VERCEL_GIT_COMMIT_MESSAGE: "Heard-you invite line (#158)", VERCEL_GIT_PULL_REQUEST_ID: "3" }, gitLog: "x (#200)" }), { version: "v1.158", source: "commit-message" });
});
test("version: preview falls back to the PR id", () => {
  assert.deepEqual(deriveVersion({ env: { VERCEL_GIT_COMMIT_MESSAGE: "wip", VERCEL_GIT_PULL_REQUEST_ID: "159" }, gitLog: "" }), { version: "v1.159", source: "pull-request-id" });
});
test("version: then the highest (#NNN) in git log, then client fallback", () => {
  assert.deepEqual(deriveVersion({ env: {}, gitLog: "a (#99)\nb (#157)\nc (#12)" }), { version: "v1.157", source: "git-log" });
  assert.deepEqual(deriveVersion({ env: { VERCEL_GIT_PULL_REQUEST_ID: "" }, gitLog: "no refs" }), { version: null, source: "fallback" });
  assert.equal(highestPrRef("Revert \"x (#150)\" (#151)"), 151);
});
test("version: stamps only the meta tag", () => {
  const html = '<head>\n  <meta name="klafi-version" content="" />\n  <script src="/app.js?v=abc"></script>';
  const out = stampIndexHtml(html, "v1.160");
  assert.match(out, /<meta name="klafi-version" content="v1\.160" \/>/);
  assert.match(out, /app\.js\?v=abc/, "asset ?v= untouched");
  assert.equal(stampIndexHtml(html, null), html);
});
