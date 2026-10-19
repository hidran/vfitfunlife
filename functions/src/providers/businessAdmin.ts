import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import { requireAdmin } from "../utils/roles";
import { auditLogData, auditLogDoc, toActorRole, type ServerAuditPayload } from "../lib/audit";
import { isProtectedSuperadmin } from "../lib/superadmins";
import { region } from "../lib/runtimeOptions";
import type { BusinessLegalForm } from "./businessTypes";
import { toConcurrentUpdateError } from "./applicationDecision";
import {
  BUSINESS_VAT_COLLECTION,
  claimBusinessVat,
  isExistingBusiness,
  parseVatNumber,
} from "./businessApplication";
import {
  assertClaimReleasable,
  assertTaxIdAvailable,
  claimHolderUid,
  convertToIndividualPatches,
  parseAdminReason,
  parseProviderId,
  parseTaxIdUpdate,
  reviewedFieldsOf,
  taxIdUpdatePatch,
} from "./businessAdminRules";

/**
 * Admin callables on a business account (plan 2026-10-04, task B8): free a tax-id claim, turn a
 * company back into an individual, and change its admin-owned fields (tax id, legal name, legal
 * form, affiliation number). Admins and superadmins alike — verifying providers is admin work
 * (see decideProviderApplication), and these are its corrections.
 *
 * Each runs in ONE transaction, every read before any write, and writes its `audit_logs` entry
 * inside that same transaction (auditLogDoc/auditLogData), so the change and its record commit
 * together or not at all. Errors carry stable codes as messages (`claim_in_use`,
 * `not_a_business`, `vat_already_registered`, `invalid_vat`, ...) for the admin UI to localise.
 */

interface AdminActor {
  uid: string;
  email: string;
  role: ServerAuditPayload["actorRole"];
}

/** The signed-in admin (or superadmin) making the call, as the audit entry should name them. */
async function requireAdminCaller(req: CallableRequest<unknown>): Promise<AdminActor> {
  const callerUid = req.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required");
  try {
    await requireAdmin(callerUid);
  } catch {
    throw new HttpsError("permission-denied", "Admin required");
  }
  const caller = (await getFirestore().collection("users").doc(callerUid).get()).data() ?? {};
  return {
    uid: callerUid,
    email: (caller.email as string) ?? req.auth?.token?.email ?? "",
    role: toActorRole((caller.role as string) ?? "admin"),
  };
}

function actorFields(actor: AdminActor) {
  return { actorUid: actor.uid, actorEmail: actor.email, actorRole: actor.role };
}

/**
 * Run `work` as one Firestore transaction. The Admin SDK re-runs it on contention (fresh reads,
 * up to 5 attempts); if contention outlasts that, the caller gets a retryable `aborted` /
 * `concurrent_update` instead of `internal`. A guard's HttpsError passes through unchanged.
 */
async function inTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  try {
    return await getFirestore().runTransaction(work);
  } catch (err) {
    throw toConcurrentUpdateError(err);
  }
}

interface ReleaseBusinessVatData {
  /** The tax id whose claim to free (P.IVA / codice fiscale; spaces and `IT` allowed). */
  vatNumber: string;
  reason?: string;
}

/**
 * Free a `businessVat/{vat}` uniqueness claim (decision D5's escape hatch): a rejected company
 * keeps its claim so it can re-apply (B3), and an unreviewed claim can squat on the real owner's
 * tax id — this lets an admin hand the number back.
 *
 * - The number is validated and normalised (`invalid_vat`); no claim ⇒ `not-found` /
 *   `claim_not_found`.
 * - Refused with `failed-precondition` / `claim_in_use` while the claim's holder still has an
 *   instructors doc carrying that number that is not rejected, or is listed whatever its status
 *   says (assertClaimReleasable) — use convertBusinessToIndividual or updateBusinessTaxId for a
 *   live company instead. Releasing a rejected company's claim never makes it approvable: an
 *   approval must hold the claim (commitProviderDecision), so it ends in `claim_missing`, or
 *   `vat_already_registered` once the real owner has taken the number.
 * - Otherwise the claim is deleted, audited as `business_vat` / `delete` with the claim as
 *   `before`.
 */
