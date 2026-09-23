import assert from "node:assert/strict";
import { test } from "node:test";
import { factionStandingsFromCollectors } from "../server/faction-standings.js";

test("faction standings sum member stars and keep the current player visible", () => {
  const standings = factionStandingsFromCollectors([
    { label: "גיא", stars: 6, ownedUnique: 4, factionId: "LIK", current: true, avatarId: "kid-boy" },
    { label: "נועה", stars: 12, ownedUnique: 8, factionId: "LIK", current: false, avatarId: "kid-girl" },
    { label: "אור", stars: 3, ownedUnique: 2, factionId: "YSH", current: false, avatarId: "kid-boy" },
    { label: "בלי סיעה", stars: 20, ownedUnique: 10, factionId: null, current: false, avatarId: "kid-girl" },
  ]);

  assert.equal(standings.length, 2);
  assert.equal(standings[0].partyId, "LIK");
  assert.equal(standings[0].stars, 18);
  assert.equal(standings[0].packs, 18);
  assert.equal(standings[0].members[0].label, "נועה");
  assert.equal(standings[0].members[1].label, "גיא");
  assert.equal(standings[0].members[1].current, true);
  assert.equal(standings[1].partyId, "YSH");
  assert.equal(standings[1].stars, 3);
});
