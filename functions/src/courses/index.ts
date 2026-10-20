import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { region } from "../lib/runtimeOptions";
import { validateCourse, generateSessions } from "./core";
import { db, safeId, uidOf, eligibleProvider, nowStamp, domainError, Course, Session } from "./store";
import { canManageCourse, managesVenue } from "./authority";
import { hostsCourses, type VenueType } from "../types";

export const saveCourse = onCall({ region }, async (req) => {
  const uid = uidOf(req.auth);
  const requestedProvider = req.data.providerId ? safeId(req.data.providerId) : null;
  const id = req.data.courseId ? safeId(req.data.courseId) : db.collection("courses").doc().id;
  const ref = db.doc(`courses/${id}`);
  try {
    const input = validateCourse(req.data.course);
    const generated = generateSessions(input);
    await db.runTransaction(async (tx) => {
      const old = (await tx.get(ref)).data() as Course | undefined;
      const caller = old ? undefined : (await tx.get(db.doc(`users/${uid}`))).data();
      const isAdmin = ["admin", "superadmin"].includes(caller?.role);
      if (old) await canManageCourse(uid, old, tx);
      else if (!caller || caller.isActive === false || ["suspended", "deleted"].includes(caller.accountStatus)) {
        throw new HttpsError("permission-denied", "account_inactive");
      }
      let venue: FirebaseFirestore.DocumentData | undefined;
      if (input.venueId) {
        safeId(input.venueId);
        venue = (await tx.get(db.doc(`venues/${input.venueId}`))).data();
        // An existing link is not re-validated, so a venue whose type later changes does not trap its courses.
        if (!old || (old.venueId ?? null) !== input.venueId) {
          if (!venue || !hostsCourses(venue.type as VenueType) || !(await managesVenue(uid, input.venueId, tx))) {
            throw new HttpsError("permission-denied", "venue_authorization_required");
          }
        }
      }
      // On edit the stored provider stays and the client value is ignored. Staff of a venue create on the
      // business's behalf: the owner stays the provider and payee.
      const providerId = old ? old.providerId : input.venueId ?
        (isAdmin && requestedProvider ? requestedProvider : venue?.ownerId) : requestedProvider ?? uid;
      if (!providerId) throw new HttpsError("permission-denied", "venue_owner_required");
      if (!old && !input.venueId) await canManageCourse(uid, { providerId, venueId: null }, tx);
      const provider = await eligibleProvider(providerId, tx);
      const category = (await tx.get(db.doc(`serviceCategories/${safeId(input.categoryId)}`))).data();
      if (!category?.isActive || !category.parentId) throw new HttpsError("invalid-argument", "active_leaf_required");
      if (input.venueId && input.state === "published" &&
        (venue?.isActive === false || venue?.partnerStatus !== "active")) {
        throw new HttpsError("failed-precondition", "venue_not_active");
      }
      if (input.state === "published" && generated[0].startsAt <= new Date() && (!old || old.state !== "published")) {
        throw new HttpsError("invalid-argument", "start_must_be_future");
      }
      const existing = await tx.get(ref.collection("sessions"));
      const historical = await tx.get(db.collection("courseEnrollments").where("courseId", "==", id).limit(1));
      const hasBookings = !historical.empty || existing.docs.some((d) =>
        (d.data().occupied ?? 0) + (d.data().held ?? 0) > 0);
      if (hasBookings && old) {
        const frozen = ["startDate", "startTime", "endDate", "recurrence", "interval", "weekdays", "timezone",
          "durationMinutes", "lessonPriceCents", "seriesPriceCents", "location", "instructor"] as const;
        if (frozen.some((key) => JSON.stringify(old[key]) !== JSON.stringify(input[key]))) {
          throw new HttpsError("failed-precondition", "booked_schedule_locked");
        }
      }
      if (existing.docs.some((d) => d.data().occupied + d.data().held > input.capacity)) {
        throw new HttpsError("failed-precondition", "capacity_below_bookings");
      }
      const serviceId = old?.serviceId ?? `course_${id}`;
      const actual = generated.map((s) => {
        const prior = existing.docs.find((d) => d.id === s.id)?.data() as Session | undefined;
        return prior && hasBookings ? { ...s, startsAt: prior.startsAt.toDate(), state: prior.state } :
          { ...s, state: "scheduled" };
      }).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      const next = actual.find((s) => s.startsAt > new Date() && s.state === "scheduled") ?? actual[actual.length - 1];
      tx.set(ref, { ...input, providerEligible: true, providerId,
        providerName: provider.fullName ?? provider.name ?? input.instructor,
        serviceId, sessionIds: generated.map((s) => s.id), categoryIds: [input.categoryId, category.parentId],
        nextSessionId: next.id, nextAvailableSeats: input.capacity -
          (existing.docs.find((d) => d.id === next.id)?.data().occupied ?? 0) -
          (existing.docs.find((d) => d.id === next.id)?.data().held ?? 0),
        firstStartsAt: Timestamp.fromDate(actual[0].startsAt), nextStartsAt: Timestamp.fromDate(next.startsAt),
        updatedAt: nowStamp(), ...(!old ? { createdAt: nowStamp() } : {}) });
      const newIds = new Set(generated.map((s) => s.id));
      for (const doc of existing.docs) if (!newIds.has(doc.id)) tx.delete(doc.ref);
      for (const session of generated) {
        const previous = existing.docs.find((d) => d.id === session.id)?.data() as Session | undefined;
        tx.set(ref.collection("sessions").doc(session.id), {
          startsAt: previous && hasBookings ? previous.startsAt : Timestamp.fromDate(session.startsAt),
          endsAt: previous && hasBookings ? previous.endsAt : Timestamp.fromDate(session.endsAt),
          capacity: input.capacity, occupied: previous?.occupied ?? 0, held: previous?.held ?? 0,
          state: previous?.state ?? "scheduled", location: previous?.location ?? input.location,
          instructor: previous?.instructor ?? input.instructor,
        });
      }
      tx.set(db.doc(`instructors/${providerId}/services/${serviceId}`), {
        name: input.name, description: input.description, categoryId: input.categoryId,
        price: (input.lessonPriceCents ?? input.seriesPriceCents ?? 0) / 100,
        durationMinutes: input.durationMinutes, isActive: input.state === "published",
        kind: "group", courseId: id,
      }, { merge: true });
    });
    return { courseId: id };
  } catch (error) {
    return domainError(error);
  }
});

export * from "./enrollment";
export * from "./operations";
export * from "./checkout";
export * from "./maintenance";

export const previewCourse = onCall({ region }, async (req) => {
  uidOf(req.auth);
  try {
    const input = validateCourse(req.data.course);
    return { sessions: generateSessions(input).map((s) => ({ id: s.id,
      startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() })) };
  } catch (error) {
    return domainError(error);
  }
});
export * from "./providerEligibility";
export * from "./notifications";
export * from "./participantInvitations";
