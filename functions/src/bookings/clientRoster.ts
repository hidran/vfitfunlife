import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue, type Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

import { region } from "../lib/runtimeOptions";
import {
  planRosterSync,
  rosterPairsForWrite,
  type RosterBooking,
  type RosterPair,
  type RosterWrite,
  type UserProfileLike,
} from "./clientRosterCore";

/**
 * Recomputes and writes one pair's roster doc inside a transaction.
 *
 * The transaction reads the pair's bookings and its `clients` doc(s), so two triggers for
 * the same pair (e.g. a status change landing while another booking's event is still in
 * flight) serialize: whichever commits last has read the latest bookings. The write is
 * derived purely from what was read, so a retry or replay produces the same document.
 */
export async function syncClientRoster(db: Firestore, pair: RosterPair): Promise<RosterWrite | null> {
  return db.runTransaction(async (tx) => {
    const plan = await planRosterSync(
      {
        findClientDocs: async () => {
          const snap = await tx.get(
            db.collection("clients")
              .where("providerId", "==", pair.instructorId)
              .where("userId", "==", pair.userId),
          );
          return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
        },
        getBookings: async () => {
          const snap = await tx.get(
            db.collection("bookings")
              .where("instructorId", "==", pair.instructorId)
              .where("userId", "==", pair.userId),
          );
          return snap.docs.map((d) => d.data() as RosterBooking);
        },
        getUserProfile: async () => {
          const snap = await tx.get(db.collection("users").doc(pair.userId));
          return snap.exists ? (snap.data() as UserProfileLike) : null;
        },
      },
      pair,
    );
    if (!plan) return null;

    const ref = db.collection("clients").doc(plan.id);
    if (plan.kind === "create") {
      const now = FieldValue.serverTimestamp();
      tx.create(ref, { ...plan.data, createdAt: now, updatedAt: now });
    } else {
      tx.update(ref, { ...plan.data, updatedAt: FieldValue.serverTimestamp() });
    }
    return plan;
  });
}

/**
 * B1 — keeps the trainer's client roster (`clients`, shown on /provider/clients) in sync
 * with bookings, whoever wrote them: createBooking, the transition callables, scheduled
 * auto-confirm, admin edits, seeds, migrations.
 *
 * Writes only to `clients`, which has no triggers — no loop, no side effects.
 * Spec: docs/plans/2026-09-29-communication-booking-plan.md (B1); id scheme in
 * ./clientRosterCore.ts.
 */
export const syncClientRosterOnBookingWrite = onDocumentWritten(
  { region, document: "bookings/{bookingId}" },
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : undefined;
    const after = event.data?.after?.exists ? event.data.after.data() : undefined;
    const pairs = rosterPairsForWrite(before, after);
    if (pairs.length === 0) return;

    const db = getFirestore();
    for (const pair of pairs) {
      const result = await syncClientRoster(db, pair);
      if (result) {
        logger.info("client roster synced", {
          bookingId: event.params.bookingId,
          clientId: result.id,
          kind: result.kind,
          fields: Object.keys(result.data),
        });
      }
    }
  },
);
