const SW_VERSION = "klafi-pwa-1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow("/");
    return undefined;
  })());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "idle-ready") return;
  event.waitUntil(self.registration.showNotification("קְלָפִי", {
    body: data.body || "הקלף מוכן לאיסוף",
    tag: data.tag || "idle-ready",
    lang: "he",
    dir: "rtl",
    icon: "/design-assets/pack-wrapper-klafi.png",
  }));
});

void SW_VERSION;
