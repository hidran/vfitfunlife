import { HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getDefaultPermissionsForRole } from "../utils/roles";
import { auditLogData, auditLogDoc, toActorRole } from "../lib/audit";
import {
  draftServicesForCategories,
  instructorVerificationPatch,
  needsDefaultHours,
  providerRolePatch,
} from "./applicationDecision";
import { DEFAULT_WEEKLY_HOURS } from "../availability/slots";
import { isProtectedSuperadmin } from "../lib/superadmins";
import { buildBusinessVenue } from "./businessVenue";
import type { ProviderType } from "../types";

/** Who the audit entry should name as responsible for the decision. */
export interface DecisionActor {
  uid: string;
  email: string;
  role: string;
}

export interface CommitDecisionOptions {
  providerId: string;
  decision: "verified" | "rejected";
  actor: DecisionActor;
  notes?: string;
  /**
   * Present when the caller is applying for themselves. Carries what the signup form
   * collected, so the instructor document is created in the same write that approves it
   * rather than in a separate client batch the rules would (rightly) refuse to verify.
   */
  application?: {
    requestedCategoryIds: string[];
    fullName?: string | null;
    /** Recorded on both documents; absent (admin decisions) leaves whatever is stored. */
    providerType?: ProviderType;
  };
}

/**
 * The single place a provider's verification state changes.
 *
 * Both routes go through here — an admin deciding on someone else, and an applicant being
 * auto-approved at signup — so the two can never drift on the things that are easy to get
 * subtly wrong: the nested `providerProfile.isVerified` flag the public read rule keys on,
 * the role promotion, the default hours that make them bookable, the draft services, and
 * the audit entry, all committed in one batch.
 */
