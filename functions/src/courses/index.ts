import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { Timestamp } from "firebase-admin/firestore";
import { region } from "../lib/runtimeOptions";
import {
  validateCourse, generateSessions, courseRevisionBumped, sessionRevisionBumped, type CourseInput,
} from "./core";
import { db, safeId, uidOf, eligibleProvider, providerUsable, nowStamp, domainError, Course, Session } from "./store";
import { canManageCourse, managesVenue } from "./authority";
import { promoteWaitlist, clearWaitlistInTx } from "./waitlist";
import { slotsOf, lockPaths, diffSlots, updateScheduleLocks, MAX_LOCKED_SESSIONS } from "./locks";
import { hostsCourses, type VenueType } from "../types";

type Reader = (path: string) => Promise<FirebaseFirestore.DocumentData | undefined>;

/**
 * The server owns everything derived from the venue: timezone, place text, city and the instructor's name.
 * Reads go through `read` so the same checks serve the transaction in saveCourse and the advisory previewCourse.
 */
async function withSpaces(submitted: CourseInput, read: Reader): Promise<CourseInput> {
  const input = { ...submitted, locationId: null as string | null, roomId: null as string | null };
  if (input.venueId) {
    const venueId = input.venueId;
    const { locationId, roomId } = submitted;
    if (!locationId || !roomId) throw new HttpsError("invalid-argument", "invalid_space");
    const [location, room] = await Promise.all([
      read(`venues/${venueId}/locations/${safeId(locationId)}`),
      read(`venues/${venueId}/locations/${locationId}/rooms/${safeId(roomId)}`),
    ]);
    if (location?.isActive !== true || room?.isActive !== true) {
      throw new HttpsError("invalid-argument", "invalid_space");
    }
    Object.assign(input, { locationId, roomId, timezone: location.timezone || "Europe/Rome",
      location: `${room.name} · ${location.name}`, city: location.city ?? "" });
  }
  if (input.instructorId) {
    const instructorId = safeId(input.instructorId);
    const [instructor, link] = await Promise.all([
      read(`instructors/${instructorId}`),
      input.venueId ? read(`venues/${input.venueId}/instructors/${instructorId}`) : undefined,
    ]);
    if (!providerUsable(instructor) || (input.venueId && link?.isActive !== true)) {
      throw new HttpsError("invalid-argument", "invalid_instructor");
    }
    input.instructor = instructor!.fullName || instructor!.name || link?.name || input.instructor;
  }
  return input;
}

/**
 * An unlinked course is the provider's own: its instructor is the provider, unless an admin assigns someone else.
 * (Venue courses pick from the venue's instructor links instead, which withSpaces checks.)
 */
function assertInstructorAllowed(input: CourseInput, providerId: string, isAdmin: boolean): void {
  if (!input.venueId && input.instructorId && input.instructorId !== providerId && !isAdmin) {
    throw new HttpsError("permission-denied", "course_instructor_not_allowed");
  }
}

/** The place text, timezone and instructor name a linked course already carries, for edits that skip revalidation. */
function keepDerived(submitted: CourseInput, old: Course): CourseInput {
  return { ...submitted, locationId: old.locationId ?? null, roomId: old.roomId ?? null,
    ...(old.venueId ? { timezone: old.timezone, location: old.location, city: old.city } : {}),
    ...(old.instructorId ? { instructor: old.instructor } : {}) };
}

