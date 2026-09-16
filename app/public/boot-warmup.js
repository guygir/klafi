const token = localStorage.getItem("kalpi-alpha-session");
const headers = token ? { authorization: `Bearer ${token}` } : {};
fetch("/api/home", { cache: "no-store", headers }).catch(() => {});
fetch("/api/catalog", { cache: "no-store" }).catch(() => {});
