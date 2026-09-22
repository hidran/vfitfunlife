/**
 * Is this provider record verified?
 *
 * One predicate, used by the badge in the providers table, the verification filter and the
 * counters above it — because when they each decide for themselves, they disagree, and the
 * screen contradicts itself.
 *
 * That is exactly what went wrong: the table rendered `providerProfile?.isVerified ?? false`,
 * so a document with no `providerProfile` at all showed as NOT verified; the counter asked
 * Firestore for `where('providerProfile.isVerified', '==', false)`, and **a Firestore
 * equality filter never matches a document where the field is absent**. On production that
 * was 38 rows looking unverified against a counter that could only ever see 6 of them.
 *
 * Absent means not verified. A provider is verified only when something said so.
 */
export function isProviderVerified(
  record: { providerProfile?: { isVerified?: boolean } | null; isVerified?: boolean } | null | undefined
): boolean {
  if (!record) return false;
  if (record.providerProfile?.isVerified === true) return true;
  // The flat mirror some older user documents carry instead of the nested map.
  return record.isVerified === true;
}

/** The complement, named so call sites read as the question they are asking. */
export function isAwaitingVerification(
  record: Parameters<typeof isProviderVerified>[0]
): boolean {
  return !isProviderVerified(record);
}

/**
 * Does this account still need someone in the back office to look at it?
 *
 * Wider than "unverified": a person who applied is still `role: 'customer'` until the
 * decision promotes them, so counting only `role === 'provider'` makes every genuine pending
 * application invisible — the queue would read zero precisely when someone is waiting.
 */
export function needsVerificationDecision(
  record:
    | {
        role?: string;
        providerStatus?: string;
        providerProfile?: { isVerified?: boolean } | null;
        isVerified?: boolean;
      }
    | null
    | undefined
): boolean {
  if (!record) return false;
  if (record.providerStatus === "pending") return true;
  if (record.providerStatus === "rejected") return false;
  return record.role === "provider" && isAwaitingVerification(record);
}
