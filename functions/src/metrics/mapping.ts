/**
 * Firestore document -> metrics input mapping.
 *
 * Pure (no `admin.firestore()` at import), so both the full-scan loader and the bounded
 * nightly loader share one mapping and the equivalence test can exercise it directly.
 */

import { Timestamp } from "firebase-admin/firestore";
import type { MetricsBooking, MetricsUser } from "./types";
import type { BookingStatus, StatusActorRole } from "../bookings/types";
import { isDemoAccount, isDemoBooking } from "../lib/demo";

const DEMO_EMAIL_DOMAIN = "@demo.vfit";

/**
 * Mirrors `hiddenAccountKind`/`isHiddenAccount` in src/lib/firebase/admin.ts: soft-deleted
 * and seeded demo accounts (provider_* and customer_* ids, or an @demo.vfit email) must not
 * inflate trainer or client counts on a dashboard partners read. Plus the D5 demo accounts
 * (`isDemo`, @vitfitdemo.dev, demo-* ids — see lib/demo.ts).
 */
export function isHidden(id: string, data: FirebaseFirestore.DocumentData): boolean {
  if (data.isDeleted === true || data.deletedAt) return true;
  if (isDemoAccount(id, data)) return true;
  const email = typeof data.email === "string" ? data.email.toLowerCase() : "";
  if (email.endsWith(DEMO_EMAIL_DOMAIN)) return true;
  if (id.startsWith("provider_") || id.startsWith("customer_")) return true;
  return false;
}

export function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return null;
}

export function toMetricsBooking(id: string, b: FirebaseFirestore.DocumentData): MetricsBooking {
  let history = Array.isArray(b.statusHistory) ? b.statusHistory : [];

  // The P0-1 migration gave each pre-migration booking a single synthetic entry dated
  // `updatedAt`, so backfilled history would collapse into one spike on the migration
  // date with no requested/accepted events at all. The legacy timestamp columns are
  // still on the document, so reconstruct an approximate timeline from them.
  const isMigrationOnly =
    history.length > 0 &&
    history.every((h: Record<string, unknown>) => h.actorUid === "migration");

  if (isMigrationOnly) {
    const terminal = history[0] as Record<string, unknown>;
    const rebuilt: Array<Record<string, unknown>> = [];
    const push = (status: string, at: unknown, actorRole: string) => {
      if (at) rebuilt.push({ status, actorUid: "migration", actorRole, at });
    };
    push("requested", b.createdAt, "client");
    push("accepted", b.confirmedAt, "system");
    push("completed", b.completedAt, "system");
    const covered = new Set(rebuilt.map((h) => h.status));
    if (!covered.has(String(terminal.status))) rebuilt.push(terminal);
    if (rebuilt.length) history = rebuilt;
  }
  return {
    id,
    userId: b.userId,
    instructorId: b.instructorId ?? b.providerId ?? null,
    instructorName: b.instructorName ?? null,
    status: b.status as BookingStatus,
    statusHistory: history
      .map((h: Record<string, unknown>) => ({
        status: h.status as BookingStatus,
        actorUid: String(h.actorUid ?? ""),
        actorRole: (h.actorRole ?? "system") as StatusActorRole,
        at: toDate(h.at),
      }))
      // Entries without a usable timestamp cannot be attributed to a day; dropping them
      // is better than bucketing them into the epoch.
      .filter(
        (h: { at: Date | null }): h is {
          status: BookingStatus; actorUid: string; actorRole: StatusActorRole; at: Date;
        } => h.at !== null,
      ),
    finalPrice: typeof b.finalPrice === "number" ? b.finalPrice : undefined,
    lateCancellation: b.lateCancellation === true,
    isDemo: isDemoBooking(id, b),
    paymentConfirmation: b.paymentConfirmation ?
      {
        amount: Number(b.paymentConfirmation.amount ?? 0),
        clientResponse: b.paymentConfirmation.clientResponse ?? null,
        clientRespondedAt: toDate(b.paymentConfirmation.clientRespondedAt),
      } :
      null,
  };
}

export function toMetricsUser(id: string, u: FirebaseFirestore.DocumentData): MetricsUser {
  return {
    uid: id,
    role: String(u.role ?? "customer"),
    createdAt: toDate(u.createdAt),
    fullName: u.fullName,
    hidden: isHidden(id, u),
  };
}
