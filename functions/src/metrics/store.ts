/**
 * Firestore adapter for the metrics layer: loads the raw inputs, writes the daily docs.
 * Kept separate from ./compute so the metric definitions stay pure and testable.
 */

import * as admin from "firebase-admin";
import { computeMetricsForDay, dateKeyInZone } from "./compute";
import type { MetricsBooking, MetricsDaily, MetricsUser } from "./types";
import type { BookingStatus, StatusActorRole } from "../bookings/types";

const db = admin.firestore();
export const METRICS_COLLECTION = "metrics_daily";
export const TIME_ZONE = "Europe/Rome";

const DEMO_EMAIL_DOMAIN = "@demo.vfit";

/**
 * Mirrors `isHiddenAccount` in src/lib/firebase/admin.ts: soft-deleted and seeded demo
 * accounts must not inflate trainer or client counts on a dashboard partners read.
 */
function isHidden(id: string, data: FirebaseFirestore.DocumentData): boolean {
  if (data.isDeleted === true || data.deletedAt) return true;
  const email = typeof data.email === "string" ? data.email.toLowerCase() : "";
  if (email.endsWith(DEMO_EMAIL_DOMAIN)) return true;
  if (id.startsWith("provider_")) return true;
  return false;
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof admin.firestore.Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return null;
}

/** Loads every booking and user once. At pilot scale this is a few hundred documents;
 *  past a few thousand it should page or read from an incremental aggregate. */
export async function loadInputs(): Promise<{ bookings: MetricsBooking[]; users: MetricsUser[] }> {
  const [bookingSnap, userSnap] = await Promise.all([
    db.collection("bookings").get(),
    db.collection("users").get(),
  ]);

  const bookings: MetricsBooking[] = bookingSnap.docs.map((d) => {
    const b = d.data();
    const history = Array.isArray(b.statusHistory) ? b.statusHistory : [];
    return {
      id: d.id,
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
      paymentConfirmation: b.paymentConfirmation ?
        {
          amount: Number(b.paymentConfirmation.amount ?? 0),
          clientResponse: b.paymentConfirmation.clientResponse ?? null,
        } :
        null,
    };
  });

  const users: MetricsUser[] = userSnap.docs.map((d) => {
    const u = d.data();
    return {
      uid: d.id,
      role: String(u.role ?? "customer"),
      createdAt: toDate(u.createdAt),
      fullName: u.fullName,
      hidden: isHidden(d.id, u),
    };
  });

  return { bookings, users };
}

/** End of the given local day, as the "as of" instant for rolling values. */
export function endOfLocalDay(dateKey: string): Date {
  // The offset is derived rather than assumed so this stays correct across DST.
  const noonUtc = new Date(`${dateKey}T12:00:00Z`);
  const localKey = dateKeyInZone(noonUtc, TIME_ZONE);
  const shiftDays = localKey === dateKey ? 0 : localKey < dateKey ? 1 : -1;
  const base = new Date(noonUtc.getTime() + shiftDays * 86400000);
  const asString = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, hour: "2-digit", hour12: false,
  }).format(base);
  const localHour = Number(asString);
  // 12:00 local == (12 - localHour) hours from base; end of day is 23:59:59.999 local.
  return new Date(base.getTime() + ((23 - localHour) * 3600 + 3599) * 1000 + 999);
}

export function toFirestoreDoc(m: MetricsDaily, backfilled: boolean) {
  const byTrainer: Record<string, unknown> = {};
  for (const [uid, t] of Object.entries(m.byTrainer)) {
    byTrainer[uid] = {
      ...t,
      lastAcceptedAt: t.lastAcceptedAt ?
        admin.firestore.Timestamp.fromDate(t.lastAcceptedAt) :
        null,
    };
  }
  return {
    ...m,
    byTrainer,
    date: admin.firestore.Timestamp.fromDate(new Date(`${m.dateKey}T00:00:00Z`)),
    computedAt: admin.firestore.FieldValue.serverTimestamp(),
    backfilled,
  };
}

/** Computes and writes one day. Idempotent: the document is overwritten wholesale. */
export async function writeMetricsForDay(opts: {
  dateKey: string;
  bookings: MetricsBooking[];
  users: MetricsUser[];
  backfilled: boolean;
  dryRun?: boolean;
}): Promise<MetricsDaily> {
  const metrics = computeMetricsForDay({
    dateKey: opts.dateKey,
    asOf: endOfLocalDay(opts.dateKey),
    bookings: opts.bookings,
    users: opts.users,
    timeZone: TIME_ZONE,
  });

  if (!opts.dryRun) {
    await db.collection(METRICS_COLLECTION).doc(opts.dateKey)
      .set(toFirestoreDoc(metrics, opts.backfilled));
  }
  return metrics;
}
