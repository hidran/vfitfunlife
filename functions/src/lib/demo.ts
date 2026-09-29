/**
 * Demo data (D5): the accounts and records seeded for QA and sales demos must never count in
 * a stat or metric a partner reads.
 *
 * The source of truth is a boolean `isDemo: true` on the document itself — users, instructors,
 * bookings, clients, reviews, transactions. The seed scripts write it, and
 * scripts/backfill-demo-flag.mjs stamps the documents seeded before the flag existed. The
 * email-domain / id-prefix checks below are a belt-and-braces fallback for a document the
 * backfill has not reached yet; they identify exactly what the backfill flags.
 *
 * Only `isDemo === true` is ever written: a Firestore `!=` / `== false` filter cannot match a
 * missing field, so aggregations read the documents (or a bounded superset) and filter in code
 * with these helpers rather than relying on every real document carrying `isDemo: false`.
 *
 * Pure and import-free, so the metrics layer, the booking callables and scripts can all share it.
 */

/** Every demo account's email: demo.customer@, demo.provider@, demo.admin@, the demo clients. */
export const DEMO_EMAIL_DOMAIN = "@vitfitdemo.dev";

/**
 * Seeded demo ids: demo-customer-vfit, demo-provider-vfit, demo-admin-vfit, demo-client-*,
 * demo-client-user-*, demo-user-*, demo-trainer-*, demo-booking-*. A Firebase Auth uid is
 * 28 alphanumeric characters and never contains a hyphen, so no real account can match.
 */
export const DEMO_ID_PREFIX = "demo-";

type Data = Record<string, unknown> | null | undefined;

export function isDemoEmail(email: unknown): boolean {
  return typeof email === "string" && email.trim().toLowerCase().endsWith(DEMO_EMAIL_DOMAIN);
}

export function isDemoId(id: unknown): boolean {
  return typeof id === "string" && id.startsWith(DEMO_ID_PREFIX);
}

/** A `users` or `instructors` document (or a `clients` roster entry) that is demo data. */
export function isDemoAccount(id: string | null | undefined, data: Data): boolean {
  if (data?.isDemo === true) return true;
  if (isDemoId(id)) return true;
  if (isDemoEmail(data?.email)) return true;
  // clients/{id} roster entries: the customer they describe.
  if (isDemoId(data?.userId)) return true;
  return false;
}

/** A booking made BY a demo customer or WITH a demo trainer. */
export function isDemoBooking(id: string | null | undefined, data: Data): boolean {
  if (data?.isDemo === true) return true;
  if (isDemoId(id)) return true;
  if (isDemoEmail(data?.userEmail)) return true;
  if (isDemoId(data?.userId)) return true;
  if (isDemoId(data?.instructorId) || isDemoId(data?.providerId)) return true;
  return false;
}

/**
 * Whether a NEW booking is demo data: its customer or its trainer is a demo account. Used by
 * createBooking, which has both documents in hand already.
 */
export function bookingInvolvesDemo(
  userId: string,
  user: unknown,
  instructorId: string | null,
  instructor: unknown,
): boolean {
  if (isDemoAccount(userId, user as Data)) return true;
  if (instructorId && isDemoAccount(instructorId, instructor as Data)) return true;
  return false;
}

/**
 * The ratings that feed a public average. A demo customer's review of a real trainer or venue
 * must not move its rating; a demo trainer's own rating counts every review (demo reviews are
 * all it will ever have).
 */
export function ratingsForSummary(
  reviews: Array<{ rating?: unknown; isDemo?: unknown }>,
  ownerIsDemo: boolean,
): unknown[] {
  return reviews.filter((r) => ownerIsDemo || r.isDemo !== true).map((r) => r.rating);
}
