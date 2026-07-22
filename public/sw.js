const DEFAULT_URL = "/app/agenda";

function appUrl(value) {
  try {
    return new URL(value || DEFAULT_URL, self.location.origin).href;
  } catch {
    return new URL(DEFAULT_URL, self.location.origin).href;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: "Novo agendamento",
      body: event.data ? event.data.text() : "Chegou uma nova reserva no LinkUp Studio.",
    };
  }

  const title = payload.title || "Novo agendamento";
  const url = appUrl(payload.url || payload.data?.url || DEFAULT_URL);

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "Chegou uma nova reserva no LinkUp Studio.",
      icon: payload.icon || "/favicon.ico",
      badge: payload.badge || "/favicon.ico",
      tag: payload.tag || "linkup-appointment",
      renotify: true,
      requireInteraction: true,
      data: {
        ...(payload.data || {}),
        url,
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = appUrl(event.notification.data?.url || DEFAULT_URL);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client && client.url.includes(self.location.origin)) {
          client.navigate(url);
          return client.focus();
        }
      }

      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    }),
  );
});
