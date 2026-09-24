import assert from "node:assert/strict";
import test from "node:test";
import { avatarBallotState, factionLetterArt, factionLetters } from "../public/avatar-ballot.js";
import { sessionFromHomeRow } from "../server/slim-home.js";

test("avatar ballot is hidden without a faction and visible for every party", () => {
  assert.equal(avatarBallotState(null).visible, false);
  assert.equal(avatarBallotState({}).visible, false);

  const likud = avatarBallotState({
    id: "LIK",
    requestedLetters: ["מחל"],
    letterArt: "hero-art-memchetlammed.png",
  });
  assert.equal(likud.visible, true);
  assert.equal(likud.showLetterArt, true);
  assert.equal(likud.art, "ballot-letter-lik.png");
  assert.equal(factionLetterArt({ id: "LIK", letterArt: "hero-art-memchetlammed.png" }), "ballot-letter-lik.png");
  assert.equal(factionLetterArt({ id: "LIK", letterChip: "ballot-letter-lik.png" }), "ballot-letter-lik.png");
  assert.equal(factionLetters({ requestedLetters: ["מחל"] }), "מחל");
  assert.equal(factionLetters({ id: "LIK" }), "מחל");

  const democrats = avatarBallotState({
    id: "DEM",
    requestedLetters: ["אמת"],
  });
  assert.equal(democrats.visible, true);
  assert.equal(democrats.showLetterArt, true);
  assert.equal(democrats.showLetterText, false);
  assert.equal(democrats.art, "ballot-letter-dem.png");
  assert.equal(democrats.letters, "אמת");

  const yashar = avatarBallotState({ id: "YSR" });
  assert.equal(yashar.visible, true);
  assert.equal(yashar.showLetterArt, true);
  assert.equal(yashar.art, "ballot-letter-ysr.png");
  assert.equal(yashar.letters, "דרך");

  const reservists = avatarBallotState({
    id: "RSE",
    requestedLetters: ["די"],
  });
  assert.equal(reservists.showLetterArt, false);
  assert.equal(reservists.showLetterText, true);
  assert.equal(reservists.letters, "די");
});

test("slim home session mapping keeps the player faction", () => {
  const session = sessionFromHomeRow({
    display_name: "שחקן בדיקה",
    avatar_id: "kid-boy",
    created_at: "2026-09-23T00:00:00.000Z",
    highest_rank: 4,
    next_idle_at: null,
    idle_pull_count: 3,
    inventory_state: { "LIK-M01-Q01": 1 },
    extras: { loginStreak: 5, publicBinderSlug: "abc" },
    faction_id: "LIK",
  });
  assert.equal(session.factionId, "LIK");
  assert.equal(session.loginStreak, 5);
  assert.equal(session.displayName, "שחקן בדיקה");
});
