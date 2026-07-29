const SW_VERSION = "linkup-appointment-push-v3";
const DEFAULT_URL = "/app/agenda";
const APPOINTMENT_ALERT_PARAM = "appointmentAlert";
const APPOINTMENT_ID_PARAM = "appointmentId";

function appUrl(value) {
  try {
    return new URL(value || DEFAULT_URL, self.location.origin).href;
  } catch {
    return new URL(DEFAULT_URL, self.location.origin).href;
  }
}

function appointmentAlertUrl(baseUrl, data = {}) {
  const url = new URL(appUrl(baseUrl || data.url || DEFAULT_URL));
  const notificationId = data.notificationId || data.id;
  const appointmentId = data.appointmentId || data.appointment_id;

  if (notificationId) url.searchParams.set(APPOINTMENT_ALERT_PARAM, notificationId);
  if (appointmentId) url.searchParams.set(APPOINTMENT_ID_PARAM, appointmentId);

  return url.href;
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function notifyClients(message) {
  const clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  for (const client of clientList) {
    client.postMessage({
      source: "linkup-service-worker",
      version: SW_VERSION,
      ...message,
    });
  }
}

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
  const notificationData = {
    ...(payload.data || {}),
    url: appUrl(payload.url || payload.data?.url || DEFAULT_URL),
  };
  const url = appointmentAlertUrl(notificationData.url, notificationData);

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "Chegou uma nova reserva no LinkUp Studio.",
      icon: payload.icon || "/favicon.ico",
      badge: payload.badge || "/favicon.ico",
      tag: payload.tag || "linkup-appointment",
      timestamp: Date.now(),
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: [600, 180, 600, 180, 900],
      actions: [
        { action: "open-agenda", title: "Abrir agenda" },
        { action: "dismiss", title: "Ok" },
      ],
      data: {
        ...notificationData,
        url,
      },
    }),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    notifyClients({
      type: "LINKUP_PUSH_RESUBSCRIBE",
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "LINKUP_SW_STATUS") return;
  event.source?.postMessage({
    source: "linkup-service-worker",
    type: "LINKUP_SW_STATUS",
    version: SW_VERSION,
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const notificationData = event.notification.data || {};
  const url = appointmentAlertUrl(notificationData.url || DEFAULT_URL, notificationData);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if ("focus" in client && client.url.includes(self.location.origin)) {
          const targetClient = "navigate" in client ? await client.navigate(url) : client;
          const focusedClient = targetClient || client;
          focusedClient.postMessage({
            source: "linkup-service-worker",
            version: SW_VERSION,
            type: "LINKUP_APPOINTMENT_PUSH_CLICK",
            notification: notificationData,
          });
          return focusedClient.focus();
        }
      }

      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    }),
  );
});
