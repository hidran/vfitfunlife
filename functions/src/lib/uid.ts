/** Firebase Auth's own uid length cap; also a sane ceiling for a Firestore document id here. */
export const MAX_UID_LENGTH = 128;

/** Firestore rejects any document id matching this shape. */
const RESERVED_UID_PATTERN = /^__.*__$/;

/**
 * Shape shared by every uid accepted for a delete (single or bulk): a non-empty string, no
 * `/` (it's used as a Firestore path segment and an audit-id component), at most
 * MAX_UID_LENGTH characters, not exactly `.` or `..`, and not matching Firestore's reserved
 * `__*__` pattern — any of the last three could otherwise make a downstream FieldPath/id
 * write fail on every attempt.
 */
export function isValidUid(u: unknown): u is string {
  return (
    typeof u === "string" &&
    u !== "" &&
    !u.includes("/") &&
    u.length <= MAX_UID_LENGTH &&
    u !== "." &&
    u !== ".." &&
    !RESERVED_UID_PATTERN.test(u)
  );
}
