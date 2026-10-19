import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { requireAdmin } from "../utils/roles";
import { auditLogData, auditLogDoc, toActorRole } from "../lib/audit";
import { region } from "../lib/runtimeOptions";
import { releaseClaim } from "./businessVatClaim";
import type { BusinessDetails } from "../types";

interface ReleaseBusinessVatData {
  providerId: string;
  reason?: string;
}

export interface ReleaseBusinessVatResult {
  success: true;
  providerId: string;
  vatNumber: string;
  /** False when the claim was already gone, or held by a different uid (left untouched). */
  released: boolean;
}

const REASON_MAX = 500;

/**
 * Admin (or superadmin): free a company's P.IVA uniqueness claim.
 *
 * The escape hatch for a squatted or abandoned number (see queueBusinessApplication): a
 * rejected company keeps its claim, so without this nobody else could ever register that
 * P.IVA. Only `businessVat/{vat}` goes; `instructors/{providerId}.business.vatNumber` stays,
 * because the back office may still need to see what the company declared.
 *
 * Idempotent: a claim that is already absent, or held by another uid, is reported as
 * `released: false` with no write. The audit entry is written in the same transaction as
 * the delete, and only when something was actually released — a no-op is not a mutation.
 */
export const releaseBusinessVat = onCall<ReleaseBusinessVatData, Promise<ReleaseBusinessVatResult>>(
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

    const { providerId, reason } = req.data ?? ({} as ReleaseBusinessVatData);
    if (typeof providerId !== "string" || !providerId) {
      throw new HttpsError("invalid-argument", "providerId is required");
    }
    const trimmedReason = typeof reason === "string" ? reason.trim().slice(0, REASON_MAX) : "";

    const db = getFirestore();
    const caller = (await db.collection("users").doc(callerUid).get()).data() ?? {};
    const instructorRef = db.collection("instructors").doc(providerId);

    const { vatNumber, released } = await db.runTransaction(async (tx) => {
      const instructorSnap = await tx.get(instructorRef);
      if (!instructorSnap.exists) {
        throw new HttpsError("not-found", "Provider not found");
      }
      const vat = (instructorSnap.data()?.business as Partial<BusinessDetails> | undefined)?.vatNumber;
      if (typeof vat !== "string" || !vat) {
        throw new HttpsError("failed-precondition", "business_vat_missing");
      }

      const done = await releaseClaim(tx, db, vat, providerId);
      if (done) {
        tx.set(
          auditLogDoc(),
          auditLogData({
            actorUid: callerUid,
            actorEmail: (caller.email as string) ?? req.auth?.token?.email ?? "",
            actorRole: toActorRole(caller.role),
            action: "update",
            entityType: "provider",
            entityId: providerId,
            before: { vatNumber: vat, claimed: true },
            after: { claimed: false },
            ...(trimmedReason ? { reason: trimmedReason } : {}),
          }),
        );
      }
      return { vatNumber: vat, released: done };
    });

    return { success: true, providerId, vatNumber, released };
  },
);
