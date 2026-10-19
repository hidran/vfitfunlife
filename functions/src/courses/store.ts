import { getFirestore, Timestamp, FieldValue, Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { ZodError } from "zod";
import type { CourseInput } from "./core";
export const db = getFirestore();
export interface Course extends CourseInput {
  providerEligible: boolean; providerId: string; providerName: string; serviceId: string; sessionIds: string[];
  nextSessionId: string; nextAvailableSeats: number;
  firstStartsAt: Timestamp; nextStartsAt: Timestamp; categoryIds: string[];
}
export interface Session {
  startsAt: Timestamp; endsAt: Timestamp; capacity: number; occupied: number; held: number;
  state: "scheduled" | "cancelled" | "completed"; location: string; instructor: string;
}
export interface Enrollment {
  userId: string; providerId: string; courseId: string; courseName: string; customerName: string;
  sessionIds: string[]; activeSessionIds: string[]; cancelledSessionIds: string[];
  timezone: string;
  scope: "lesson" | "series"; totalCents: number; allocations: Record<string, number>;
  cancellationHours: number; paymentMode: "direct" | "stripe";
  state: "held" | "confirmed" | "cancelled" | "expired";
  paymentStatus: "pending" | "paid"; holdExpiresAt: Timestamp;
  providerAmountOwedCents?: number; checkoutExpiresAt?: Timestamp;
  checkoutSettled?: boolean;
  checkoutSessionId?: string; checkoutUrl?: string; stripePaymentIntentId?: string;
  refundCents: number; createdAt: Timestamp;
}
export const nowStamp = () => FieldValue.serverTimestamp();
export function safeId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
    throw new HttpsError("invalid-argument", "invalid_id");
  }
  return value;
}
export function uidOf(auth: { uid: string } | undefined): string {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required");
  return auth.uid;
}
export async function assertManager(uid: string, providerId: string, tx?: Transaction): Promise<void> {
  const ref = db.doc(`users/${uid}`);
  const user = (await (tx ? tx.get(ref) : ref.get())).data();
  if (!user || user.isActive === false || user.accountStatus === "suspended" || user.accountStatus === "deleted") {
    throw new HttpsError("permission-denied", "account_inactive");
  }
  if (uid === providerId || ["admin", "superadmin"].includes(user.role)) return;
  throw new HttpsError("permission-denied", "course_owner_required");
}
export async function eligibleProvider(providerId: string, tx: Transaction): Promise<Record<string, unknown>> {
  const doc = await tx.get(db.doc(`instructors/${providerId}`));
  const provider = doc.data();
  if (!provider || provider.isActive === false || provider.providerProfile?.isVerified !== true ||
    ["pending", "rejected", "suspended"].includes(provider.applicationStatus)) {
    throw new HttpsError("failed-precondition", "provider_unavailable");
  }
  return provider;
}
export function domainError(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof ZodError) {
    throw new HttpsError("invalid-argument", "course_validation_failed", {
      fields: [...new Set(error.issues.map((issue) => String(issue.path[0])))],
    });
  }
  const message = error instanceof Error ? error.message : "course_operation_failed";
  const fields: Record<string, string[]> = {
    pricing_required: ["lessonPriceCents", "seriesPriceCents"],
    end_date_required: ["startDate", "endDate"], weekdays_required: ["weekdays"],
    invalid_timezone: ["timezone"], invalid_date: ["startDate", "endDate"],
    invalid_local_time: ["startDate", "startTime", "timezone"],
    ambiguous_local_time: ["startDate", "startTime", "timezone"],
    schedule_too_long: ["startDate", "endDate"],
    empty_schedule: ["startDate", "endDate", "weekdays"],
  };
  throw new HttpsError("failed-precondition", message, fields[message] ? { fields: fields[message] } : undefined);
}
