import { HttpsError } from "firebase-functions/v2/https";

/** Reject booking a trainer service when the signed-in customer owns that instructor profile. */
export function assertCustomerIsNotInstructor(userId: string, instructorId?: string): void {
  if (instructorId && userId === instructorId) {
    throw new HttpsError("failed-precondition", "cannot_book_yourself");
  }
}

export function assertIndividualService(service: { kind?: string; courseId?: string }): void {
  if (service.kind === "group" || service.courseId) {
    throw new HttpsError("failed-precondition", "use_course_enrollment");
  }
}
