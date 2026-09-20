import { describe, it, expect, vi } from "vitest";

// ./reschedule pulls in ./notify and ../utils/roles, which touch admin.firestore() at import
// time. The guards under test are pure, so both are stubbed rather than initialising an app.
vi.mock("./notify", () => ({ notifyTransition: vi.fn() }));
vi.mock("../utils/roles", () => ({ getUserRoleInfo: vi.fn() }));

import {
  checkReschedulable,
  counterpartUids,
  rescheduleActorRole,
  rescheduledWindow,
  validateRescheduleRequest,
} from "./reschedule";

const NOW = new Date("2026-09-20T10:00:00Z");
/** A different instant from the fixture's own start, so a move is a real move. */
const LATER = new Date("2026-09-26T11:00:00Z");
const ts = (iso: string) => ({ toDate: () => new Date(iso) });

const booking = (over: Record<string, unknown> = {}) => ({
  userId: "client-1",
  instructorId: "trainer-1",
  status: "accepted",
  scheduledAt: ts("2026-09-25T09:00:00Z"),
  ...over,
});

describe("checkReschedulable", () => {
  it("lets the booking's client move it, handing back what the callable would re-derive", () => {
    expect(checkReschedulable(booking(), { uid: "client-1", isStaff: false }, LATER, NOW)).toEqual({
      ok: true,
      actorRole: "client",
      instructorId: "trainer-1",
      previousStart: new Date("2026-09-25T09:00:00Z"),
    });
  });

  it("lets the trainer and staff move it too", () => {
    expect(checkReschedulable(booking(), { uid: "trainer-1", isStaff: false }, LATER, NOW))
      .toMatchObject({ ok: true, actorRole: "trainer" });
    expect(checkReschedulable(booking(), { uid: "someone-else", isStaff: true }, LATER, NOW))
      .toMatchObject({ ok: true, actorRole: "staff" });
  });

  it("refuses anyone who is neither a participant nor staff", () => {
    expect(checkReschedulable(booking(), { uid: "stranger", isStaff: false }, LATER, NOW))
      .toEqual({ ok: false, reason: "permission_denied" });
  });

  it("refuses a booking that is no longer live", () => {
    for (const status of ["declined", "cancelled_by_client", "cancelled_by_trainer", "completed", "no_show"]) {
      expect(checkReschedulable(booking({ status }), { uid: "client-1", isStaff: false }, LATER, NOW))
        .toEqual({ ok: false, reason: "not_reschedulable" });
    }
  });

  it("refuses a paid session on its status, not its date: it is done, there is nothing to move", () => {
    // payment_confirmed only ever follows a completed session, so its start is in the past —
    // the status check has to fire first for the refusal to name the real reason.
    const paid = booking({ status: "payment_confirmed", scheduledAt: ts("2026-09-19T09:00:00Z") });
    expect(checkReschedulable(paid, { uid: "client-1", isStaff: false }, LATER, NOW))
      .toEqual({ ok: false, reason: "not_reschedulable" });
  });

  it("still moves bookings left on the legacy pre-migration statuses", () => {
    for (const status of ["requested", "pending", "confirmed", "in_progress"]) {
      expect(checkReschedulable(booking({ status }), { uid: "trainer-1", isStaff: false }, LATER, NOW))
        .toMatchObject({ ok: true });
    }
  });

  it("refuses a booking whose own start has already passed, whoever asks", () => {
    const past = booking({ scheduledAt: ts("2026-09-20T09:59:00Z") });
    expect(checkReschedulable(past, { uid: "client-1", isStaff: false }, LATER, NOW))
      .toEqual({ ok: false, reason: "past_booking" });
    expect(checkReschedulable(past, { uid: "staff", isStaff: true }, LATER, NOW))
      .toEqual({ ok: false, reason: "past_booking" });
  });

  it("refuses a booking with no readable start rather than guessing it is still ahead", () => {
    expect(checkReschedulable(booking({ scheduledAt: undefined }), { uid: "client-1", isStaff: false }, LATER, NOW))
      .toEqual({ ok: false, reason: "not_reschedulable" });
  });

  it("refuses a booking with no trainer: there is no schedule to validate a new start against", () => {
    for (const instructorId of [undefined, null, ""]) {
      expect(checkReschedulable(booking({ instructorId }), { uid: "client-1", isStaff: false }, LATER, NOW))
        .toEqual({ ok: false, reason: "not_reschedulable" });
    }
  });

  it("refuses a move to the instant the booking already has", () => {
    const sameInstant = new Date("2026-09-25T09:00:00Z");
    expect(checkReschedulable(booking(), { uid: "client-1", isStaff: false }, sameInstant, NOW))
      .toEqual({ ok: false, reason: "same_slot" });
  });

  it("checks who is asking before it says anything about the booking's state", () => {
    expect(checkReschedulable(booking({ status: "completed" }), { uid: "stranger", isStaff: false }, LATER, NOW))
      .toEqual({ ok: false, reason: "permission_denied" });
  });
});

