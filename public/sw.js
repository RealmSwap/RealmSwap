self.addEventListener("push", function (event) {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: "/logo.png",
      badge: "/logo.png",
      vibrate: [100, 50, 100],
      tag: data.serverId ? "server-" + data.serverId : undefined,
      data: {
        dateOfArrival: Date.now(),
        serverId: data.serverId,
      },
      actions: data.serverId
        ? [
            { action: "restart", title: "Restart Server" },
            { action: "explore", title: "View Dashboard" },
          ]
        : [{ action: "explore", title: "View Dashboard" }],
    };

    event.waitUntil(self.registration.showNotification(data.title, options));
  }
});

self.addEventListener("notificationclick", function (event) {
  const serverId = event.notification.data && event.notification.data.serverId;
  event.notification.close();

  if (event.action === "restart" && serverId) {
    // Same-origin fetch carries the app session cookie, so this restart runs
    // with the user's own permissions — exactly like clicking Restart in the UI.
    event.waitUntil(
      fetch("/api/servers/" + serverId + "/restart", {
        method: "POST",
        credentials: "include",
      })
        .catch(function (err) {
          console.error("One-tap restart failed:", err);
        })
        .then(function () {
          return focusOrOpen(serverId ? "/dashboard?server=" + serverId : "/dashboard");
        })
    );
    return;
  }

  // Default click and "View Dashboard" both land on the dashboard, focused on
  // the affected server when known.
  event.waitUntil(focusOrOpen(serverId ? "/dashboard?server=" + serverId : "/dashboard"));
});

function focusOrOpen(url) {
  return clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windowClients) {
    for (var i = 0; i < windowClients.length; i++) {
      var client = windowClients[i];
      if (client.url.indexOf(url) !== -1 && "focus" in client) {
        return client.focus();
      }
    }
    if (clients.openWindow) {
      return clients.openWindow(url);
    }
  });
}
