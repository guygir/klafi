const token = localStorage.getItem("kalpi-alpha-session");
const headers = token ? { authorization: `Bearer ${token}` } : {};
fetch("/catalog.json", { cache: "no-store" }).catch(() => {});
fetch("/api/home", { cache: "no-store", headers }).catch(() => {});
fetch("/api/catalog", { cache: "no-store" }).catch(() => {});
