// Firebase Cloud Messaging service worker (web push).
//
// Registered by src/lib/push/fcmRegistration.ts with the Firebase web config passed as
// URL query parameters (…/firebase-messaging-sw.js?apiKey=…&projectId=…). The static
// export has no per-environment build step for files in public/, so the config comes
// from the page bundle that registered the worker — the same NEXT_PUBLIC_FIREBASE_*
// values that assert-build-project.mjs checks — and staging/prod can never diverge.
//
// Keep the compat SDK major in step with package.json's `firebase` dependency.

importScripts('https://www.gstatic.com/firebasejs/12.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.8.0/firebase-messaging-compat.js');

// Keep in sync with pushTargetUrl() in src/lib/push/pushTarget.ts.
function pushTargetUrl(data) {
  if (!data) return '/notifications';
  if (typeof data.link === 'string' && data.link.startsWith('/') && !data.link.startsWith('//')) return data.link;
  const type = data.type || '';
  if (type.startsWith('booking_') && data.bookingId) {
    return '/bookings/detail?id=' + encodeURIComponent(data.bookingId);
  }
  return '/notifications';
}

// Registered before firebase.messaging() so it runs ahead of the SDK's own click handler
// (which only follows webpush.fcmOptions.link and otherwise does nothing).
self.addEventListener('notificationclick', (event) => {
  event.stopImmediatePropagation();
  event.notification.close();
  // SDK-displayed notifications keep the FCM payload under data.FCM_MSG.
  const raw = event.notification.data || {};
  const data = (raw.FCM_MSG && raw.FCM_MSG.data) || raw;
  const url = new URL(pushTargetUrl(data), self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // This worker lives under its own scope and does not control the app's pages, so
      // client.navigate() is unavailable: ask an open tab to route itself instead
      // (handled in src/lib/push/fcmRegistration.ts), then focus it.
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'vfit:push-click', url: pushTargetUrl(data) });
          return client.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(url) : undefined;
    })
  );
});

const params = new URL(self.location.href).searchParams;
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

if (firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // Messages that carry a `notification` payload are displayed automatically by the SDK
  // when the page is in the background. This handler covers data-only messages.
  messaging.onBackgroundMessage((payload) => {
    if (payload.notification) return;
    const data = payload.data || {};
    const title = data.title || 'V Fitness';
    return self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/app-icon-192.png',
      badge: '/icons/badge-72.png',
      tag: data.bookingId || data.type || 'default',
      data,
    });
  });
} else {
  console.warn('[firebase-messaging-sw] missing Firebase config query params; push disabled');
}
