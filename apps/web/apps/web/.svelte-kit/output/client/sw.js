// Service Worker for push notifications

self.addEventListener('push', function (event) {
	if (!event.data) return;

	const data = event.data.json();
	const title = data.title || 'Language Recall';
	const options = {
		body: data.body || 'Time to practice!',
		icon: '/icon-192.png',
		badge: '/badge-72.png',
		tag: data.tag || 'recall-notification',
		data: {
			url: data.url || '/'
		}
	};

	event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
	event.notification.close();

	const url = event.notification.data?.url || '/';

	event.waitUntil(
		clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
			// Check if there's already a window/tab open with the app
			for (let i = 0; i < windowClients.length; i++) {
				const client = windowClients[i];
				if (client.url.includes(self.registration.scope) && 'focus' in client) {
					client.navigate(url);
					return client.focus();
				}
			}
			// If no existing window, open a new one
			if (clients.openWindow) {
				return clients.openWindow(url);
			}
		})
	);
});
