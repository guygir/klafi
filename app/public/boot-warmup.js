const token = localStorage.getItem("kalpi-alpha-session");
const headers = token ? { authorization: `Bearer ${token}` } : {};
const staticDataVersion = "fluid-play-2";
const json = async (response) => {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "WARMUP_FAILED");
  return body;
};
window.__kalpiWarmup = {
  shell: fetch(`/shell.json?v=${staticDataVersion}`, { cache: "force-cache" }).then(json),
  catalog: fetch(`/catalog.json?v=${staticDataVersion}`, { cache: "force-cache" }).then(json),
  home: fetch("/api/home", { cache: "no-store", headers }).then(json),
};
fetch("/api/warm", { cache: "no-store" }).catch(() => {});
