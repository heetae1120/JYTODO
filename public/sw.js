// Installation support only: never cache private API responses or stale reminders.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then(async clients => {
    if (clients.length) return clients[0].focus();
    return self.clients.openWindow('/');
  }));
});
