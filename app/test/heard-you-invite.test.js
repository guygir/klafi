import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_REFERRAL_STARS, referralStarGate } from "../server/referral.js";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const studio = JSON.parse(await readFile(new URL("../data/studio-content.json", import.meta.url), "utf8"));

test("heard-you: golden invite line with the player's own link and the real star gate", () => {
  assert.match(html, /<div id="heard-you-invite" class="heard-you-invite" hidden>[\s\S]*הזמינו חברים בעזרת הקישור:[\s\S]*id="heard-you-invite-link"[\s\S]*הם הגיעו ל15 כוכבים\? תקבלו חבילה מתנה!/);
  assert.match(app, /const link = inviteShareUrl\(model\.serverState\?\.referralCode\);\n  if \(!elements\.heardYouInvite\) return;/);
  assert.match(app, /הם הגיעו ל\$\{stars\} כוכבים\? תקבלו חבילה מתנה!/);
  assert.match(app, /elements\.heardYouInviteLink\?\.addEventListener\("click", \(\) => copyInviteLink\(\)\);/);
  assert.equal(referralStarGate(studio.gameConfig), 15, "the copy says 15 stars");
  assert.equal(DEFAULT_REFERRAL_STARS, 15);
});

test("heard-you: new notes show once for everyone (old '1' flag no longer counts as seen)", () => {
  assert.match(app, /const HEARD_YOU_NOTES = "invite-1";/);
  assert.match(app, /localStorage\.getItem\(HEARD_YOU_KEY\) === HEARD_YOU_NOTES/);
  assert.match(app, /localStorage\.setItem\(HEARD_YOU_KEY, HEARD_YOU_NOTES\)/);
});

test("heard-you: auto-opens once again, only after the tutorial and after the calendar", () => {
  assert.match(app, /function maybeAutoShowHeardYou\(\) \{\n  if \(readTipsPref\(\) !== "off" \|\| tipsBusy\(\)\) return false;/);
  assert.match(app, /if \(!tipsBusy\(\) && !maybeShowStreakCalendar\(\)\) maybeAutoShowHeardYou\(\);/);
  assert.match(app, /maybeShowTradeNotice\(\);\n  maybeAutoShowHeardYou\(\);\n  return false;/);
});
