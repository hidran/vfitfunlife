/**
 * Staging-only functions: the Auth blocking gate and the superadmin callables that manage
 * the allowlist it reads.
 *
 * NEVER import this module statically. index.ts `require()`s it only when
 * `stagingAllowlistEnabled()` is true, so a production deploy never even defines these
 * functions — vfit-funlife has no Identity Platform, and a blocking function in its build
 * would fail the deploy.
 */
import {
  beforeUserCreated,
  beforeUserSignedIn,
  HttpsError as IdentityHttpsError,
} from "firebase-functions/v2/identity";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { writeAuditLog, toActorRole } from "../lib/audit";
import { region } from "../lib/runtimeOptions";
import {
  STAGING_ACCESS_DENIED,
  STAGING_ALLOWLIST_COLLECTION,
  isStagingAccessAllowed,
  normalizeAllowlistEmail,
  normalizeAllowlistNote,
  type StagingAccessLookups,
} from "./allowlist";

const firestoreLookups: StagingAccessLookups = {
  async hasAllowlistEntry(email) {
    const snap = await getFirestore().collection(STAGING_ALLOWLIST_COLLECTION).doc(email).get();
    return snap.exists;
  },
  async getRole(uid) {
    const snap = await getFirestore().collection("users").doc(uid).get();
    return snap.data()?.role;
  },
};

async function enforce(user: { uid?: string; email?: string }): Promise<void> {
  if (!(await isStagingAccessAllowed(user, firestoreLookups))) {
    console.warn("[stagingAllowlist] blocked", { uid: user.uid, email: user.email ?? null });
    throw new IdentityHttpsError("permission-denied", STAGING_ACCESS_DENIED);
  }
}

/** Refuses to create any account whose email is not on the staging allowlist. */
export const stagingBeforeUserCreated = beforeUserCreated({ region }, async (event) => {
  // No users/{uid} doc can exist before the account does, so for a new account only the
  // allowlist can say yes; passing the uid is harmless and keeps one code path.
  await enforce({ uid: event.data?.uid, email: event.data?.email });
});

/** Refuses every sign-in (including token refresh-by-reauth) for accounts not allowed on staging. */
export const stagingBeforeUserSignedIn = beforeUserSignedIn({ region }, async (event) => {
  await enforce({ uid: event.data?.uid, email: event.data?.email });
});

async function requireSuperadminCaller(
  uid: string | undefined,
  tokenEmail: string | undefined,
): Promise<{ uid: string; email: string; role: unknown }> {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required");
  const caller = (await getFirestore().collection("users").doc(uid).get()).data();
  if (caller?.role !== "superadmin") {
    throw new HttpsError("permission-denied", "Superadmin required");
  }
  return { uid, email: (caller.email as string) ?? tokenEmail ?? "", role: caller.role };
}

interface AddStagingAccessInput {
  email?: unknown;
  note?: unknown;
}

/**
 * Superadmin: allow an email onto staging. Idempotent — re-adding an existing email just
 * updates its note. Audited, like every other admin mutation.
 */
export const addStagingAccess = onCall<AddStagingAccessInput>({ region }, async (req) => {
  const caller = await requireSuperadminCaller(req.auth?.uid, req.auth?.token?.email);

  const email = normalizeAllowlistEmail(req.data?.email);
  if (!email) throw new HttpsError("invalid-argument", "A valid email is required");
  let note: string | undefined;
  try {
    note = normalizeAllowlistNote(req.data?.note);
  } catch (e) {
    throw new HttpsError("invalid-argument", e instanceof Error ? e.message : "Invalid note");
  }

  const ref = getFirestore().collection(STAGING_ALLOWLIST_COLLECTION).doc(email);
  const before = await ref.get();
  const entry = {
    email,
    note: note ?? FieldValue.delete(),
    addedBy: caller.email || caller.uid,
    addedByUid: caller.uid,
    addedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(entry, { merge: true });

  await writeAuditLog({
    actorUid: caller.uid,
    actorEmail: caller.email,
    actorRole: toActorRole(caller.role),
    action: before.exists ? "update" : "create",
    entityType: "staging_access",
    entityId: email,
    before: before.exists ? { note: before.data()?.note ?? null } : null,
    after: { email, note: note ?? null },
  });

  return { success: true, email, note: note ?? null };
});

interface RemoveStagingAccessInput {
  email?: unknown;
}

/**
 * Superadmin: take an email off staging. Existing sessions are not revoked here — the client
 * gate signs them out on next load and the blocking function refuses the next sign-in.
 */
export const removeStagingAccess = onCall<RemoveStagingAccessInput>({ region }, async (req) => {
  const caller = await requireSuperadminCaller(req.auth?.uid, req.auth?.token?.email);

  const email = normalizeAllowlistEmail(req.data?.email);
  if (!email) throw new HttpsError("invalid-argument", "A valid email is required");

  const ref = getFirestore().collection(STAGING_ALLOWLIST_COLLECTION).doc(email);
  const before = await ref.get();
  if (!before.exists) throw new HttpsError("not-found", "Email is not on the staging allowlist");
  await ref.delete();

  await writeAuditLog({
    actorUid: caller.uid,
    actorEmail: caller.email,
    actorRole: toActorRole(caller.role),
    action: "delete",
    entityType: "staging_access",
    entityId: email,
    before: { email, note: before.data()?.note ?? null },
    after: null,
  });

  return { success: true, email };
});
