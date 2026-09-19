import {
  Timestamp,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { romeDayBounds } from "./slots";
import type { DayDocs } from "./dayContext";

/**
 * Server-only lock for one provider-day. createBooking reads and writes it inside its
 * transaction, so two requests for the same provider and day run one after the other and
 * the second one sees the first one's booking.
 */
export function bookingDayRef(db: Firestore, instructorId: string, date: string): DocumentReference {
  return db.collection("instructors").doc(instructorId).collection("bookingDays").doc(date);
}

/**
 * The documents one provider-day needs: the instructor (weekly hours, booking rules), that
 * date's override and the bookings that start that day (every status — dayContextFrom keeps
 * the active ones, so no status index is needed). Pass `tx` to read inside a transaction;
 * that also reads the provider-day lock.
 */
export async function readDayDocs(
  db: Firestore,
  instructorId: string,
  date: string,
  tx?: Transaction,
): Promise<DayDocs> {
  const instructorRef = db.collection("instructors").doc(instructorId);
  const overrideRef = instructorRef.collection("availability").doc(date);
  const { start, end } = romeDayBounds(date);
  // orderBy desc matches the existing (instructorId ASC, scheduledAt DESC) composite index.
  const bookingsQuery = db.collection("bookings")
    .where("instructorId", "==", instructorId)
    .where("scheduledAt", ">=", Timestamp.fromDate(start))
    .where("scheduledAt", "<", Timestamp.fromDate(end))
    .orderBy("scheduledAt", "desc");

  const [instructor, override, bookings] = tx ?
    await Promise.all([
      tx.get(instructorRef),
      tx.get(overrideRef),
      tx.get(bookingsQuery),
      tx.get(bookingDayRef(db, instructorId, date)),
    ]) :
    await Promise.all([instructorRef.get(), overrideRef.get(), bookingsQuery.get()]);

  return {
    instructor: instructor.data(),
    override: override.data(),
    bookings: bookings.docs.map((d) => d.data()),
  };
}
