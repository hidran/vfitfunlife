// Firebase Cloud Messaging Service Worker
// This file must be at the root of your public directory

importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
// Note: These values will be replaced during build or you can use environment-specific config
firebase.initializeApp({
  apiKey: self.FIREBASE_API_KEY || 'YOUR_API_KEY',
  authDomain: self.FIREBASE_AUTH_DOMAIN || 'YOUR_AUTH_DOMAIN',
  projectId: self.FIREBASE_PROJECT_ID || 'YOUR_PROJECT_ID',
  storageBucket: self.FIREBASE_STORAGE_BUCKET || 'YOUR_STORAGE_BUCKET',
  messagingSenderId: self.FIREBASE_MESSAGING_SENDER_ID || 'YOUR_SENDER_ID',
  appId: self.FIREBASE_APP_ID || 'YOUR_APP_ID',
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  const notificationTitle = payload.notification?.title || 'V Fitness';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: payload.data?.type || 'default',
    data: payload.data,
    actions: getNotificationActions(payload.data?.type),
    vibrate: [100, 50, 100],
    requireInteraction: shouldRequireInteraction(payload.data?.type),
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification clicked:', event);

  event.notification.close();

  const data = event.notification.data || {};
  let url = '/';

  // Route based on notification type
  switch (data.type) {
    case 'booking_confirmed':
    case 'booking_reminder':
    case 'booking_cancelled':
      url = `/bookings/${data.bookingId}`;
      break;
    case 'event':
      url = `/events/${data.eventId}`;
      break;
    case 'challenge':
      url = `/challenges/${data.challengeId}`;
      break;
    case 'vip':
      url = '/vip';
      break;
    case 'promo':
      url = '/promotions';
      break;
    default:
      url = '/notifications';
  }

  // Handle action clicks
  if (event.action === 'view') {
    // Already handled above
  } else if (event.action === 'dismiss') {
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there's already a window open
      for (const client of windowClients) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open a new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Helper functions
function getNotificationActions(type) {
  const defaultActions = [
    { action: 'view', title: 'Visualizza' },
    { action: 'dismiss', title: 'Ignora' },
  ];

  switch (type) {
    case 'booking_reminder':
      return [
        { action: 'view', title: 'Vedi Dettagli' },
        { action: 'dismiss', title: 'OK' },
      ];
    case 'booking_confirmed':
      return [
        { action: 'view', title: 'Vedi Prenotazione' },
        { action: 'dismiss', title: 'OK' },
      ];
    default:
      return defaultActions;
  }
}

function shouldRequireInteraction(type) {
  // These notification types should stay visible until user interacts
  const importantTypes = ['booking_reminder', 'booking_cancelled'];
  return importantTypes.includes(type);
}
