const token = localStorage.getItem("kalpi-alpha-session");
fetch("/api/home", {
  cache: "no-store",
  headers: token ? { authorization: `Bearer ${token}` } : {},
}).catch(() => {});