export const saveCourse = onCall({ region }, async (req) => {
  const uid = uidOf(req.auth);
  const requestedProvider = req.data.providerId ? safeId(req.data.providerId) : null;
  const id = req.data.courseId ? safeId(req.data.courseId) : db.collection("courses").doc().id;
  const ref = db.doc(`courses/${id}`);
  // Lessons whose capacity grew while customers were waiting: served after the commit, never inside it.
  let promoteSessionIds: string[] = [];
  try {
    const submitted = validateCourse(req.data.course);
    await db.runTransaction(async (tx) => {
      promoteSessionIds = [];
      const old = (await tx.get(ref)).data() as Course | undefined;
      const caller = (await tx.get(db.doc(`users/${uid}`))).data();
      const isAdmin = ["admin", "superadmin"].includes(caller?.role);
      if (old) await canManageCourse(uid, old, tx);
      else if (!caller || caller.isActive === false || ["suspended", "deleted"].includes(caller.accountStatus)) {
        throw new HttpsError("permission-denied", "account_inactive");
      }
      let venue: FirebaseFirestore.DocumentData | undefined;
      if (submitted.venueId) {
        safeId(submitted.venueId);
        venue = (await tx.get(db.doc(`venues/${submitted.venueId}`))).data();
        // An existing link is not re-validated, so a venue whose type later changes does not trap its courses.
        if (!old || (old.venueId ?? null) !== submitted.venueId) {
          if (!venue || !hostsCourses(venue.type as VenueType) || !(await managesVenue(uid, submitted.venueId, tx))) {
            throw new HttpsError("permission-denied", "venue_authorization_required");
          }
        }
      }
      // On edit the stored provider stays and the client value is ignored. Staff of a venue create on the
      // business's behalf: the owner stays the provider and payee.
      const providerId = old ? old.providerId : submitted.venueId ?
        (isAdmin && requestedProvider ? requestedProvider : venue?.ownerId) : requestedProvider ?? uid;
      if (!providerId) throw new HttpsError("permission-denied", "venue_owner_required");
      if (!old && !submitted.venueId) await canManageCourse(uid, { providerId, venueId: null }, tx);
      // Archiving or unpublishing must always work: a room, instructor link, category or provider that was switched
      // off since the last save would otherwise keep the course's lock slots held forever. Eligibility and the
      // derived fields are re-checked only for a new course, a changed id or a publish; otherwise the stored ones stay.
      const publishing = submitted.state === "published";
      const spacesChanged = !old || (["venueId", "locationId", "roomId", "instructorId"] as const).some(
        (key) => (old[key] ?? null) !== (submitted[key] ?? null));
      const revalidate = (changed: boolean) => !old || changed || publishing;
      if (revalidate(spacesChanged)) assertInstructorAllowed(submitted, providerId, isAdmin);
      const provider = revalidate(false) ? await eligibleProvider(providerId, tx) : undefined;
      let categoryIds = old?.categoryIds ?? [];
      if (revalidate(old?.categoryId !== submitted.categoryId)) {
        const category = (await tx.get(db.doc(`serviceCategories/${safeId(submitted.categoryId)}`))).data();
        if (!category?.isActive || !category.parentId) throw new HttpsError("invalid-argument", "active_leaf_required");
        categoryIds = [submitted.categoryId, category.parentId];
      }
      if (submitted.venueId && submitted.state === "published" &&
        (venue?.isActive === false || venue?.partnerStatus !== "active")) {
        throw new HttpsError("failed-precondition", "venue_not_active");
      }
      const input = revalidate(spacesChanged) ?
        await withSpaces(submitted, async (path) => (await tx.get(db.doc(path))).data()) :
        keepDerived(submitted, old!);
      const existing = await tx.get(ref.collection("sessions"));
      const historical = await tx.get(db.collection("courseEnrollments").where("courseId", "==", id).limit(1));
      const hasBookings = !historical.empty || existing.docs.some((d) =>
        (d.data().occupied ?? 0) + (d.data().held ?? 0) > 0);
      // A booked course keeps the timezone its lessons were generated in: the location may change its own later,
      // and a name-only edit must not then trip booked_schedule_locked.
      if (hasBookings && old && input.venueId && (old.locationId ?? null) === input.locationId) {
        input.timezone = old.timezone;
      }
      const generated = generateSessions(input);
      if (input.state === "published" && generated[0].startsAt <= new Date() && (!old || old.state !== "published")) {
        throw new HttpsError("invalid-argument", "start_must_be_future");
      }
      if (hasBookings && old) {
        const frozen: (keyof CourseInput)[] = ["startDate", "startTime", "endDate", "recurrence", "interval",
          "weekdays", "timezone", "durationMinutes", "lessonPriceCents", "seriesPriceCents", "venueId",
          "locationId", "roomId", "instructorId", ...(input.venueId ? [] : ["location" as const]),
          ...(input.instructorId ? [] : ["instructor" as const])];
        // Place text and instructor name of a linked course follow the venue's records, so they may drift.
        if (frozen.some((key) => JSON.stringify(old[key] ?? null) !== JSON.stringify(input[key] ?? null))) {
          throw new HttpsError("failed-precondition", "booked_schedule_locked");
        }
      }
      const capacityChanged = !!old && old.capacity !== input.capacity;
      const priceOrCapacity = !!old && courseRevisionBumped(old, input);
      // A lesson's own capacity (set per lesson) survives edits that do not touch the course capacity.
      const capacityOf = (prior?: Session) => capacityChanged || prior?.capacity === undefined ?
        input.capacity : prior.capacity;
      // Only lessons still to come matter: past and cancelled ones keep the numbers they ended with.
      const upcoming = existing.docs.filter((d) => d.data().state === "scheduled" &&
        d.data().startsAt.toMillis() > Date.now());
      if (upcoming.some((d) => d.data().occupied + d.data().held > capacityOf(d.data() as Session))) {
        throw new HttpsError("failed-precondition", "capacity_below_bookings");
      }
      promoteSessionIds = upcoming.filter((d) => (d.data().waitlisted ?? 0) > 0 &&
        capacityOf(d.data() as Session) > d.data().capacity).map((d) => d.id);
      const serviceId = old?.serviceId ?? `course_${id}`;
      const actual = generated.map((s) => {
        const prior = existing.docs.find((d) => d.id === s.id)?.data() as Session | undefined;
        return prior && hasBookings ? { ...s, startsAt: prior.startsAt.toDate(), state: prior.state } :
          { ...s, state: "scheduled" };
      }).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      const next = actual.find((s) => s.startsAt > new Date() && s.state === "scheduled") ?? actual[actual.length - 1];
      const nextPrior = existing.docs.find((d) => d.id === next.id)?.data() as Session | undefined;
      // A lesson-level room or substitute (from manageCourseSession) survives while the course value is unchanged.
      const roomKept = !!old && (old.roomId ?? null) === input.roomId;
      const instructorKept = !!old && (old.instructorId ?? null) === input.instructorId;
      const written = generated.map((session) => {
        const previous = existing.docs.find((d) => d.id === session.id)?.data() as Session | undefined;
        const startsAt = previous && hasBookings ? previous.startsAt : Timestamp.fromDate(session.startsAt);
        const endsAt = previous && hasBookings ? previous.endsAt : Timestamp.fromDate(session.endsAt);
        const roomId = previous && roomKept ? previous.roomId ?? input.roomId : input.roomId;
        const locationId = previous && roomKept ? previous.locationId ?? input.locationId : input.locationId;
        const instructorId = previous && instructorKept ? previous.instructorId ?? input.instructorId :
          input.instructorId;
        // Text follows the course unless the lesson was moved to its own room or given a substitute.
        const ownInstructor = !!previous && instructorKept && (previous.instructorId ?? null) !== input.instructorId;
        const instructor = ownInstructor ? previous.instructor ?? input.instructor : input.instructor;
        const instructorName = ownInstructor ?
          previous.instructorName ?? previous.instructor ?? input.instructor : input.instructor;
        const ownRoom = !!previous && roomKept && !!previous.roomId && previous.roomId !== input.roomId;
        const state = previous?.state ?? "scheduled";
        const bumped = !!previous && state === "scheduled" && (priceOrCapacity || sessionRevisionBumped(
          { startsAt: previous.startsAt.toMillis(), endsAt: previous.endsAt.toMillis(),
            roomId: previous.roomId ?? null, instructorId: previous.instructorId ?? null },
          { startsAt: startsAt.toMillis(), endsAt: endsAt.toMillis(), roomId, instructorId }));
        return { id: session.id, data: {
          startsAt, endsAt, capacity: capacityOf(previous), occupied: previous?.occupied ?? 0,
          held: previous?.held ?? 0, state, instructor,
          location: ownRoom ? previous.location ?? input.location : input.location,
          courseId: id, venueId: input.venueId, locationId, roomId, instructorId,
          instructorName, listed: input.state === "published", waitlisted: previous?.waitlisted ?? 0,
          revision: (previous?.revision ?? 1) + (bumped ? 1 : 0),
        } };
      });
      // The lock documents are read here, so this comes before the first write.
      const before = old ? slotsOf(id, old, existing.docs.map((d) => ({ id: d.id, data: d.data() as Session }))) : [];
      // Stored slots of elapsed lessons are removed (before has them), but no new ones are taken for the past.
      const after = slotsOf(id, input, written, new Date());
      if (after.filter((slot) => lockPaths(slot).length).length > MAX_LOCKED_SESSIONS) {
        throw new HttpsError("failed-precondition", "locked_schedule_too_long", { fields: ["startDate", "endDate"] });
      }
      const { remove, add } = diffSlots(before, after);
      // A course that stops being published closes the waiting lists of its lessons (read now, written below).
      const clearWaitlists = input.state === "published" ? [] : await Promise.all(
        existing.docs.filter((d) => (d.data().waitlisted ?? 0) > 0 && generated.some((g) => g.id === d.id)).map((d) =>
          clearWaitlistInTx(tx, { ...old!, id }, d.id, "archived")));
      await updateScheduleLocks(tx, remove, add);
      tx.set(ref, { ...input, providerEligible: true, providerId,
        providerName: provider ? provider.fullName ?? provider.name ?? input.instructor : old!.providerName,
        serviceId, sessionIds: generated.map((s) => s.id), categoryIds,
        nextSessionId: next.id, nextAvailableSeats: capacityOf(nextPrior) - (nextPrior?.occupied ?? 0) -
          (nextPrior?.held ?? 0),
        firstStartsAt: Timestamp.fromDate(actual[0].startsAt), nextStartsAt: Timestamp.fromDate(next.startsAt),
        updatedAt: nowStamp(), ...(!old ? { createdAt: nowStamp() } : {}) });
      const newIds = new Set(generated.map((s) => s.id));
      for (const doc of existing.docs) if (!newIds.has(doc.id)) tx.delete(doc.ref);
      for (const { id: sessionId, data } of written) tx.set(ref.collection("sessions").doc(sessionId), data);
      // After the session writes, so the cleared counter is the last write to each lesson.
      clearWaitlists.forEach((clear) => clear());
      tx.set(db.doc(`instructors/${providerId}/services/${serviceId}`), {
        name: input.name, description: input.description, categoryId: input.categoryId,
        price: (input.lessonPriceCents ?? input.seriesPriceCents ?? 0) / 100,
        durationMinutes: input.durationMinutes, isActive: input.state === "published",
        kind: "group", courseId: id,
      }, { merge: true });
    });
    // The course is saved; a failed promotion is not the caller's problem (the maintenance sweep is the backstop).
    for (const sessionId of promoteSessionIds) {
      try {
        await promoteWaitlist(id, sessionId);
      } catch (error) {
        logger.error("waitlist promotion after saveCourse failed", { courseId: id, sessionId, error: String(error) });
      }
    }
    return { courseId: id };
  } catch (error) {
    return domainError(error);
  }
});

