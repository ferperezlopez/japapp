// Service worker mínimo, solo para recibir Web Push — sin cache ni
// soporte offline (no fue pedido, y agregarlo sin querer podría servir
// versiones viejas de la app).
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "JAPApp", body: event.data.text() };
  }

  const { title, body, url } = payload;

  event.waitUntil(
    self.registration.showNotification(title || "JAPApp", {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: url || "/notificaciones" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/notificaciones";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === new URL(url, self.location.origin).href && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
