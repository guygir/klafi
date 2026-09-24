import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SUNBURST_GOLD,
  SUNBURST_RARITY,
  alignSunburstToCard,
  buildSunburstGradient,
  normalizeSunburstRarity,
  readSunburstRarityOverride,
  readSunburstVersion,
  resolveSunburstRarity,
  sunburstRayColor,
} from "../public/walkout-sunburst.js";

test("product rarity table is four star densities and never promo", () => {
  assert.deepEqual(Object.keys(SUNBURST_RARITY), ["common", "uncommon", "rare", "holo"]);
  assert.deepEqual(SUNBURST_RARITY.common, { rayPairs: 4, opacity: 0.26, durationSec: 36, rayFrac: 0.28 });
  assert.deepEqual(SUNBURST_RARITY.uncommon, { rayPairs: 9, opacity: 0.44, durationSec: 20, rayFrac: 0.36 });
  assert.deepEqual(SUNBURST_RARITY.rare, { rayPairs: 16, opacity: 0.60, durationSec: 11, rayFrac: 0.44 });
  assert.deepEqual(SUNBURST_RARITY.holo, { rayPairs: 24, opacity: 0.76, durationSec: 6.5, rayFrac: 0.52 });
  assert.equal(SUNBURST_GOLD, "#b38d3f");
});

test("resolveSunburstRarity maps finishes and skips promo", () => {
  assert.equal(resolveSunburstRarity({ finish: "Common" }, {}, ""), "common");
  assert.equal(resolveSunburstRarity({ finish: "Uncommon" }, {}, ""), "uncommon");
  assert.equal(resolveSunburstRarity({ finish: "Rare" }, {}, ""), "rare");
  assert.equal(resolveSunburstRarity({ finish: "Holo" }, {}, ""), "holo");
  assert.equal(resolveSunburstRarity({ finish: "Rare", numberedIndex: 3 }, {}, ""), "holo");
  assert.equal(resolveSunburstRarity({}, { rarity: "Uncommon" }, ""), "uncommon");
  assert.equal(resolveSunburstRarity({ finish: "Promotion" }, {}, ""), null);
  assert.equal(resolveSunburstRarity({ finish: "Event" }, {}, ""), null);
  assert.equal(normalizeSunburstRarity("numbered"), "holo");
  assert.equal(normalizeSunburstRarity("promo"), null);
  assert.equal(normalizeSunburstRarity("promotion"), null);
});

test("query flags force version and rarity without a toolbar", () => {
  assert.equal(readSunburstVersion(""), "v1");
  assert.equal(readSunburstVersion("?sunburst=v2"), "v2");
  assert.equal(readSunburstVersion("?sunburst=off"), "off");
  assert.equal(readSunburstVersion("?sunburst=nope"), "v1");
  assert.equal(readSunburstRarityOverride("?rarity=rare"), "rare");
  assert.equal(readSunburstRarityOverride("?rarity=numbered"), "holo");
  assert.equal(readSunburstRarityOverride("?rarity=promo"), null);
  assert.equal(resolveSunburstRarity({ finish: "Common" }, {}, "?rarity=holo"), "holo");
});

test("holo and numbered rays use pack-gold; others keep the party pip", () => {
  assert.equal(sunburstRayColor("#1B3A6B", "common"), "#1B3A6B");
  assert.equal(sunburstRayColor("#C43B3B", "rare"), "#C43B3B");
  assert.equal(sunburstRayColor("#C43B3B", "holo"), SUNBURST_GOLD);
  assert.equal(sunburstRayColor("#C43B3B", "numbered"), SUNBURST_GOLD);
});

test("V1 gradient keeps transparent gaps between colored wedges", () => {
  const common = buildSunburstGradient("#1B3A6B", SUNBURST_RARITY.common);
  assert.match(common, /^repeating-conic-gradient\(/);
  assert.match(common, /transparent 25\.2deg 90deg\)$/);
  const rare = buildSunburstGradient("#C43B3B", SUNBURST_RARITY.rare);
  assert.match(rare, /transparent 9\.9deg 22\.5deg\)$/);
  const soft = buildSunburstGradient("#C43B3B", { ...SUNBURST_RARITY.rare, soft: true });
  assert.match(soft, /transparent /);
  assert.notEqual(soft, rare);
});

test("alignSunburstToCard writes card-midpoint custom properties", () => {
  const props = {};
  const parent = {
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 400 }),
  };
  const wrap = {
    isConnected: true,
    parentElement: parent,
    style: { setProperty(name, value) { props[name] = value; } },
    getBoundingClientRect: () => ({ left: 50, top: 80, width: 80, height: 160 }),
  };
  const card = {
    isConnected: true,
    getBoundingClientRect: () => ({ left: 40, top: 80, width: 80, height: 160 }),
  };
  assert.equal(alignSunburstToCard(wrap, card), true);
  assert.equal(props["--sunburst-cx"], "70px");
  assert.equal(props["--sunburst-cy"], "140px");
  assert.equal(props["--sunburst-ox"], "35%");
  assert.equal(props["--sunburst-oy"], "35%");
});
