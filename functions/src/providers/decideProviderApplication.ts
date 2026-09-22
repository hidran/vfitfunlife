import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { requireAdmin } from "../utils/roles";
import { commitProviderDecision } from "./commitDecision";

const region = process.env.FIREBASE_REGION || "europe-west1";

interface DecideProviderApplicationData {
  providerId: string;
  decision: "verified" | "rejected";
  notes?: string;
}

/**
 * Admin (or superadmin): verify or un-verify a provider.
 *
 * Since providers are approved automatically at signup (see `applyAsProvider`), this is now
 * mostly the *revoking* route — the back office reviewing who ended up listed and taking
 * someone down — rather than a queue that must be worked through before anyone can trade.
 * It is still the only way to put a rejected provider back, and it still promotes the
 * applicant to role 'provider' and seeds their draft services when verifying.
 *
 * Verification moved from superadmin to admin deliberately: running the marketplace is the
 * back office's day job, and gating it on the two superadmin accounts made every signup wait
 * on them. Granting the superadmin role itself remains superadmin-only (see setUserRole).
 */
export const decideProviderApplication = onCall<DecideProviderApplicationData>(
  { region },
  async (req) => {
    const callerUid = req.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Sign in required");
    }
    try {
      await requireAdmin(callerUid);
    } catch {
      throw new HttpsError("permission-denied", "Admin required");
    }

    const { providerId, decision, notes } = req.data ?? ({} as DecideProviderApplicationData);
    if (typeof providerId !== "string" || !providerId) {
      throw new HttpsError("invalid-argument", "providerId is required");
    }
    if (decision !== "verified" && decision !== "rejected") {
      throw new HttpsError("invalid-argument", "decision must be 'verified' or 'rejected'");
    }

    const caller = (await getFirestore().collection("users").doc(callerUid).get()).data() ?? {};

    const { draftServicesSeeded } = await commitProviderDecision({
      providerId,
      decision,
      notes,
      actor: {
        uid: callerUid,
        email: (caller.email as string) ?? req.auth?.token?.email ?? "",
        role: (caller.role as string) ?? "admin",
      },
    });

    return { success: true, providerId, decision, draftServicesSeeded };
  },
);
