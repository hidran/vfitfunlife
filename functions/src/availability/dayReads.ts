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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * [start, end) to read a provider-day's bookings from: from 24h before `date` begins (a
 * booking that starts the previous Rome calendar day can still run past midnight and block a
 * slot today — windows cannot cross midnight, so 24h is always enough margin) up to the start
 * of the next day. `busyFrom`/`bookingsStartingOn` in dayContext.ts then split this wider read
 * into "blocks a slot" versus "counts toward today's cap".
 */
export function bookingReadWindow(date: string): { start: Date; end: Date } {
  const { start, end } = romeDayBounds(date);
  return { start: new Date(start.getTime() - DAY_MS), end };
}

/**
 * The documents one provider-day needs: the instructor (weekly hours, booking rules), that
 * date's override and the bookings that could affect that day (every status — dayContextFrom
 * keeps the active ones, so no status index is needed; every start from 24h before the day to
 * its end, so a booking spilling over from the previous day is not missed). Each booking
 * carries its own document id, so a caller moving one booking can tell it apart from the rest
 * and leave it out. Pass `tx` to read inside a transaction; that also reads the provider-day lock.
 */
export async function readDayDocs(
  db: Firestore,
  instructorId: string,
  date: string,
  tx?: Transaction,
): Promise<DayDocs> {
  const instructorRef = db.collection("instructors").doc(instructorId);
  const overrideRef = instructorRef.collection("availability").doc(date);
  const { start, end } = bookingReadWindow(date);
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
    // `id` last, not first: seeded bookings also store an `id` *field*, and if that ever
    // drifted from the document id an exclusion would silently skip the wrong booking.
    bookings: bookings.docs.map((d) => ({ ...d.data(), id: d.id })),
  };
}
