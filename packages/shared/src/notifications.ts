const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

/**
 * Convert a URL-safe base64 string to a Uint8Array.
 * Required for PushManager.subscribe applicationServerKey.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const rawData = window.atob(base64);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}

/**
 * Request notification permission and subscribe to push notifications.
 * Returns the push subscription endpoint/keys or null if denied/unsupported.
 */
export async function requestNotificationPermission(): Promise<PushSubscription | null> {
	if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
		console.warn('Push notifications not supported');
		return null;
	}

	const permission = await Notification.requestPermission();
	if (permission !== 'granted') {
		console.warn('Notification permission denied');
		return null;
	}

	const registration = await navigator.serviceWorker.register('/sw.js');
	await navigator.serviceWorker.ready;

	// Unsubscribe from any existing subscription (may have different VAPID key)
	const existingSubscription = await registration.pushManager.getSubscription();
	if (existingSubscription) {
		await existingSubscription.unsubscribe();
	}

	const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
	const subscription = await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey
	});

	return subscription;
}

/**
 * Get the current push subscription if any.
 */
export async function getSubscription(): Promise<PushSubscription | null> {
	if (!('serviceWorker' in navigator)) return null;

	const registration = await navigator.serviceWorker.getRegistration();
	if (!registration) return null;

	return registration.pushManager.getSubscription();
}
