/**
 * Whether an error is Firestore's or a callable's "permission-denied": the rules refused the read or write. For a
 * venue-scoped query this means the signed-in user no longer owns or staffs the venue (the admin removed or deactivated
 * their venueStaff link), so callers drop their cached authority instead of showing a generic load error.
 */
export function isPermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === 'string' && /(^|\/)permission-denied$/.test(code)) return true;
  return typeof message === 'string' && /insufficient permissions|permission-denied/i.test(message);
}