export * from "./enrollment";
export * from "./operations";
export * from "./quote";
export * from "./waitlist";
export * from "./checkout";
export * from "./maintenance";

type StoredSlots = Record<string, { start: number; end: number; courseName?: string }>;
type Conflict = {
  sessionId: string; kind: "room" | "instructor"; courseName: string; startsAt: string; endsAt: string;
};

/** Advisory only: reads the lock documents outside a transaction, so saveCourse stays the authority. */
async function lockConflicts(
  courseId: string | null, input: CourseInput, sessions: ReturnType<typeof generateSessions>
): Promise<Conflict[]> {
  const stamp = (date: Date) => ({ toDate: () => date });
  const slots = slotsOf(courseId ?? "preview", { state: "published", name: input.name }, sessions.map((s) => ({
    id: s.id, data: { startsAt: stamp(s.startsAt), endsAt: stamp(s.endsAt), state: "scheduled", venueId: input.venueId,
      locationId: input.locationId, roomId: input.roomId, instructorId: input.instructorId },
  })), new Date());
  const paths = [...new Set(slots.flatMap(lockPaths))];
  if (!paths.length) return [];
  const docs = new Map((await db.getAll(...paths.map((path) => db.doc(path))))
    .map((doc) => [doc.ref.path, (doc.data()?.slots ?? {}) as StoredSlots]));
  // The edited course's own slots (ids `${courseId}_${date}`) are about to be replaced, so they never conflict.
  const own = (slotId: string) => !!courseId && slotId.startsWith(`${courseId}_`) &&
    /^\d{4}-\d{2}-\d{2}$/.test(slotId.slice(courseId.length + 1));
  const conflicts: Conflict[] = [];
  for (const slot of slots) {
    const kinds = new Set<string>();
    for (const path of lockPaths(slot)) {
      const kind = path.includes("/room:") ? "room" : "instructor";
      if (kinds.has(kind)) continue;
      const clash = Object.entries(docs.get(path) ?? {}).find(([id, other]) => !own(id) && other.end > Date.now() &&
        other.start < slot.endsAt.getTime() && other.end > slot.startsAt.getTime());
      if (!clash) continue;
      kinds.add(kind);
      // Session ids are dates, so the slot id `${courseId}_${date}` ends with the session id.
      conflicts.push({ sessionId: slot.id.slice(-10), kind, courseName: clash[1].courseName ?? "",
        startsAt: new Date(clash[1].start).toISOString(), endsAt: new Date(clash[1].end).toISOString() });
    }
  }
  return conflicts;
}

