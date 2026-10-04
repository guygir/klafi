const lookOnlyShowcase = (() => {
  const path = String(location.pathname || "").replace(/\.html$/, "");
  if (path === "/share/binder") return true;
  return new URLSearchParams(location.search).get("showcase") === "1";
})();
const token = lookOnlyShowcase ? null : localStorage.getItem("kalpi-alpha-session");
const headers = token ? { authorization: `Bearer ${token}` } : {};
const PENDING_INVITE_KEY = "klafi-pending-invite";
function pendingInvite() {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get("invite") || params.get("ref") || "";
  const fresh = /^[A-Za-z0-9-]{6,16}$/.test(fromUrl) ? fromUrl : "";
  try {
    if (token) {
      sessionStorage.removeItem(PENDING_INVITE_KEY);
      return "";
    }
    if (fresh) sessionStorage.setItem(PENDING_INVITE_KEY, fresh);
    return fresh || sessionStorage.getItem(PENDING_INVITE_KEY) || "";
  } catch {
    return fresh;
  }
}
const inboundInvite = pendingInvite();
const homePath = inboundInvite
  ? `/api/home?invite=${encodeURIComponent(inboundInvite)}`
  : "/api/home";
const staticDataVersion = "visible-sets-4";
const PLAYABLE_ART_SET_IDS = ["party-leaders", "party-slot-2", "set-5", "set-6"];
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
// The party portrait is one image. Ask for it before the card list, which stays behind Today.
let cachedPortrait = null;
try {
  cachedPortrait = JSON.parse(localStorage.getItem("kalpi-party-portrait") || "null");
} catch {
  cachedPortrait = null;
}
if (
  cachedPortrait?.artKey
  && cachedHome?.state?.factionId
  && cachedPortrait.factionId === cachedHome.state.factionId
) {
  const partyPortrait = new Image();
  partyPortrait.decoding = "async";
  partyPortrait.fetchPriority = "high";
  partyPortrait.src = `/design-assets/${encodeURIComponent(cachedPortrait.artKey)}`;
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
// Today first: home (packs + calendar) and a due settle. Catalog and holder
// reads are the binder, so they wait until those responses are in and cannot
// win the connection. Neither read is a license to open a cached instance.
const home = lookOnlyShowcase
  ? null
  : fetch(homePath, { cache: "no-store", headers }).then(json);
const idleSettle = !lookOnlyShowcase && token && (!cachedHome || cachedHome.token === token) && cachedIdleIsDue(cachedHome)
  ? fetch("/api/idle/settle", { method: "POST", cache: "no-store", headers }).then(json)
  : null;
const todayScreenReady = Promise.all(
  [home, idleSettle].filter(Boolean).map((job) => Promise.resolve(job).catch(() => null)),
);
window.__kalpiWarmup = {
  shell: fetch(`/shell.json?v=${staticDataVersion}`, { cache: "force-cache" }).then(json),
  home,
  idleSettle,
  catalog: todayScreenReady.then(() => fetch(`/catalog.json?v=${staticDataVersion}`, { cache: "force-cache" }).then(json)),
  holders: todayScreenReady.then(() => fetch("/api/card-holders").then(json).catch(() => null)),
};
function prefetchPlayableArt(catalog) {
  for (const card of catalog?.cards || []) {
    if (!card?.artKey || !PLAYABLE_ART_SET_IDS.includes(card.releaseSetId)) continue;
    const image = new Image();
    image.decoding = "async";
    image.src = `/design-assets/${encodeURIComponent(card.artKey)}`;
  }
}
window.__kalpiWarmup.catalog.then((catalog) => {
  prefetchPlayableArt(catalog);
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
// Letters and ballot paper wait until the pack count and the other critical
// reads have answered, so they are the last prefetch on entry. Leaderboards
// do not wait on this mark; they refresh after the binder is queued.
let markImagesQueued = () => {};
window.__kalpiWarmup.imagesQueued = new Promise((resolve) => {
  markImagesQueued = resolve;
});
const crucialWarmup = [home, idleSettle, window.__kalpiWarmup.shell, window.__kalpiWarmup.catalog, window.__kalpiWarmup.holders].filter(Boolean);
Promise.all(crucialWarmup.map((job) => Promise.resolve(job).catch(() => null))).then(() => {
  for (const chip of ["ballot-paper.png", ...ballotChips]) {
    const image = new Image();
    image.decoding = "async";
    image.src = `/design-assets/${encodeURIComponent(chip)}`;
  }
  window.__kalpiPaintBallotLeaves?.();
}).finally(() => {
  markImagesQueued();
});
