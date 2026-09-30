const lookOnlyShowcase = (() => {
  const path = String(location.pathname || "").replace(/\.html$/, "");
  if (path === "/share/binder") return true;
  return new URLSearchParams(location.search).get("showcase") === "1";
})();
const token = lookOnlyShowcase ? null : localStorage.getItem("kalpi-alpha-session");
const headers = token ? { authorization: `Bearer ${token}` } : {};
const staticDataVersion = "visible-sets-3";
const PLAYABLE_ART_SET_IDS = ["party-leaders", "party-slot-2", "set-5"];
const json = async (response) => {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "WARMUP_FAILED");
  return body;
};
let cachedHome = null;
try {
  cachedHome = lookOnlyShowcase ? null : JSON.parse(localStorage.getItem("kalpi-home-cache") || "null");
} catch {
  /* The application will replace malformed cache data. */
}
function cachedIdleIsDue(cached) {
  const now = Date.now();
  const times = [];
  for (const pull of cached?.state?.preparedPulls || []) {
    const at = Date.parse(pull?.availableAt);
    if (Number.isFinite(at)) times.push(at);
  }
  const scheduled = Date.parse(cached?.state?.nextIdleAt);
  if (Number.isFinite(scheduled)) times.push(scheduled);
  if (!times.length) return true;
  return times.some((at) => at <= now);
}
// Home and settle decide the waiting count, whether a rip may start, and the
// settle hint. Issue them before catalog and holder reads so those cannot win
// the connection race. Neither read is a license to open a cached instance.
const home = lookOnlyShowcase
  ? null
  : fetch("/api/home", { cache: "no-store", headers }).then(json);
const idleSettle = !lookOnlyShowcase && token && (!cachedHome || cachedHome.token === token) && cachedIdleIsDue(cachedHome)
  ? fetch("/api/idle/settle", { method: "POST", cache: "no-store", headers }).then(json)
  : null;
window.__kalpiWarmup = {
  shell: fetch(`/shell.json?v=${staticDataVersion}`, { cache: "force-cache" }).then(json),
  catalog: fetch(`/catalog.json?v=${staticDataVersion}`, { cache: "force-cache" }).then(json),
  home,
  idleSettle,
  holders: fetch("/api/card-holders").then(json).catch(() => null),
};
window.__kalpiWarmup.catalog.then((catalog) => {
  for (const card of catalog?.cards || []) {
    if (!card?.artKey || !PLAYABLE_ART_SET_IDS.includes(card.releaseSetId)) continue;
    const image = new Image();
    image.decoding = "async";
    image.src = `/design-assets/${encodeURIComponent(card.artKey)}`;
  }
}).catch(() => {});
const ballotChips = [
  "ballot-letter-ysr.png",
  "ballot-letter-lik.png",
  "ballot-letter-byd.png",
  "ballot-letter-yb.png",
  "ballot-letter-dem.png",
  "ballot-letter-rz.png",
  "ballot-letter-otz.png",
  "ballot-letter-shs.png",
  "ballot-letter-utj.png",
  "ballot-letter-jnt.png",
  "ballot-letter-ram.png",
  "ballot-letter-amh.png",
  "ballot-letter-bw.png",
  "ballot-letter-rse.png",
];
window.__kalpiBallotChips = ballotChips;
for (const chip of ballotChips) {
  const image = new Image();
  image.decoding = "async";
  image.src = `/design-assets/${encodeURIComponent(chip)}`;
}