export const previewCourse = onCall({ region }, async (req) => {
  const uid = uidOf(req.auth);
  try {
    const submitted = validateCourse(req.data.course);
    const courseId = req.data.courseId ? safeId(req.data.courseId) : null;
    if (submitted.venueId) {
      const venueId = safeId(submitted.venueId);
      const venue = (await db.doc(`venues/${venueId}`).get()).data();
      if (!venue || !hostsCourses(venue.type as VenueType) || !(await managesVenue(uid, venueId))) {
        throw new HttpsError("permission-denied", "venue_authorization_required");
      }
    }
    if (!submitted.venueId && submitted.instructorId) {
      const stored = courseId ? (await db.doc(`courses/${courseId}`).get()).data() as Course | undefined : undefined;
      if (courseId && !stored) throw new HttpsError("not-found", "course_not_found");
      const caller = (await db.doc(`users/${uid}`).get()).data();
      const isAdmin = ["admin", "superadmin"].includes(caller?.role);
      assertInstructorAllowed(submitted, stored?.providerId ?? uid, isAdmin);
      // The conflicts name other courses of this instructor: only someone who could save this course may read them.
      if (stored) await canManageCourse(uid, stored);
      else if (!isAdmin && !providerUsable((await db.doc(`instructors/${uid}`).get()).data())) {
        throw new HttpsError("permission-denied", "provider_unavailable");
      }
    }
    const input = await withSpaces(submitted, async (path) => (await db.doc(path).get()).data());
    const sessions = generateSessions(input);
    // Same bound as saveCourse: the conflict check reads up to four lock documents per lesson.
    if (sessions.filter((s) => s.endsAt.getTime() > Date.now()).length > MAX_LOCKED_SESSIONS &&
      (input.venueId || input.instructorId)) {
      throw new HttpsError("failed-precondition", "locked_schedule_too_long", { fields: ["startDate", "endDate"] });
    }
    return { sessions: sessions.map((s) => ({ id: s.id, startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString() })), conflicts: await lockConflicts(courseId, input, sessions) };
  } catch (error) {
    return domainError(error);
  }
});
export * from "./providerEligibility";
export * from "./notifications";
export * from "./participantInvitations";
