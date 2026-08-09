/**
 * Trainer recruitment leads from the public /diventa-trainer page.
 *
 * This is the only unauthenticated write path in the codebase, so it is a callable rather
 * than a Firestore rule: a world-writable collection would let anyone insert arbitrary
 * documents at any volume. Here the shape is validated, the volume is capped per IP, and
 * `trainer_leads` stays entirely closed to clients.
 *
 * Spec: docs/superpowers/specs/2026-08-09-trainer-landing-design.md
 */

import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();
const region = process.env.FIREBASE_REGION || "europe-west1";

const MAX_PER_IP_PER_DAY = 5;
const FIELD_MAX = 120;
const NOTES_MAX = 500;

export interface TrainerLeadRequest {
  fullName: string;
  email?: string;
  phone?: string;
  specialty: string;
  zone: string;
  notes?: string;
}

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // Drop control characters and collapse whitespace — these land in an admin list and,
  // later, in emails. Filtered by code point rather than a regex range, which eslint
  // rightly flags (no-control-regex).
  return Array.from(value)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code > 31 && code !== 127;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

function looksLikePhone(v: string): boolean {
  const digits = v.replace(/[^\d]/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

export const submitTrainerLead = onCall<TrainerLeadRequest>(
  { region, cors: true },
  async (request: CallableRequest<TrainerLeadRequest>) => {
    // Deliberately NOT requiring auth: the whole point is that a trainer who has never
    // heard of the app can leave their details.
    const data = request.data ?? ({} as TrainerLeadRequest);

    const fullName = clean(data.fullName, FIELD_MAX);
    const email = clean(data.email, FIELD_MAX).toLowerCase();
    const phone = clean(data.phone, FIELD_MAX);
    const specialty = clean(data.specialty, FIELD_MAX);
    const zone = clean(data.zone, FIELD_MAX);
    const notes = clean(data.notes, NOTES_MAX);

    if (fullName.length < 2) {
      throw new HttpsError("invalid-argument", "missing-name");
    }
    // One contact route is enough — demanding both loses leads for no gain.
    if (!email && !phone) {
      throw new HttpsError("invalid-argument", "missing-contact");
    }
    if (email && !looksLikeEmail(email)) {
      throw new HttpsError("invalid-argument", "invalid-email");
    }
    if (phone && !looksLikePhone(phone)) {
      throw new HttpsError("invalid-argument", "invalid-phone");
    }
    if (!specialty) {
      throw new HttpsError("invalid-argument", "missing-specialty");
    }

    // Coarse per-IP cap. Not a real anti-abuse system — App Check would be — but enough to
    // stop a trivial script filling the admin list with noise.
    const ip = String(
      request.rawRequest?.headers["x-forwarded-for"] ??
      request.rawRequest?.socket?.remoteAddress ??
      "unknown",
    ).split(",")[0].trim();

    const dayKey = new Date().toISOString().slice(0, 10);
    const throttleRef = db.collection("lead_throttle").doc(`${dayKey}_${ip}`);

    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(throttleRef);
        const count = (snap.data()?.count as number | undefined) ?? 0;
        if (count >= MAX_PER_IP_PER_DAY) {
          throw new HttpsError("resource-exhausted", "too-many-submissions");
        }
        tx.set(
          throttleRef,
          { count: count + 1, ip, dayKey, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true },
        );
      });
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      // A throttle failure must not lose a real lead.
      logger.warn("[leads] throttle check failed, allowing through", { err });
    }

    const ref = await db.collection("trainer_leads").add({
      fullName,
      email: email || null,
      phone: phone || null,
      specialty,
      zone: zone || null,
      notes: notes || null,
      status: "new",
      source: "diventa-trainer",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Tell every admin. A lead nobody sees is a lead lost, and the pilot needs 20 trainers.
    try {
      const admins = await db.collection("users")
        .where("role", "in", ["admin", "superadmin"])
        .get();
      const batch = db.batch();
      for (const a of admins.docs) {
        batch.set(db.collection("users").doc(a.id).collection("notifications").doc(), {
          title: "Nuovo trainer interessato",
          body: `${fullName} — ${specialty}${zone ? ` (${zone})` : ""}`,
          type: "trainer_lead",
          data: { leadId: ref.id },
          imageUrl: null,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    } catch (err) {
      // Never fail the submission because the notification failed — the lead is stored.
      logger.warn("[leads] admin notification failed", { leadId: ref.id, err });
    }

    logger.info("[leads] trainer lead captured", { leadId: ref.id, specialty });
    return { success: true, leadId: ref.id };
  }
);