describe("rescheduleActorRole", () => {
  it("reads a participant as themselves even when they are also staff", () => {
    expect(rescheduleActorRole(booking(), { uid: "client-1", isStaff: true })).toBe("client");
    expect(rescheduleActorRole(booking(), { uid: "trainer-1", isStaff: true })).toBe("trainer");
  });

  it("reads an outsider with the staff flag as staff, and anyone else as nobody", () => {
    expect(rescheduleActorRole(booking(), { uid: "ops", isStaff: true })).toBe("staff");
    expect(rescheduleActorRole(booking(), { uid: "stranger", isStaff: false })).toBeNull();
  });
});

describe("counterpartUids", () => {
  it("notifies the other side of the booking, and both sides when staff moved it", () => {
    expect(counterpartUids(booking(), "client")).toEqual(["trainer-1"]);
    expect(counterpartUids(booking(), "trainer")).toEqual(["client-1"]);
    expect(counterpartUids(booking(), "staff")).toEqual(["client-1", "trainer-1"]);
  });

  it("drops a missing counterpart instead of trying to notify nobody", () => {
    expect(counterpartUids(booking({ instructorId: null }), "client")).toEqual([]);
    expect(counterpartUids(booking({ instructorId: null }), "staff")).toEqual(["client-1"]);
  });
});

describe("rescheduledWindow", () => {
  const start = new Date("2026-09-25T09:00:00Z");

  it("ends exactly durationMinutes after the new start", () => {
    expect(rescheduledWindow({ durationMinutes: 45 }, start))
      .toEqual({ durationMinutes: 45, end: new Date("2026-09-25T09:45:00Z") });
  });

  it("falls back to a legacy `duration`, then to 60 minutes", () => {
    expect(rescheduledWindow({ duration: 90 }, start))
      .toEqual({ durationMinutes: 90, end: new Date("2026-09-25T10:30:00Z") });
    expect(rescheduledWindow({}, start))
      .toEqual({ durationMinutes: 60, end: new Date("2026-09-25T10:00:00Z") });
  });

  it("reads a stored length exactly as the slot engine does, string included", () => {
    expect(rescheduledWindow({ durationMinutes: "90" }, start).durationMinutes).toBe(90);
  });

  it("never ends a session before it starts", () => {
    for (const durationMinutes of [0, -30, NaN]) {
      expect(rescheduledWindow({ durationMinutes }, start))
        .toEqual({ durationMinutes: 60, end: new Date("2026-09-25T10:00:00Z") });
    }
  });
});

describe("validateRescheduleRequest", () => {
  it("accepts a document id and an ISO instant in the future", () => {
    expect(validateRescheduleRequest({ bookingId: "b1", startsAt: "2026-09-25T09:00:00.000Z" }, NOW))
      .toEqual({ bookingId: "b1", startsAt: new Date("2026-09-25T09:00:00.000Z") });
  });

  it("rejects a missing or path-like bookingId", () => {
    expect(() => validateRescheduleRequest({ startsAt: "2026-09-25T09:00:00Z" }, NOW)).toThrow(/bookingId/);
    expect(() => validateRescheduleRequest({ bookingId: "a/b", startsAt: "2026-09-25T09:00:00Z" }, NOW))
      .toThrow(/bookingId/);
    expect(() => validateRescheduleRequest({ bookingId: "x".repeat(129), startsAt: "2026-09-25T09:00:00Z" }, NOW))
      .toThrow(/bookingId/);
  });

  it("rejects a startsAt that is not an instant, or is not ahead of now", () => {
    expect(() => validateRescheduleRequest({ bookingId: "b1", startsAt: "domani alle 9" }, NOW))
      .toThrow(/startsAt/);
    expect(() => validateRescheduleRequest({ bookingId: "b1", startsAt: 1790000000000 }, NOW)).toThrow(/startsAt/);
    expect(() => validateRescheduleRequest({ bookingId: "b1", startsAt: "2026-09-20T09:59:00Z" }, NOW))
      .toThrow(/startsAt/);
  });

  it("rejects a payload that is not an object", () => {
    expect(() => validateRescheduleRequest(null, NOW)).toThrow(/payload/);
  });
});
