import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireSuperAdmin } from "../utils/roles";
import { writeAuditLog, toActorRole } from "../lib/audit";
import { cachedDocRead, invalidateCachedDoc } from "../lib/cachedDoc";
import {
  PAYMENT_SETTINGS_DOC,
  PaymentSettings,
  PaymentSettingsValidationError,
  mergePaymentSettings,
  subscriptionsActive,
  validatePaymentSettingsUpdate,
} from "./paymentSettings";

import { region } from "../lib/runtimeOptions";

/**
 * Cached (60s default TTL): the Stripe callables read this on every call. For up to a minute
 * after a superadmin flips a switch, an instance that already cached the old value keeps
 * answering with it — acceptable for a switch that changes at most a few times a year.
 */
export async function readPaymentSettings(): Promise<PaymentSettings> {
  const stored = await cachedDocRead<Partial<PaymentSettings>>(PAYMENT_SETTINGS_DOC);
  return mergePaymentSettings(stored);
}

/** Refuses a Stripe charge while card payments are switched off. */
export async function assertStripePaymentsEnabled(): Promise<void> {
  const settings = await readPaymentSettings();
  if (!settings.stripePaymentsEnabled) {
    throw new HttpsError("failed-precondition", "Online payments are not enabled");
  }
}

/** Refuses a subscription sale unless both payments and subscriptions are switched on. */
export async function assertSubscriptionsEnabled(): Promise<void> {
  const settings = await readPaymentSettings();
  if (!subscriptionsActive(settings)) {
    throw new HttpsError("failed-precondition", "Subscriptions are not on sale");
  }
}

/**
 * Turn Stripe payments and/or subscription selling on or off.
 *
 * Superadmin only: whether the platform takes money at all is a financial decision, like
 * refunds and commission (see docs/backend/roles-and-permissions.md). Audited.
 */
export const setPaymentSettings = onCall<Partial<PaymentSettings>>(
  { region },
  async (req) => {
    const callerUid = req.auth?.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required");
    try {
      await requireSuperAdmin(callerUid);
    } catch {
      throw new HttpsError("permission-denied", "Superadmin required");
    }

    let patch: Partial<PaymentSettings>;
    try {
      patch = validatePaymentSettingsUpdate(req.data);
    } catch (e) {
      if (e instanceof PaymentSettingsValidationError) {
        throw new HttpsError("invalid-argument", e.message);
      }
      throw e;
    }

    const db = getFirestore();
    const ref = db.doc(PAYMENT_SETTINGS_DOC);
    // Read uncached: the audit entry's "before" must be what was actually stored.
    const before = mergePaymentSettings((await ref.get()).data());
    const after: PaymentSettings = { ...before, ...patch };
    await ref.set(
      { ...after, updatedAt: FieldValue.serverTimestamp(), updatedBy: callerUid },
      { merge: true }
    );
    invalidateCachedDoc(PAYMENT_SETTINGS_DOC);

    const caller = (await db.collection("users").doc(callerUid).get()).data() ?? {};
    await writeAuditLog({
      actorUid: callerUid,
      actorEmail: (caller.email as string) ?? req.auth?.token?.email ?? "",
      actorRole: toActorRole(caller.role),
      action: "update",
      entityType: "feature_flag",
      entityId: "payments",
      before: { ...before },
      after: { ...after },
    });

    return { success: true, ...after };
  },
);
