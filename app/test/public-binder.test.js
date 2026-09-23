import assert from "node:assert/strict";
import test from "node:test";
import {
  ensurePublicBinderSlug,
  normalizePublicBinderSlug,
  publicBinderView,
} from "../server/public-binder.js";

test("public binder slugs stay hex and hide session secrets", () => {
  assert.equal(normalizePublicBinderSlug("AbCdef123456"), "abcdef123456");
  assert.equal(normalizePublicBinderSlug("../etc/passwd"), "");
  assert.equal(normalizePublicBinderSlug("short"), "");
  const session = {
    displayName: "גיא",
    avatarId: "kid-boy",
    factionId: "LIK",
    inventory: { "LIK-M01-Q01": 2, empty: 0 },
    instances: [
      { cardId: "LIK-M01-Q01", numberedIndex: 4, numberedOf: 100 },
      { cardId: "YSR-M01-Q01", numberedIndex: 0 },
    ],
    unseenPulls: ["secret"],
    pendingRankRewards: [3],
  };
  const slug = ensurePublicBinderSlug(session);
  assert.equal(normalizePublicBinderSlug(slug), slug);
  const view = publicBinderView(session);
  assert.equal(view.slug, slug);
  assert.equal(view.displayName, "גיא");
  assert.deepEqual(view.inventory, { "LIK-M01-Q01": 2 });
  assert.equal(view.ownedUnique, 1);
  assert.equal(view.numberedCopies.length, 1);
  assert.equal(view.unseenPulls, undefined);
  assert.equal(view.pendingRankRewards, undefined);
});
