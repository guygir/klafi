import assert from "node:assert/strict";
import test from "node:test";
import {
  BUG_RATE_COOKIE,
  createGithubBugFromBody,
  parseGithubRepo,
  rateCookie,
  sanitizeBugText,
} from "../server/github-bugs.js";

test("bug text is sanitized like GameRev suggestions", () => {
  assert.equal(sanitizeBugText("  hello <script> "), "hello script");
  assert.equal(sanitizeBugText("see [link] javascript:alert(1)"), "see (link) alert(1)");
  assert.equal(parseGithubRepo("guygir/klafi")?.repo, "klafi");
  assert.equal(parseGithubRepo("nopath"), null);
});

test("createGithubBugFromBody follows the GameRev issue flow", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 201,
      async text() {
        return JSON.stringify({ html_url: "https://github.com/guygir/klafi/issues/99" });
      },
    };
  };
  const missing = await createGithubBugFromBody({}, { text: "הכפתור לא עובד" }, {});
  assert.equal(missing.status, 503);

  const honeypot = await createGithubBugFromBody(
    { GITHUB_COMMENTS_TOKEN: "tok", GITHUB_COMMENTS_REPO: "guygir/klafi" },
    { text: "spam", website: "https://bots.test" },
    {},
    { fetchImpl },
  );
  assert.equal(honeypot.ok, true);
  assert.equal(honeypot.issueUrl, "");
  assert.equal(calls.length, 0);

  const empty = await createGithubBugFromBody(
    { GITHUB_COMMENTS_TOKEN: "tok", GITHUB_COMMENTS_REPO: "guygir/klafi" },
    { text: "   " },
    {},
    { fetchImpl },
  );
  assert.equal(empty.status, 400);

  const created = await createGithubBugFromBody(
    { GITHUB_COMMENTS_TOKEN: "tok", GITHUB_COMMENTS_REPO: "guygir/klafi" },
    { text: "הגרף חותך את הניווט", nickname: "גיא", pageUrl: "https://klafi.vercel.app/?view=growth" },
    {},
    { fetchImpl, now: () => 1_700_000_000_000 },
  );
  assert.equal(created.ok, true);
  assert.equal(created.issueUrl, "https://github.com/guygir/klafi/issues/99");
  assert.match(created.headers["Set-Cookie"], new RegExp(BUG_RATE_COOKIE));
  assert.equal(calls.length, 1);
  const payload = JSON.parse(calls[0].init.body);
  assert.match(payload.title, /\[KLAFI bug\]/);
  assert.match(payload.body, /הגרף חותך את הניווט/);
  assert.equal(payload.labels, undefined);

  const limited = await createGithubBugFromBody(
    { GITHUB_COMMENTS_TOKEN: "tok", GITHUB_COMMENTS_REPO: "guygir/klafi" },
    { text: "עוד באג" },
    { cookie: rateCookie([1, 2, 3], { secure: false }) },
    { fetchImpl, now: () => 4 },
  );
  assert.equal(limited.status, 429);
});
