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
  });
  assert.equal(likud.visible, true);
  assert.equal(likud.showLetterArt, true);
  assert.equal(factionLetterArt({ id: "LIK" }), "hero-art-memchetlammed.png");
  assert.equal(factionLetters({ requestedLetters: ["מחל"] }), "מחל");

  const democrats = avatarBallotState({
    id: "DEM",
    requestedLetters: ["כן"],
  });
  assert.equal(democrats.visible, true);
  assert.equal(democrats.showLetterArt, false);
  assert.equal(democrats.showLetterText, true);
  assert.equal(democrats.letters, "כן");

  const bare = avatarBallotState({ id: "YSR" });
  assert.equal(bare.visible, true);
  assert.equal(bare.showBlankSeal, true);
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