export async function commitProviderDecision(
  opts: CommitDecisionOptions
): Promise<{ draftServicesSeeded: number; venueId?: string | null }> {
  const { providerId, decision, actor, notes, application } = opts;

  const db = getFirestore();
  const userRef = db.collection("users").doc(providerId);
  const instructorRef = db.collection("instructors").doc(providerId);
  const [userSnap, instructorSnap] = await Promise.all([userRef.get(), instructorRef.get()]);
  if (!userSnap.exists) {
    throw new HttpsError("not-found", "Provider not found");
  }

  const user = userSnap.data() ?? {};
  const instructor = instructorSnap.data() ?? {};

  // providerRolePatch already refuses to touch an existing admin/superadmin's role, but a
  // protected superadmin's doc must not be written by this path at all (providerStatus,
  // verification fields, etc.) — belt and suspenders against a crafted application.
  if (isProtectedSuperadmin(user)) {
    throw new HttpsError("permission-denied", "Cannot modify a protected superadmin account");
  }

  const now = FieldValue.serverTimestamp();
  const verified = decision === "verified";
  const batch = db.batch();

  const rolePatch = verified ?
    providerRolePatch(
      user.role as string | undefined,
      user.permissions as string[] | undefined,
      getDefaultPermissionsForRole("provider"),
    ) :
    null;

  batch.update(userRef, {
    "providerStatus": decision,
    "isVerified": verified,
    "providerProfile.isVerified": verified,
    "verifiedBy": actor.uid,
    "verifiedAt": now,
    "verificationNotes": notes ?? null,
    "updatedAt": now,
    ...(rolePatch ?? {}),
    ...(application?.providerType ? { providerType: application.providerType } : {}),
  });

  // Approval also makes them bookable immediately: default Mon-Fri 09:00-17:00 hours if
  // they have none yet (never overwrites hours already set — e.g. a re-approval, or hours
  // saved between application and decision). availabilityUpdatedAt is deliberately not
  // stamped, so the dashboard still nudges the provider to review the default.
  const instructorPatch: Record<string, unknown> = {
    "applicationStatus": decision,
    // Nested map, never the dotted path — see instructorVerificationPatch. This patch is
    // applied with set(..., { merge: true }) below, which does not resolve dotted keys.
    ...instructorVerificationPatch(verified),
    "updatedAt": now,
  };

  const locale = (user.preferredLanguage as string) ?? "it";
  // Validate through the draft builder: it keeps only known taxonomy leaves, so an applicant
  // cannot store a group id or an invented one as something they offer.
  const requestedLeaves = application ?
    draftServicesForCategories(application.requestedCategoryIds ?? [], locale).map(
      (d) => d.data.categoryId
    ) :
    ((instructor.requestedCategoryIds as string[] | undefined) ?? []);

  // Only the fields a decision owns are written; `business` (a company's legal name, P.IVA,
  // display details — see applyAsProvider) is deliberately never spread, reset or touched
  // here, and the merge below leaves it exactly as the application stored it. Likewise
  // name/fullName are only set from a *present* application name: for a company they hold
  // the display name, and a null application name must not blank them.
  if (application) {
    instructorPatch.requestedCategoryIds = requestedLeaves;
    if (application.fullName) {
      instructorPatch.name = application.fullName;
      instructorPatch.fullName = application.fullName;
    }
    if (application.providerType) {
      instructorPatch.providerType = application.providerType;
    }
  }

  if (!instructorSnap.exists) {
    // A provider created from the admin panel (or one predating the catalogue) has no
    // instructors document at all, and that document is what makes them bookable and
    // searchable. Deciding used to be impossible for them through the callable and a
    // no-op through the admin panel's own write — so create the entry here rather than
    // refusing a decision the admin is entitled to make.
    instructorPatch.uid = providerId;
    instructorPatch.fullName = application?.fullName ?? user.fullName ?? null;
    instructorPatch.isActive = true;
    instructorPatch.createdAt = now;
  }
  if (verified && needsDefaultHours(instructor)) {
    instructorPatch.availabilitySchedule = DEFAULT_WEEKLY_HOURS;
  }

  // A verified business with premises gets its venue in this same batch. The link goes in
  // as a NESTED map: merge deep-merges it, so legalName/vatNumber/etc. survive, whereas a
  // dotted "business.venueId" key would be stored literally by set(..., { merge: true }).
  // buildBusinessVenue returns null once business.venueId exists, which is what keeps a
  // re-run of the decision from creating a second venue.
  let venueId: string | null = null;
  if (verified) {
    const venue = buildBusinessVenue({ providerId, instructor, now });
    if (venue) {
      const venueRef = db.collection("venues").doc();
      batch.set(venueRef, venue);
      instructorPatch.business = { venueId: venueRef.id };
      venueId = venueRef.id;
    }
  }
  batch.set(instructorRef, instructorPatch, { merge: true });

  let seeded = 0;
  if (verified) {
    // Never on top of existing services: a decision can be re-run after a rejection, and a
    // second run must not resurrect drafts the provider deliberately deleted.
    const existing = await instructorRef.collection("services").limit(1).get();
    if (existing.empty) {
      const drafts = draftServicesForCategories(requestedLeaves, locale);
      for (const draft of drafts) {
        batch.set(instructorRef.collection("services").doc(draft.id), draft.data);
      }
      seeded = drafts.length;
    }
  }

  batch.set(auditLogDoc(), auditLogData({
    actorUid: actor.uid,
    actorEmail: actor.email,
    actorRole: toActorRole(actor.role),
    action: verified ? "verify" : "update",
    entityType: "provider",
    entityId: providerId,
    before: { providerStatus: user.providerStatus ?? null, role: user.role ?? null },
    after: {
      providerStatus: decision,
      role: rolePatch?.role ?? user.role ?? null,
      draftServicesSeeded: seeded,
      ...(venueId ? { venueId } : {}),
    },
    ...(notes ? { reason: notes } : {}),
  }));

  await batch.commit();

  return { draftServicesSeeded: seeded, venueId };
}
