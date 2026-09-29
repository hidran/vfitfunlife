/**
 * Longest note a client can leave the trainer when booking. Mirrors USER_NOTES_MAX_LENGTH in
 * functions/src/bookings/userNotes.ts and the `userNotes` cap in firestore.rules.
 */
export const BOOKING_NOTE_MAX_LENGTH = 500;