export const releaseBusinessVat = onCall<ReleaseBusinessVatData>({ region }, async (req) => {
  const actor = await requireAdminCaller(req);
  const vatNumber = parseVatNumber(req.data?.vatNumber);
  const reason = parseAdminReason(req.data?.reason);

  const db = getFirestore();
  const claimRef = db.collection(BUSINESS_VAT_COLLECTION).doc(vatNumber);
  const releasedFrom = await inTransaction(async (tx) => {
    const claim = await tx.get(claimRef);
    if (!claim.exists) throw new HttpsError("not-found", "claim_not_found");
    const data = claim.data() ?? {};
    // A uid that cannot name a document (never written by our code) means no live holder.
    const holderUid = claimHolderUid(data);
    const holder = holderUid ? await tx.get(db.collection("instructors").doc(holderUid)) : null;
    assertClaimReleasable(vatNumber, holder?.data());

    tx.delete(claimRef);
    tx.set(auditLogDoc(), auditLogData({
      ...actorFields(actor),
      action: "delete",
      entityType: "business_vat",
      entityId: vatNumber,
      before: data,
      after: null,
      ...(reason ? { reason } : {}),
    }));
    return holderUid;
  });

  return { success: true, vatNumber, releasedFrom };
});

interface ConvertBusinessToIndividualData {
  providerId: string;
  reason?: string;
}

/**
 * Turn a company back into an individual provider — e.g. a sole trader who picked "Company" by
 * mistake, who would otherwise be locked out of the individual path for good
 * (`business_account_exists`).
 *
 * One transaction, all reads first (users and instructors docs, then every claim the uid holds):
 * removes `users/{uid}.providerType` and the `instructors/{uid}.business` map with
 * FieldValue.delete() (never null — see convertToIndividualPatches), deletes every `businessVat`
 * claim held by the uid, and renames the public `name`/`fullName` to the user's personal name.
 * The verification state is untouched: an approved company stays listed under that name.
 *
 * Refused with `failed-precondition` / `not_a_business` when neither signal says business
 * (isExistingBusiness), `not-found` / `provider_not_found` without a users doc,
 * `permission-denied` / `protected_account` on a protected superadmin. Audited as `provider` /
 * `update` with the removed map and claims as `before`.
 */
export const convertBusinessToIndividual = onCall<ConvertBusinessToIndividualData>({ region }, async (req) => {
  const actor = await requireAdminCaller(req);
  const providerId = parseProviderId(req.data?.providerId);
  const reason = parseAdminReason(req.data?.reason);

  const db = getFirestore();
  const userRef = db.collection("users").doc(providerId);
  const instructorRef = db.collection("instructors").doc(providerId);
  const claims = db.collection(BUSINESS_VAT_COLLECTION);

  const releasedClaims = await inTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const instructorSnap = await tx.get(instructorRef);
    const held = await tx.get(claims.where("uid", "==", providerId));

    if (!userSnap.exists) throw new HttpsError("not-found", "provider_not_found");
    const user = userSnap.data() ?? {};
    if (isProtectedSuperadmin(user)) {
      throw new HttpsError("permission-denied", "protected_account");
    }
    const instructor = instructorSnap.exists ? instructorSnap.data() : undefined;
    if (!isExistingBusiness(user, instructor)) {
      throw new HttpsError("failed-precondition", "not_a_business");
    }

    const patches = convertToIndividualPatches({
      user,
      instructor,
      now: FieldValue.serverTimestamp(),
      remove: FieldValue.delete(),
    });
    const claimIds = held.docs.map((claim) => claim.id);

    // update(), not set(merge): the docs exist (read above), the patches are flat, and a
    // FieldValue.delete() removes the field outright.
    tx.update(userRef, patches.user);
    if (patches.instructor) tx.update(instructorRef, patches.instructor);
    for (const claim of held.docs) tx.delete(claim.ref);
    tx.set(auditLogDoc(), auditLogData({
      ...actorFields(actor),
      action: "update",
      entityType: "provider",
      entityId: providerId,
      before: {
        providerType: user.providerType ?? null,
        business: instructor?.business ?? null,
        claims: claimIds,
        name: instructor?.name ?? null,
      },
      after: {
        providerType: null,
        business: null,
        claims: [],
        name: patches.publicName ?? instructor?.name ?? null,
      },
      ...(reason ? { reason } : {}),
    }));
    return claimIds;
  });

  return { success: true, providerId, releasedClaims };
});

