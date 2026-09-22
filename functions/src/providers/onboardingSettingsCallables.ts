import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "../utils/roles";
import { writeAuditLog, toActorRole } from "../lib/audit";
import {
  PROVIDER_ONBOARDING_DOC,
  ProviderOnboardingSettings,
  ProviderOnboardingValidationError,
  mergeProviderOnboarding,
  validateProviderOnboardingUpdate,
} from "./onboardingSettings";

const region = process.env.FIREBASE_REGION || "europe-west1";

async function readSettings(): Promise<ProviderOnboardingSettings> {
  const snap = await getFirestore().doc(PROVIDER_ONBOARDING_DOC).get();
  return mergeProviderOnboarding(snap.data() as Partial<ProviderOnboardingSettings> | undefined);
}

/** The current provider-onboarding settings, for the admin panel's toggle. */
export const getProviderOnboardingSettings = onCall({ region }, async (req) => {
  const callerUid = req.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required");
  try {
    await requireAdmin(callerUid);
  } catch {
    throw new HttpsError("permission-denied", "Admin required");
  }
  return await readSettings();
});

/**
 * Turn auto-approval on or off.
 *
 * Admin-level, matching who owns provider verification now: an admin can already verify or
 * un-verify any single provider, so withholding the switch that decides whether they have to
 * would buy nothing but clicks.
 *
 * Audited, because this is the setting that decides whether strangers can list themselves in
 * the marketplace — the one change here worth being able to attribute later.
 */
export const setProviderOnboardingSettings = onCall<Partial<ProviderOnboardingSettings>>(
  { region },
  async (req) => {
    const callerUid = req.auth?.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required");
    try {
      await requireAdmin(callerUid);
    } catch {
      throw new HttpsError("permission-denied", "Admin required");
    }

    let updates: ProviderOnboardingSettings;
    try {
      updates = validateProviderOnboardingUpdate(req.data);
    } catch (e) {
      if (e instanceof ProviderOnboardingValidationError) {
        throw new HttpsError("invalid-argument", e.message);
      }
      throw e;
    }

    const before = await readSettings();
    const db = getFirestore();
    await db.doc(PROVIDER_ONBOARDING_DOC).set(
      { ...updates, updatedAt: FieldValue.serverTimestamp(), updatedBy: callerUid },
      { merge: true }
    );

    const caller = (await db.collection("users").doc(callerUid).get()).data() ?? {};
    await writeAuditLog({
      actorUid: callerUid,
      actorEmail: (caller.email as string) ?? req.auth?.token?.email ?? "",
      actorRole: toActorRole(caller.role),
      action: "update",
      entityType: "feature_flag",
      entityId: "providerOnboarding.autoApprove",
      before: { autoApprove: before.autoApprove },
      after: { autoApprove: updates.autoApprove },
    });

    return { success: true, ...updates };
  },
);
