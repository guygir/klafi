import assert from "node:assert/strict";
import { test } from "node:test";
import { starContributionBins, starTickLabel } from "../public/star-contribution-bins.js";

test("narrow star span keeps one value per bar from 0", () => {
  const bins = starContributionBins([
    { stars: 2 },
    { stars: 4, current: true },
    { stars: 4 },
  ]);
  assert.deepEqual(bins.map(({ label, count, you }) => ({ label, count, you })), [
    { label: "0★", count: 0, you: false },
    { label: "1★", count: 0, you: false },
    { label: "2★", count: 1, you: false },
    { label: "3★", count: 0, you: false },
    { label: "4★", count: 2, you: true },
  ]);
});

test("span over 10 starts at 0 and uses ceil(max/10) wide bars", () => {
  assert.equal(starTickLabel(4, 5), "4★ – 5★");
  const bins = starContributionBins([
    { stars: 2 },
    { stars: 15, current: true },
  ]);
  assert.equal(15 - 0 > 10, true);
  assert.equal(Math.ceil(15 / 10), 2);
  assert.equal(bins[0].label, "0★ – 1★");
  assert.equal(bins[0].count, 0);
  assert.equal(bins[1].label, "2★ – 3★");
  assert.equal(bins[1].count, 1);
  assert.equal(bins.at(-1).label, "14★ – 15★");
  assert.equal(bins.at(-1).you, true);
  assert.equal(bins.at(-1).count, 1);
});

test("0 to 20 with step 2 makes 11 bins including 0-1", () => {
  const bins = starContributionBins([
    { stars: 2 },
    { stars: 20, current: true },
  ]);
  assert.equal(Math.ceil(20 / 10), 2);
  assert.equal(bins.length, 11);
  assert.deepEqual(bins.map(({ label }) => label), [
    "0★ – 1★",
    "2★ – 3★",
    "4★ – 5★",
    "6★ – 7★",
    "8★ – 9★",
    "10★ – 11★",
    "12★ – 13★",
    "14★ – 15★",
    "16★ – 17★",
    "18★ – 19★",
    "20★",
  ]);
});