interface UpdateBusinessTaxIdData {
  providerId: string;
  /** The new (or same) tax id — required. */
  vatNumber: string;
  /** Each of these changes only when sent. */
  legalName?: string;
  legalForm?: BusinessLegalForm | null;
  affiliationNumber?: string | null;
  reason?: string;
}

/**
 * The only way to change a company's admin-owned fields after review (D6: the owner can't —
 * firestore.rules lock them — and a plain admin client write would leave the `businessVat` claim
 * behind).
 *
 * Input is validated with the signup validators (parseTaxIdUpdate). Then one transaction, all
 * reads first (the instructors doc, every claim the uid holds, every instructors doc carrying
 * the new number, the claim on the new number):
 * - the doc must have a `business` map (`failed-precondition` / `not_a_business`);
 * - the new number must be unclaimed or already this uid's (`already-exists` /
 *   `vat_already_registered`);
 * - when the number CHANGES, no other instructors doc may carry it, claimed or not — e.g. a
 *   rejected company whose claim was released (`already-exists` / `vat_carried_by_other`:
 *   convert that company or change its number first; invariant I2). An unchanged number is a
 *   legal-data correction and is not blocked by other carriers (assertTaxIdAvailable);
 * - the claim moves with claimBusinessVat (`byAdmin`: an approved company may move too), which
 *   also releases every other claim the uid holds;
 * - `instructors/{uid}.business` gets only the sent fields, as a nested map merged with
 *   set(merge) (taxIdUpdatePatch — no dotted keys). The approval state is left as it is.
 * Audited as `provider` / `update` with the reviewed fields and claims before and after.
 */
export const updateBusinessTaxId = onCall<UpdateBusinessTaxIdData>({ region }, async (req) => {
  const actor = await requireAdminCaller(req);
  const providerId = parseProviderId(req.data?.providerId);
  const update = parseTaxIdUpdate(req.data);
  const reason = parseAdminReason(req.data?.reason);

  const db = getFirestore();
  const instructors = db.collection("instructors");
  const instructorRef = instructors.doc(providerId);
  const claims = db.collection(BUSINESS_VAT_COLLECTION);
  const now = FieldValue.serverTimestamp();

  const released = await inTransaction(async (tx) => {
    const instructorSnap = await tx.get(instructorRef);
    const held = await tx.get(claims.where("uid", "==", providerId));
    // Stored tax ids are normalised (validateBusinessInput / this callable), so an equality
    // query finds every carrier. Automatic single-field index on business.vatNumber.
    const carriers = await tx.get(instructors.where("business.vatNumber", "==", update.vatNumber));
    const newClaim = await tx.get(claims.doc(update.vatNumber));
    const instructor = instructorSnap.exists ? instructorSnap.data() : undefined;
    const business = instructor?.business;
    if (!business || typeof business !== "object") {
      throw new HttpsError("failed-precondition", "not_a_business");
    }
    assertTaxIdAvailable({
      providerId,
      targetVat: update.vatNumber,
      currentVat: (business as Record<string, unknown>).vatNumber,
      claimUid: newClaim.exists ? newClaim.data()?.uid : undefined,
      carrierIds: carriers.docs.map((doc) => doc.id),
    });

    const heldVatNumbers = held.docs.map((claim) => claim.id);
    // Reads the new number's claim, then (only once every check passed) writes the move.
    const moved = await claimBusinessVat<DocumentReference>(tx, {
      uid: providerId,
      vatNumber: update.vatNumber,
      instructor,
      heldVatNumbers,
      claimRef: (vat) => claims.doc(vat),
      now,
      byAdmin: true,
    });

    tx.set(instructorRef, taxIdUpdatePatch(update, now), { merge: true });
    const before = reviewedFieldsOf(business as Record<string, unknown>);
    tx.set(auditLogDoc(), auditLogData({
      ...actorFields(actor),
      action: "update",
      entityType: "provider",
      entityId: providerId,
      before: { ...before, claims: heldVatNumbers },
      after: { ...before, ...update, claims: [update.vatNumber] },
      ...(reason ? { reason } : {}),
    }));
    return moved.released;
  });

  return { success: true, providerId, vatNumber: update.vatNumber, releasedClaims: released };
});
