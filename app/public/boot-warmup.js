const token = localStorage.getItem("kalpi-alpha-session");
const headers = token ? { authorization: `Bearer ${token}` } : {};
const staticDataVersion = "visible-sets-2";
const json = async (response) => {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "WARMUP_FAILED");
  return body;
};
let cachedHome = null;
try {
  cachedHome = JSON.parse(localStorage.getItem("kalpi-home-cache") || "null");
} catch {
  /* The application will replace malformed cache data. */
}
const homeDelay = token && cachedHome?.token === token
  ? 2000 + Math.floor(Math.random() * 8000)
  : 0;
const home = new Promise((resolve) => setTimeout(resolve, homeDelay))
  .then(() => fetch("/api/home", { cache: "no-store", headers }))
  .then(json);
window.__kalpiWarmup = {
  shell: fetch(`/shell.json?v=${staticDataVersion}`, { cache: "force-cache" }).then(json),
  catalog: fetch(`/catalog.json?v=${staticDataVersion}`, { cache: "force-cache" }).then(json),
  home,
};
