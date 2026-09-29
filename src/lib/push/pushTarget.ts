/**
 * In-app route a push notification opens when tapped.
 *
 * Mirrored by pushTargetUrl() in public/firebase-messaging-sw.js (the service worker cannot
 * import app modules) — keep the two in sync.
 */
export function pushTargetUrl(data: Record<string, unknown> | null | undefined): string {
  if (!data) return '/notifications';
  const link = data.link;
  // Only same-origin absolute paths; never follow a payload to another site.
  if (typeof link === 'string' && link.startsWith('/') && !link.startsWith('//')) return link;
  const type = typeof data.type === 'string' ? data.type : '';
  const bookingId = typeof data.bookingId === 'string' ? data.bookingId : '';
  if (type.startsWith('booking_') && bookingId) {
    return `/bookings/detail?id=${encodeURIComponent(bookingId)}`;
  }
  return '/notifications';
}
