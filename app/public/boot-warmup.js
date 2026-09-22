const lookOnlyShowcase = (() => {
  const path = String(location.pathname || "").replace(/\.html$/, "");
  if (path === "/share/binder") return true;
  return new URLSearchParams(location.search).get("showcase") === "1";
})();
const token = lookOnlyShowcase ? null : localStorage.getItem("kalpi-alpha-session");
const headers = token ? { authorization: `Bearer ${token}` } : {};
const staticDataVersion = "visible-sets-2";
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
const homeDelay = token && cachedHome?.token === token
  ? 2000 + Math.floor(Math.random() * 8000)
  : 0;
const home = lookOnlyShowcase
  ? null
  : new Promise((resolve) => setTimeout(resolve, homeDelay))
    .then(() => fetch("/api/home", { cache: "no-store", headers }))
    .then(json);
window.__kalpiWarmup = {
  shell: fetch(`/shell.json?v=${staticDataVersion}`, { cache: "force-cache" }).then(json),
  catalog: fetch(`/catalog.json?v=${staticDataVersion}`, { cache: "force-cache" }).then(json),
  home,
  holders: fetch("/api/card-holders").then(json).catch(() => null),
};
window.__kalpiWarmup.catalog.then((catalog) => {
  for (const card of (catalog?.cards || []).slice(0, 12)) {
    if (!card?.artKey) continue;
    const image = new Image();
    image.decoding = "async";
    image.src = `/design-assets/${encodeURIComponent(card.artKey)}`;
  }
}).catch(() => {});
