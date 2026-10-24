/**
 * The customer-shell pages a signed-out visitor may open. Everything else under `src/app/(main)` keeps redirecting
 * to `/auth/login?next=<page>`.
 *
 * These are the discovery pages whose data Firestore already serves publicly (firestore.rules: `venues` and
 * `venues/{id}/courses` read `if true`, published `courses` and their `sessions` read without auth): the Gyms &
 * schools list, a venue page, its weekly timetable, and the course list and detail. Booking from them still asks
 * to sign in and comes back through `?next=` (CourseBooking, BookServiceSheet).
 */
export const PUBLIC_MAIN_ROUTES: readonly string[] = [
  '/fit/gyms',
  '/fit/gyms/timetable',
  '/venue',
  '/courses',
  '/courses/detail',
];

/** True when `pathname` (with or without the static export's trailing slash) is one of the public pages. */
export function isPublicMainRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return PUBLIC_MAIN_ROUTES.includes(path);
}
