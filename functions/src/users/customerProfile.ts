/**
 * The shape of a new customer's `users/{uid}` document — pure (no firebase-admin), so it is
 * unit-testable and shared by every server path that creates one.
 *
 * The CLIENT writes this doc at registration (completeRegistration in src/lib/firebase/auth.ts,
 * checked against `isValidUserCreate` in firestore.rules). A trainer creating an account for
 * a client (createClientAccount) must produce the same document, so the app treats the two
 * identically; `customerProfile.test.ts` diffs the key set and permissions against the
 * client source so the two cannot drift apart silently.
 */

/** Default permissions of a self-registered customer (completeRegistration, initializeUserProfile). */
export const CUSTOMER_DEFAULT_PERMISSIONS: readonly string[] = [
  "bookings:read",
  "bookings:write",
  "bookings:cancel",
  "services:read",
  "venues:read",
  "promotions:read",
];

/**
 * users/{uid}.accountStatus — set ONLY on accounts a trainer created for a client:
 * `invited` until the person first signs in (sets a password via the emailed link, or signs in
 * with Google on that address), then `active`. Self-registered accounts never carry it.
 * Server-owned: not in the users update allowlist in firestore.rules.
 */
export const ACCOUNT_STATUS_INVITED = "invited";
export const ACCOUNT_STATUS_ACTIVE = "active";

export interface InvitedCustomerInput {
  uid: string;
  email: string;
  fullName: string;
  phone: string | null;
  preferredLanguage: string;
  /** The trainer who created the account. */
  createdBy: string;
}

/**
 * The users doc for an account a trainer created: completeRegistration's new-user shape
 * (lastLoginAt null — nobody has signed in yet) plus `createdBy` and `accountStatus`.
 * `timestamp` is the server-timestamp sentinel, injected to keep this module admin-free.
 */
export function buildInvitedCustomerProfile(
  input: InvitedCustomerInput,
  timestamp: unknown,
): Record<string, unknown> {
  return {
    uid: input.uid,
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    dateOfBirth: null,
    preferredSection: "fit",
    role: "customer",
    permissions: [...CUSTOMER_DEFAULT_PERMISSIONS],
    isActive: true,
    isSuspended: false,
    isVerified: false,
    isVip: false,
    pointsBalance: 100,
    walletBalance: 0,
    preferredLanguage: input.preferredLanguage,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastLoginAt: null,
    createdBy: input.createdBy,
    accountStatus: ACCOUNT_STATUS_INVITED,
  };
}

export interface AuthRecordForActivation {
  emailVerified?: boolean;
  providerData?: { providerId: string }[];
}

/**
 * Whether an `invited` account has been taken over by its owner. It was created with no
 * credential at all, so ANY sign-in provider on the record (a password set through the
 * emailed link, Google/Apple on that address) — or a verified email — means the person who
 * reads that inbox has signed in.
 */
export function isInvitedAccountClaimed(record: AuthRecordForActivation): boolean {
  if (record.emailVerified === true) return true;
  return (record.providerData ?? []).length > 0;
}
