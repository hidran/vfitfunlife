/**
 * Demo data (D5), client side: the accounts and records seeded for QA and demos carry
 * `isDemo: true` (written by the seed scripts, createBooking and scripts/backfill-demo-flag.mjs;
 * the server-side rules are in functions/src/lib/demo.ts) and must not count in any stat.
 *
 * Only `isDemo === true` is ever written, and a Firestore `!=` / `== false` filter never matches
 * a document that lacks the field — so a counter is computed as "count of everything" minus
 * "the demo documents that match the same predicate", the latter read with a single-field
 * `where('isDemo', '==', true)` (a handful of documents, no composite index).
 */

type Data = Record<string, unknown>;

export function isDemoDoc(data: Data | null | undefined): boolean {
  return data?.isDemo === true;
}

/** Firestore Timestamp, Date or epoch millis → millis; null when it is none of these. */
function millisOf(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  const v = value as { toMillis?: () => number; toDate?: () => Date };
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  return null;
}

export interface DemoDashboardInputs {
  /** users where isDemo == true */
  users: Data[];
  /** bookings where isDemo == true */
  bookings: Data[];
  /** transactions where isDemo == true */
  transactions: Data[];
  /** Start of today (the "today's bookings" lower bound). */
  todayStart: Date;
  /** First day of the month (the monthly-revenue lower bound). */
  monthStart: Date;
}

/**
 * The demo documents' share of each admin dashboard counter, computed with exactly the
 * predicates getAdminDashboardStats queries with, so subtracting it leaves the real figure.
 */
export function demoDashboardShare(input: DemoDashboardInputs) {
  const today = input.todayStart.getTime();
  const month = input.monthStart.getTime();
  const onOrAfter = (value: unknown, from: number) => {
    const ms = millisOf(value);
    return ms !== null && ms >= from;
  };

  const users = input.users.filter(isDemoDoc);
  const activeProviders = users.filter(
    (u) => u.role === 'provider' && (u.providerProfile as Data | undefined)?.isActive === true,
  ).length;
  const todayBookings = input.bookings
    .filter(isDemoDoc)
    .filter((b) => onOrAfter(b.scheduledAt, today)).length;
  const monthlyRevenue = input.transactions
    .filter(isDemoDoc)
    .filter((t) => t.type === 'booking_payment' && t.status === 'completed' && onOrAfter(t.createdAt, month))
    .reduce((sum, t) => sum + (typeof t.amount === 'number' ? t.amount : 0), 0);

  return { totalUsers: users.length, activeProviders, todayBookings, monthlyRevenue };
}
