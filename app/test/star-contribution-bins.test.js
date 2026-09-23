import assert from "node:assert/strict";
import { test } from "node:test";
import { starContributionBins, starTickLabel } from "../public/star-contribution-bins.js";

test("narrow star span keeps one value per bar", () => {
  const bins = starContributionBins([
    { stars: 2 },
    { stars: 4, current: true },
    { stars: 4 },
  ]);
  assert.deepEqual(bins.map(({ label, count, you }) => ({ label, count, you })), [
    { label: "2★", count: 1, you: false },
    { label: "3★", count: 0, you: false },
    { label: "4★", count: 2, you: true },
  ]);
});

test("span over 10 uses ceil((max-min)/10) wide bars and range labels", () => {
  assert.equal(starTickLabel(4, 5), "4★ – 5★");
  const bins = starContributionBins([
    { stars: 2 },
    { stars: 15, current: true },
  ]);
  assert.equal(15 - 2 > 10, true);
  assert.equal(Math.ceil((15 - 2) / 10), 2);
  assert.equal(bins.length, 7);
  assert.equal(bins[0].label, "2★ – 3★");
  assert.equal(bins[0].count, 1);
  assert.equal(bins.at(-1).label, "14★ – 15★");
  assert.equal(bins.at(-1).you, true);
  assert.equal(bins.at(-1).count, 1);
});
